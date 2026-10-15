import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { parseIndependentOfficeSession } from "./independentOfficeSession.js";

const secret = "local-test-secret";
const now = Math.floor(Date.now() / 1000);
const session = {
  v: 2, grantRef: "a".repeat(64), calculationId: 1, officeCalculationId: 42,
  officeProjectId: null, actorId: "office@example.com", exp: now + 60,
};
function token(payload: unknown): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded + "." + createHmac("sha256", secret).update(encoded).digest("hex");
}
test("accepts v2 projectless Office session", () => {
  assert.deepEqual(parseIndependentOfficeSession(token(session), secret, now), session);
});
test("rejects tampered, expired, missing grant and invalid actor sessions", () => {
  assert.equal(parseIndependentOfficeSession(token(session), "wrong", now), null);
  assert.equal(parseIndependentOfficeSession(token(session), secret, now + 61), null);
  assert.equal(parseIndependentOfficeSession(token({ ...session, grantRef: "" }), secret, now), null);
  assert.equal(parseIndependentOfficeSession(token({ ...session, actorId: "" }), secret, now), null);
  assert.equal(parseIndependentOfficeSession(token({ ...session, officeProjectId: 0 }), secret, now), null);
  assert.equal(parseIndependentOfficeSession("x".repeat(4097), secret, now), null);
});
