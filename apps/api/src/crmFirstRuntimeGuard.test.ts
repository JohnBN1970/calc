import assert from "node:assert/strict";
import { test } from "node:test";
import { crmFirstRuntimeReady } from "./crmFirstRuntimeGuard.js";

const valid = {
  CALC_CRM_FIRST_LAUNCH_ENABLED: "enabled",
  CALC_OFFICE_GRANT_ENFORCEMENT: "enabled",
  CALC_CRM_FIRST_SCHEMA_VERIFIED: "enabled",
  NODE_ENV: "production",
  CALC_OFFICE_TEST_DATABASE: "isolated_calc_test_empty",
  MYSQL_DATABASE: "isolated_calc_test_empty",
  OFFICE_API_BASE_URL: "https://brebobv.nl/office-test",
  OFFICE_CALC_GRANT_VALIDATION_URL: "https://brebobv.nl/api/workbench/v1/calculation-grants/validate",
  BREBO_CALC_SHARED_SECRET: "launch-only-0123456789abcdef0123456789",
  CALC_SESSION_SECRET: "session-only-0123456789abcdef0123456789",
};
test("isolated CRM-first launch runtime configuration can pass", () => {
  assert.equal(crmFirstRuntimeReady(valid), true);
});
test("Office-test grant endpoint is accepted without unverified root rewrite", () => {
  assert.equal(crmFirstRuntimeReady({
    ...valid,
    OFFICE_CALC_GRANT_VALIDATION_URL: "https://brebobv.nl/office-test/api/workbench/v1/calculation-grants/validate"
  }), true);
  assert.equal(crmFirstRuntimeReady({
    ...valid,
    OFFICE_CALC_GRANT_VALIDATION_URL: "https://brebobv.nl/office-test/api/workbench/v1/calculation-grants/validate?skip=true"
  }), false);
});
test("foreign validation endpoints are rejected even with correct route", () => {
  assert.equal(crmFirstRuntimeReady({
    ...valid,
    OFFICE_CALC_GRANT_VALIDATION_URL: "https://foreign.example.test/office-test/api/workbench/v1/calculation-grants/validate"
  }), false);
});
test("production and restore databases can never be used for CRM-first", () => {
  for (const database of ["u213420663_calc", "u213420663_calc_restore", "u213420663_office_test"]) {
    assert.equal(crmFirstRuntimeReady({ ...valid, CALC_OFFICE_TEST_DATABASE: database, MYSQL_DATABASE: database }), false);
  }
});
test("missing isolation, enforcement, secrets or HTTPS must block", () => {
  for (const key of Object.keys(valid)) {
    const env = { ...valid, [key]: "" };
    assert.equal(crmFirstRuntimeReady(env), false, key);
  }
  assert.equal(crmFirstRuntimeReady({ ...valid, CALC_RUN_MIGRATIONS: "1" }), false);
  assert.equal(crmFirstRuntimeReady({ ...valid, CALC_IMPORT_EXISTING_DATA: "0" }), false);
  assert.equal(crmFirstRuntimeReady({ ...valid, CALC_SESSION_SECRET: valid.BREBO_CALC_SHARED_SECRET }), false);
  assert.equal(crmFirstRuntimeReady({ ...valid, OFFICE_CALC_GRANT_VALIDATION_URL: "http://brebobv.nl/api/workbench/v1/calculation-grants/validate" }), false);
  assert.equal(crmFirstRuntimeReady({ ...valid, CALC_OFFICE_TEST_DATABASE: "isolated_calc_test_empty", MYSQL_DATABASE: "u213420663_calc" }), false);
});
