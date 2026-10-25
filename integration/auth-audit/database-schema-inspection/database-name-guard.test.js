"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EXPECTED_DATABASES,
  expectedDatabase,
  assertDatabaseName
} = require("./database-name-guard");

test("Core database name is correct", () => {
  assert.equal(expectedDatabase("core"), "our_healthplatform");
});

test("Booking database name is correct", () => {
  assert.equal(expectedDatabase("booking"), "kartik_healthplatform");
});

test("Homecare database name is correct", () => {
  assert.equal(expectedDatabase("homecare"), "healthplatform");
});

test("accepts all three correct database targets", () => {
  for (const [service, database] of Object.entries(EXPECTED_DATABASES)) {
    assert.equal(assertDatabaseName(service, database), true);
  }
});

test("rejects Booking database used as Core", () => {
  assert.throws(() =>
    assertDatabaseName("core", "kartik_healthplatform")
  );
});

test("rejects Homecare database used as Booking", () => {
  assert.throws(() =>
    assertDatabaseName("booking", "healthplatform")
  );
});

test("rejects Core database used as Homecare", () => {
  assert.throws(() =>
    assertDatabaseName("homecare", "our_healthplatform")
  );
});

test("rejects unsupported service", () => {
  assert.throws(() => expectedDatabase("unknown"));
});

test("rejects missing database name", () => {
  assert.throws(() => assertDatabaseName("core", undefined));
});

test("rejects empty database name", () => {
  assert.throws(() => assertDatabaseName("booking", ""));
});

test("rejects database names with unexpected whitespace", () => {
  assert.throws(() =>
    assertDatabaseName("core", "our_healthplatform ")
  );
});

test("rejects case-altered database names", () => {
  assert.throws(() =>
    assertDatabaseName("homecare", "Healthplatform")
  );
});
