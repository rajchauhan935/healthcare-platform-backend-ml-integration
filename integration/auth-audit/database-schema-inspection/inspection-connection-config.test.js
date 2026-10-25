"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  inspectionConnectionConfig
} = require("./inspection-connection-config");

const dummy = "postgresql://example.invalid/test";

test("accepts a configured Core inspection URL", () => {
  const result = inspectionConnectionConfig("core", {
    PG_SCHEMA_INSPECTION_URL: dummy
  });

  assert.equal(result.connectionString, dummy);
});

test("accepts a configured Booking inspection URL", () => {
  const result = inspectionConnectionConfig("booking", {
    PG_SCHEMA_INSPECTION_URL: dummy
  });

  assert.equal(result.connectionString, dummy);
});

test("accepts a configured Homecare inspection URL", () => {
  const result = inspectionConnectionConfig("homecare", {
    PG_SCHEMA_INSPECTION_URL: dummy
  });

  assert.equal(result.connectionString, dummy);
});

test("rejects missing configuration", () => {
  assert.throws(() =>
    inspectionConnectionConfig("core", {})
  );
});

test("rejects empty configuration", () => {
  assert.throws(() =>
    inspectionConnectionConfig("booking", {
      PG_SCHEMA_INSPECTION_URL: ""
    })
  );
});

test("rejects unsupported URL schemes", () => {
  assert.throws(() =>
    inspectionConnectionConfig("homecare", {
      PG_SCHEMA_INSPECTION_URL: "http://example.invalid"
    })
  );
});

test("rejects unsupported services", () => {
  assert.throws(() =>
    inspectionConnectionConfig("unknown", {
      PG_SCHEMA_INSPECTION_URL: dummy
    })
  );
});

test("returns frozen configuration", () => {
  const result = inspectionConnectionConfig("core", {
    PG_SCHEMA_INSPECTION_URL: dummy
  });

  assert.equal(Object.isFrozen(result), true);
});

test("uses a five-second connection timeout", () => {
  const result = inspectionConnectionConfig("core", {
    PG_SCHEMA_INSPECTION_URL: dummy
  });

  assert.equal(result.connectionTimeoutMillis, 5000);
});
