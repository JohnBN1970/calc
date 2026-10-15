import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { parseIndependentOfficeLaunch, signIndependentOfficeLaunch, type IndependentOfficeLaunch } from "./independentOfficeLaunch.js";

const secret = "local-test-secret";
const now = Math.floor(Date.now() / 1000);
const launch: IndependentOfficeLaunch = {
  v: 2, grant_ref: "a".repeat(64), calculation_id: 42, project_id: null,
  actor_id: "office-user@example.com", exp: now + 120, nonce: randomBytes(16).toString("hex"),
};

test("v2 accepts independent Office string identity and projectless draft", () => {
  const token = signIndependentOfficeLaunch(launch, secret);
  assert.deepEqual(parseIndependentOfficeLaunch(token, secret, now), launch);
});

test("v2 rejects tampering and wrong signing secret", () => {
  const token = signIndependentOfficeLaunch(launch, secret);
  assert.throws(() => parseIndependentOfficeLaunch(token, "wrong-secret", now));
  assert.throws(() => parseIndependentOfficeLaunch(token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"), secret, now));
});

test("v2 rejects expired credentials", () => {
  const token = signIndependentOfficeLaunch(launch, secret);
  assert.throws(() => parseIndependentOfficeLaunch(token, secret, now + 121));
});

test("v2 rejects missing grant and invalid calculation", () => {
  assert.throws(() => signIndependentOfficeLaunch({ ...launch, grant_ref: "" }, secret));
  assert.throws(() => signIndependentOfficeLaunch({ ...launch, calculation_id: 0 }, secret));
});
