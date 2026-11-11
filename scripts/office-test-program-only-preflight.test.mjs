import test from "node:test";
import assert from "node:assert/strict";
import { validateOfficeTestProgramOnly } from "./office-test-program-only-preflight.mjs";
const base = () => ({
  CALC_DEPLOY_SCOPE: "office-test-program-only",
  CALC_BASE_PATH: "/office-test/calc-app",
  VITE_CALC_BASE_PATH: "/office-test/calc-app",
  CALC_OFFICE_GRANT_ENFORCEMENT: "enabled",
  NODE_ENV: "production",
  CALC_OFFICE_TEST_DATABASE: "brebo_calc_isolated_test",
  MYSQL_DATABASE: "brebo_calc_isolated_test",
  OFFICE_API_BASE_URL: "https://brebobv.nl/office-test",
  OFFICE_CALC_GRANT_VALIDATION_URL: "https://brebobv.nl/office-test/calc/grants/validate",
  MYSQL_PASSWORD: "a".repeat(32),
  BREBO_CALC_SHARED_SECRET: "b".repeat(32),
  CALC_SESSION_SECRET: "c".repeat(32)
});
test("valid isolated program-only configuration", () => assert.deepEqual(validateOfficeTestProgramOnly(base()), []));
test("denies accidental existing data import", () => {
 const config=base();config.CALC_IMPORT_EXISTING_DATA="no";
 assert.ok(validateOfficeTestProgramOnly(config).some(x=>x.includes("Imports")));
});
test("denies old Calc and Office databases", () => {
 for(const name of ["u213420663_calc","u213420663_calc_restore","u213420663_office_test"]) {
   const config=base();config.MYSQL_DATABASE=name;config.CALC_OFFICE_TEST_DATABASE=name;
   assert.ok(validateOfficeTestProgramOnly(config).some(x=>x.includes("forbidden")));
 }
});
test("denies missing live Office grant checking", () => {
 const config=base();config.CALC_OFFICE_GRANT_ENFORCEMENT="disabled";
 assert.ok(validateOfficeTestProgramOnly(config).some(x=>x.includes("authorization")));
});
test("denies mismatched API/web prefixes and absent explicit scope", () => {
 const config=base();config.VITE_CALC_BASE_PATH="/";delete config.CALC_DEPLOY_SCOPE;
 assert.ok(validateOfficeTestProgramOnly(config).length>=2);
});
test("denies unsafe HTTP validation and shared secrets", () => {
 const config=base();config.OFFICE_CALC_GRANT_VALIDATION_URL="http://example.com";config.CALC_SESSION_SECRET=config.BREBO_CALC_SHARED_SECRET;
 assert.ok(validateOfficeTestProgramOnly(config).length>=2);
});
