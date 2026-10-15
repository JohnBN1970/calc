import assert from "node:assert/strict";
import { test } from "node:test";
process.env.MYSQL_PASSWORD ??= "test-only-not-used";
process.env.OFFICE_API_BASE_URL ??= "https://office.example.test";
process.env.BREBO_CALC_SHARED_SECRET ??= "test-only-0123456789abcdef0123456789abcdef";
process.env.CALC_SESSION_SECRET ??= "test-only-0123456789abcdef0123456789abcdef";
const { isOfficeGrantActive } = await import("./officeGrantClient.js");

test("rejects invalid independent Office grant before network", async () => {
  const endpoint = "https://office.example.com/api/workbench/v1/calculation-grants/validate";
  assert.equal(await isOfficeGrantActive({
    reference: "x".repeat(64), actor_id: "office-user", project_id: null, calculation_id: 1,
  }, endpoint), false);
  assert.equal(await isOfficeGrantActive({
    reference: "a".repeat(64), actor_id: "", project_id: null, calculation_id: 1,
  }, endpoint), false);
  assert.equal(await isOfficeGrantActive({
    reference: "a".repeat(64), actor_id: "office-user", project_id: -1, calculation_id: 1,
  }, endpoint), false);
  assert.equal(await isOfficeGrantActive({
    reference: "a".repeat(64), actor_id: "office-user", project_id: null, calculation_id: 0,
  }, endpoint), false);
});
