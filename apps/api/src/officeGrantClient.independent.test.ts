import assert from "node:assert/strict";
import { test } from "node:test";
import { isOfficeGrantActive } from "./officeGrantClient.js";

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
