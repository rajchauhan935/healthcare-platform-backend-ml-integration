"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { generateKeyPairSync } = require("node:crypto");
const jwt = require("jsonwebtoken");

const {
  verifyAccessToken,
  ISSUER,
  AUDIENCES
} = require("./verify-access-token");

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

function makeToken(overrides = {}, options = {}) {
  return jwt.sign(
    {
      sub: "test-central-subject",
      token_type: "access",
      role: "patient",
      ...overrides
    },
    privateKey,
    {
      algorithm: "RS256",
      issuer: ISSUER,
      audience: AUDIENCES.booking,
      expiresIn: "5m",
      ...options
    }
  );
}

function verify(token, audience = AUDIENCES.booking) {
  return verifyAccessToken(token, {
    publicKey,
    audience
  });
}

test("accepts a valid booking access token", () => {
  const result = verify(makeToken());

  assert.equal(result.centralSubject, "test-central-subject");
  assert.equal(result.audience, AUDIENCES.booking);
  assert.equal(result.issuer, ISSUER);
});

test("rejects a missing token", () => {
  assert.throws(() => verify(""));
});

test("rejects a malformed token", () => {
  assert.throws(() => verify("not-a-jwt"));
});

test("rejects a refresh token", () => {
  assert.throws(() =>
    verify(makeToken({ token_type: "refresh" }))
  );
});

test("rejects an incorrect audience", () => {
  assert.throws(() =>
    verify(makeToken(), AUDIENCES.homecare)
  );
});

test("rejects an incorrect issuer", () => {
  const token = makeToken({}, {
    issuer: "untrusted-test-issuer"
  });

  assert.throws(() => verify(token));
});

test("rejects an expired token", () => {
  const token = makeToken({}, {
    expiresIn: -10
  });

  assert.throws(() => verify(token));
});

test("rejects an empty central subject", () => {
  assert.throws(() =>
    verify(makeToken({ sub: "" }))
  );
});

test("rejects a token signed by another key", () => {
  const otherKeys = generateKeyPairSync("rsa", {
    modulusLength: 2048
  });

  const token = jwt.sign(
    {
      sub: "test-central-subject",
      token_type: "access"
    },
    otherKeys.privateKey,
    {
      algorithm: "RS256",
      issuer: ISSUER,
      audience: AUDIENCES.booking,
      expiresIn: "5m"
    }
  );

  assert.throws(() => verify(token));
});

test("accepts a valid homecare access token", () => {
  const token = makeToken({}, {
    audience: AUDIENCES.homecare
  });

  const result = verify(token, AUDIENCES.homecare);

  assert.equal(result.centralSubject, "test-central-subject");
  assert.equal(result.audience, AUDIENCES.homecare);
});

test("rejects a missing public verification key", () => {
  assert.throws(() =>
    verifyAccessToken(makeToken(), {
      audience: AUDIENCES.booking
    })
  );
});

test("rejects an unsupported audience", () => {
  assert.throws(() =>
    verify(makeToken(), "unknown-service")
  );
});
