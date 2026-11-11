import assert from "node:assert/strict";
import { test } from "node:test";
import { crmFirstColumnsReady } from "./crmFirstSchemaGuard.js";

const ready = [
  { COLUMN_NAME: "id", IS_NULLABLE: "NO" },
  { COLUMN_NAME: "office_calculation_id", IS_NULLABLE: "NO" },
  { COLUMN_NAME: "office_project_id", IS_NULLABLE: "YES" },
];
test("projectless CRM drafts require nullable project field", () => {
  assert.equal(crmFirstColumnsReady(ready), true);
  assert.equal(crmFirstColumnsReady(ready.map(row => row.COLUMN_NAME === "office_project_id" ? { ...row, IS_NULLABLE: "NO" } : row)), false);
  assert.equal(crmFirstColumnsReady(ready.filter(row => row.COLUMN_NAME !== "office_calculation_id")), false);
  assert.equal(crmFirstColumnsReady([]), false);
});
