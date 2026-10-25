"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const coreDir = path.resolve(
  __dirname,
  "../../../services/core-backend/apps/backend"
);

const strategyPath = path.join(
  coreDir,
  "src/modules/auth/strategies/jwt.strategy.js"
);

const jwt = require(
  require.resolve("jsonwebtoken", { paths: [coreDir] })
);

const original = {
  access: process.env.JWT_ACCESS_SECRET,
  refresh: process.env.JWT_REFRESH_SECRET,
  accessExpiry: process.env.JWT_ACCESS_EXPIRES_IN,
  refreshExpiry: process.env.JWT_REFRESH_EXPIRES_IN
};

process.env.JWT_ACCESS_SECRET =
  crypto.randomBytes(48).toString("hex");

process.env.JWT_REFRESH_SECRET =
  crypto.randomBytes(48).toString("hex");

process.env.JWT_ACCESS_EXPIRES_IN = "5m";
process.env.JWT_REFRESH_EXPIRES_IN = "1h";

const core = require(strategyPath);

const testUser = Object.freeze({
  id: "isolated-test-user",
  role: "patient"
});

test("Core exposes four JWT operations", () => {
  for (const name of [
    "createAccessToken",
    "createRefreshToken",
    "verifyAccessToken",
    "verifyRefreshToken"
  ]) {
    assert.equal(typeof core[name], "function");
  }
});

test("Core creates and verifies an access token", () => {
  const token = core.createAccessToken(testUser);
  const payload = core.verifyAccessToken(token);

  assert.equal(payload.sub, testUser.id);
  assert.equal(payload.role, testUser.role);
});

test("Core creates and verifies a refresh token", () => {
  const token = core.createRefreshToken(testUser);
  const payload = core.verifyRefreshToken(token);

  assert.equal(payload.sub, testUser.id);
});

test("Core rejects a malformed access token", () => {
  assert.throws(() =>
    core.verifyAccessToken("invalid-test-token")
  );
});

test("Core rejects an incorrectly signed access token", () => {
  const token = jwt.sign(
    { sub: testUser.id },
    crypto.randomBytes(48).toString("hex"),
    { algorithm: "HS256", expiresIn: "5m" }
  );

  assert.throws(() => core.verifyAccessToken(token));
});

test("Core rejects an expired access token", () => {
  const token = jwt.sign(
    { sub: testUser.id },
    process.env.JWT_ACCESS_SECRET,
    { algorithm: "HS256", expiresIn: -10 }
  );

  assert.throws(() => core.verifyAccessToken(token));
});

test("Core separates refresh and access verification", () => {
  const refresh = core.createRefreshToken(testUser);
  const access = core.createAccessToken(testUser);

  assert.throws(() => core.verifyAccessToken(refresh));
  assert.throws(() => core.verifyRefreshToken(access));
});

process.on("exit", () => {
  for (const [name, value] of [
    ["JWT_ACCESS_SECRET", original.access],
    ["JWT_REFRESH_SECRET", original.refresh],
    ["JWT_ACCESS_EXPIRES_IN", original.accessExpiry],
    ["JWT_REFRESH_EXPIRES_IN", original.refreshExpiry]
  ]) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});
