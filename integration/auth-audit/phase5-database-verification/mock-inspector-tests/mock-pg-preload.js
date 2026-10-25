"use strict";

const fs = require("node:fs");
const Module = require("node:module");

const originalLoad = Module._load;
const scenario = process.env.MOCK_INSPECTION_SCENARIO;
const traceFile = process.env.MOCK_INSPECTION_TRACE;

if (!traceFile || !scenario) {
  throw new Error("Mock test configuration missing");
}

function record(event) {
  fs.appendFileSync(traceFile, event + "\n");
}

class FakeClient {
  constructor(config) {
    if (config.connectionTimeoutMillis !== 5000) {
      throw new Error("Unexpected connection timeout");
    }
    record("construct");
  }

  async connect() {
    record("connect");
  }

  async query(sql) {
    const text = sql.trim();

    if (text === "BEGIN READ ONLY") {
      record("begin");
      return { rows: [], rowCount: 0 };
    }

    if (text === "ROLLBACK") {
      record("rollback");
      return { rows: [], rowCount: 0 };
    }

    if (text.includes("current_database()")) {
      record("identity");

      return {
        rows: [{
          database_name:
            scenario === "wrong-database"
              ? "incorrect_database"
              : "kartik_healthplatform",
          read_only: scenario === "not-read-only" ? "off" : "on",
          is_superuser: scenario === "superuser"
        }],
        rowCount: 1
      };
    }

    if (text.includes("information_schema.columns")) {
      record("metadata");

      if (scenario === "metadata-error") {
        throw new Error("Synthetic metadata failure");
      }

      return {
        rows: [{
          table_schema: "public",
          table_name: "users",
          column_name: "id",
          data_type: "integer",
          udt_name: "int4",
          is_nullable: "NO"
        }],
        rowCount: 1
      };
    }

    record("unexpected-query");
    throw new Error("Unexpected query");
  }

  async end() {
    record("end");
  }
}

Module._load = function(request, parent, isMain) {
  if (
    typeof request === "string" &&
    /(?:^|[\\/])node_modules[\\/]pg(?:[\\/]|$)/.test(request)
  ) {
    record("mock-pg-loaded");
    return { Client: FakeClient };
  }

  return originalLoad.apply(this, arguments);
};
