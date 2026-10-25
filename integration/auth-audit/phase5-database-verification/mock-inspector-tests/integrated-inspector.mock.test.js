"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const preload = path.join(__dirname, "mock-pg-preload.js");

const inspector = path.resolve(
  __dirname,
  "../../database-schema-inspection/inspect-schema-integrated.js"
);

function runScenario(scenario) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "hp-inspection-mock-")
  );

  try {
    const traceFile = path.join(directory, "trace.txt");

    const env = {
      ...process.env,
      PG_SCHEMA_INSPECTION_URL:
        "postgresql://example.invalid/synthetic_test",
      MOCK_INSPECTION_SCENARIO: scenario,
      MOCK_INSPECTION_TRACE: traceFile
    };

    delete env.NODE_OPTIONS;

    const result = spawnSync(
      process.execPath,
      ["--require", preload, inspector, "booking"],
      {
        env,
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true
      }
    );

    if (result.error) {
      throw result.error;
    }

    const trace = fs.existsSync(traceFile)
      ? fs.readFileSync(traceFile, "utf8").trim().split(/\r?\n/)
      : [];

    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      trace
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const normalSequence = [
  "mock-pg-loaded",
  "construct",
  "connect",
  "begin",
  "identity",
  "metadata",
  "rollback",
  "end"
];

test("successful inspection follows the expected query order", () => {
  const result = runScenario("success");

  assert.equal(result.status, 0);
  assert.deepEqual(result.trace, normalSequence);
  assert.match(result.stdout, /DATABASE VERIFIED: booking/);
  assert.match(result.stdout, /SCHEMA METADATA ROWS: 1/);
});

test("database mismatch rejects before metadata access", () => {
  const result = runScenario("wrong-database");

  assert.notEqual(result.status, 0);
  assert.deepEqual(result.trace, [
    "mock-pg-loaded",
    "construct",
    "connect",
    "begin",
    "identity",
    "rollback",
    "end"
  ]);
  assert.equal(result.stdout, "");
});

test("superuser connection rejects before metadata access", () => {
  const result = runScenario("superuser");

  assert.notEqual(result.status, 0);
  assert.equal(result.trace.includes("metadata"), false);
  assert.equal(result.trace.includes("rollback"), true);
  assert.equal(result.stdout, "");
});

test("non-read-only transaction rejects before metadata access", () => {
  const result = runScenario("not-read-only");

  assert.notEqual(result.status, 0);
  assert.equal(result.trace.includes("metadata"), false);
  assert.equal(result.trace.includes("rollback"), true);
  assert.equal(result.stdout, "");
});

test("metadata query failure still attempts rollback", () => {
  const result = runScenario("metadata-error");

  assert.notEqual(result.status, 0);
  assert.deepEqual(result.trace, normalSequence);
  assert.equal(result.stdout, "");
  assert.match(
    result.stderr,
    /Integrated schema inspection rejected or unavailable/
  );
});
