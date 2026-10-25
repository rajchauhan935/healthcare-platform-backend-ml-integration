"use strict";

const jwt = require("jsonwebtoken");

const ISSUER = "health-platform-core";

const AUDIENCES = Object.freeze({
  booking: "health-platform-booking",
  homecare: "health-platform-homecare"
});

function createAccessToken(identity, options = {}) {
  const { privateKey, audience } = options;

  if (!identity || typeof identity !== "object") {
    throw new Error("Central identity is required");
  }

  if (typeof identity.sub !== "string" || !identity.sub.trim()) {
    throw new Error("Valid central subject required");
  }

  if (typeof privateKey !== "string" || !privateKey.trim()) {
    throw new Error("Private signing key is required");
  }

  if (!Object.values(AUDIENCES).includes(audience)) {
    throw new Error("Unsupported token audience");
  }

  const payload = {
    sub: identity.sub,
    token_type: "access"
  };

  if (typeof identity.role === "string" && identity.role.trim()) {
    payload.role = identity.role;
  }

  return jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    issuer: ISSUER,
    audience,
    expiresIn: "5m"
  });
}

module.exports = {
  createAccessToken,
  ISSUER,
  AUDIENCES
};
