"use strict";

const jwt = require("jsonwebtoken");

const ISSUER = "health-platform-core";

const AUDIENCES = Object.freeze({
  booking: "health-platform-booking",
  homecare: "health-platform-homecare"
});

function verifyAccessToken(token, options = {}) {
  const { publicKey, audience } = options;

  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Access token is required");
  }

  if (typeof publicKey !== "string" || !publicKey.trim()) {
    throw new Error("Public verification key is required");
  }

  if (!Object.values(AUDIENCES).includes(audience)) {
    throw new Error("Unsupported token audience");
  }

  const payload = jwt.verify(token, publicKey, {
    algorithms: ["RS256"],
    issuer: ISSUER,
    audience,
    ignoreExpiration: false
  });

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid token payload");
  }

  if (payload.token_type !== "access") {
    throw new Error("Access token type required");
  }

  if (typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new Error("Valid central subject required");
  }

  if (
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("Token timestamps required");
  }

  return Object.freeze({
    centralSubject: payload.sub,
    audience: payload.aud,
    issuer: payload.iss,
    role: payload.role ?? null
  });
}

module.exports = {
  verifyAccessToken,
  ISSUER,
  AUDIENCES
};
