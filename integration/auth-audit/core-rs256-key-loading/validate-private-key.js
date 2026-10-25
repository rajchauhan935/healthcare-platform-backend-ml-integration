"use strict";

const { createPrivateKey } = require("node:crypto");

function validatePrivateKey(privateKey) {
  if (typeof privateKey !== "string" || !privateKey.trim()) {
    throw new Error("Private signing key is required");
  }

  let keyObject;

  try {
    keyObject = createPrivateKey(privateKey);
  } catch {
    throw new Error("Invalid private signing key");
  }

  if (
    keyObject.type !== "private" ||
    keyObject.asymmetricKeyType !== "rsa"
  ) {
    throw new Error("RSA private signing key required");
  }

  const bits = keyObject.asymmetricKeyDetails?.modulusLength;

  if (!Number.isInteger(bits) || bits < 2048) {
    throw new Error("RSA private key must be at least 2048 bits");
  }

  return keyObject;
}

module.exports = {
  validatePrivateKey
};
