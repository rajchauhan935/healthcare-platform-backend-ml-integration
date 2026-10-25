"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync } = require("node:crypto");

const {
  createAccessToken,
  AUDIENCES
} = require("./create-access-token");

const {
  verifyAccessToken
} = require("../shared-jwt/verify-access-token");

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem"
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem"
  }
});

const identity = Object.freeze({
  sub: "isolated-central-subject",
  role: "patient"
});

function issue(audience) {
  return createAccessToken(identity, {
    privateKey,
    audience
  });
}

function verify(token, audience, key = publicKey) {
  return verifyAccessToken(token, {
    publicKey: key,
    audience
  });
}

test("Booking accepts a centrally issued access token", () => {
  const result = verify(
    issue(AUDIENCES.booking),
    AUDIENCES.booking
  );

  assert.equal(result.centralSubject, identity.sub);
});

test("Homecare accepts a centrally issued access token", () => {
  const result = verify(
    issue(AUDIENCES.homecare),
    AUDIENCES.homecare
  );

  assert.equal(result.centralSubject, identity.sub);
});

test("Booking token is rejected for Homecare", () => {
  assert.throws(() =>
    verify(issue(AUDIENCES.booking), AUDIENCES.homecare)
  );
});

test("Homecare token is rejected for Booking", () => {
  assert.throws(() =>
    verify(issue(AUDIENCES.homecare), AUDIENCES.booking)
  );
});

test("Issuer rejects unsupported audiences", () => {
  assert.throws(() =>
    issue("unsupported-service")
  );
});

test("Issuer rejects an empty central subject", () => {
  assert.throws(() =>
    createAccessToken(
      { sub: "" },
      { privateKey, audience: AUDIENCES.booking }
    )
  );
});

test("Verifier rejects a different signing key", () => {
  const other = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem"
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem"
    }
  });

  assert.throws(() =>
    verify(
      issue(AUDIENCES.booking),
      AUDIENCES.booking,
      other.publicKey
    )
  );
});

test("Issuer rejects a missing private key", () => {
  assert.throws(() =>
    createAccessToken(identity, {
      audience: AUDIENCES.booking
    })
  );
});
