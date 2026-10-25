"use strict";

const EXPECTED_DATABASES = Object.freeze({
  core: "our_healthplatform",
  booking: "kartik_healthplatform",
  homecare: "healthplatform"
});

function expectedDatabase(service) {
  if (
    typeof service !== "string" ||
    !Object.prototype.hasOwnProperty.call(EXPECTED_DATABASES, service)
  ) {
    throw new Error("Unsupported database service");
  }

  return EXPECTED_DATABASES[service];
}

function assertDatabaseName(service, actualDatabase) {
  const expected = expectedDatabase(service);

  if (
    typeof actualDatabase !== "string" ||
    actualDatabase !== expected
  ) {
    throw new Error("Database target mismatch");
  }

  return true;
}

module.exports = {
  EXPECTED_DATABASES,
  expectedDatabase,
  assertDatabaseName
};
