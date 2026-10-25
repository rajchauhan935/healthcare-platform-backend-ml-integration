"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveLocalIdentity
} = require("./resolve-local-identity");

const identity = Object.freeze({
  centralSubject: "central-user-100",
  role: "patient"
});

function mapping(service, localAccountId) {
  return {
    service,
    centralSubject: identity.centralSubject,
    localAccountId,
    localRole: "patient",
    active: true
  };
}

test("resolves an explicit Booking mapping", () => {
  const result = resolveLocalIdentity(
    identity,
    mapping("booking", "booking-user-900"),
    "booking"
  );

  assert.equal(result.centralSubject, "central-user-100");
  assert.equal(result.localAccountId, "booking-user-900");
  assert.equal(result.service, "booking");
});

test("resolves an explicit Homecare mapping", () => {
  const result = resolveLocalIdentity(
    identity,
    mapping("homecare", "homecare-user-700"),
    "homecare"
  );

  assert.equal(result.localAccountId, "homecare-user-700");
  assert.equal(result.service, "homecare");
});

test("rejects a missing mapping", () => {
  assert.throws(() =>
    resolveLocalIdentity(identity, null, "booking")
  );
});

test("rejects an incorrect central subject", () => {
  const record = mapping("booking", "booking-user-900");
  record.centralSubject = "different-central-user";

  assert.throws(() =>
    resolveLocalIdentity(identity, record, "booking")
  );
});

test("rejects a Booking mapping used for Homecare", () => {
  assert.throws(() =>
    resolveLocalIdentity(
      identity,
      mapping("booking", "booking-user-900"),
      "homecare"
    )
  );
});

test("rejects an inactive mapping", () => {
  const record = mapping("booking", "booking-user-900");
  record.active = false;

  assert.throws(() =>
    resolveLocalIdentity(identity, record, "booking")
  );
});

test("rejects a missing local account ID", () => {
  const record = mapping("booking", "");

  assert.throws(() =>
    resolveLocalIdentity(identity, record, "booking")
  );
});

test("rejects a missing local role", () => {
  const record = mapping("booking", "booking-user-900");
  delete record.localRole;

  assert.throws(() =>
    resolveLocalIdentity(identity, record, "booking")
  );
});

test("rejects an unsupported service", () => {
  assert.throws(() =>
    resolveLocalIdentity(
      identity,
      mapping("booking", "booking-user-900"),
      "unknown-service"
    )
  );
});

test("uses the explicit local role instead of token role", () => {
  const record = mapping("booking", "booking-user-900");
  record.localRole = "booking-member";

  const result = resolveLocalIdentity(
    identity,
    record,
    "booking"
  );

  assert.equal(result.localRole, "booking-member");
  assert.notEqual(result.localRole, identity.role);
  assert.equal(Object.isFrozen(result), true);
});
