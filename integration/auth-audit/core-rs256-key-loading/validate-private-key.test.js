"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync } = require("node:crypto");

const {
  validatePrivateKey
} = require("./validate-private-key");

function generate(bits) {
  return generateKeyPairSync("rsa", {
    modulusLength: bits,
    publicKeyEncoding: {
      type: "spki",
      format: "pem"
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem"
    }
  });
}

test("accepts a 2048-bit RSA private key", () => {
  const pair = generate(2048);
  const result = validatePrivateKey(pair.privateKey);

  assert.equal(result.type, "private");
  assert.equal(result.asymmetricKeyType, "rsa");
});

test("rejects a missing private key", () => {
  assert.throws(() => validatePrivateKey(undefined));
});

test("rejects an empty private key", () => {
  assert.throws(() => validatePrivateKey(""));
});

test("rejects malformed private-key data", () => {
  assert.throws(() => validatePrivateKey("invalid-key-data"));
});

test("rejects an RSA public key used as a private key", () => {
  const pair = generate(2048);

  assert.throws(() => validatePrivateKey(pair.publicKey));
});

test("rejects an RSA private key below 2048 bits", () => {
  const pair = generate(1024);

  assert.throws(() => validatePrivateKey(pair.privateKey));
});

test("rejects an EC private key", () => {
  const pair = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem"
    },
    publicKeyEncoding: {
      type: "spki",
      format: "pem"
    }
  });

  assert.throws(() => validatePrivateKey(pair.privateKey));
});
