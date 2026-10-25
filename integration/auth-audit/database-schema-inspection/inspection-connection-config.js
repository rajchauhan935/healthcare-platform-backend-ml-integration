"use strict";

const { expectedDatabase } = require("./database-name-guard");

function inspectionConnectionConfig(service, env = process.env) {
  expectedDatabase(service);

  const connectionString = env.PG_SCHEMA_INSPECTION_URL;

  if (
    typeof connectionString !== "string" ||
    connectionString.trim().length === 0
  ) {
    throw new Error("Dedicated inspection connection is required");
  }

  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    throw new Error("Inspection connection must use a PostgreSQL URL");
  }

  return Object.freeze({
    connectionString,
    connectionTimeoutMillis: 5000,
    application_name: "health_platform_schema_inspection"
  });
}

module.exports = { inspectionConnectionConfig };
