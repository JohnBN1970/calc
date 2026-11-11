/**
 * Explicit, read-only guard before building Calc for the Office-test route.
 * This does not install, migrate, import, or contact a database.
 */
export function validateOfficeTestProgramOnly(env) {
  const errors = [];
  const expectedPrefix = "/office-test/calc-app";
  if (env.CALC_DEPLOY_SCOPE !== "office-test-program-only") errors.push("Explicit Office-test program-only scope required");
  if (env.CALC_BASE_PATH !== expectedPrefix || env.VITE_CALC_BASE_PATH !== expectedPrefix) errors.push("API and web prefixes must match the reserved Office-test path");
  if (env.CALC_OFFICE_GRANT_ENFORCEMENT !== "enabled") errors.push("Live Office authorization checks must be enabled");
  if (env.NODE_ENV !== "production") errors.push("Use secure production-mode cookies for HTTPS staging");
  if (env.CALC_IMPORT_EXISTING_DATA !== undefined || env.CALC_RUN_MIGRATIONS !== undefined) errors.push("Imports and migrations are not part of the program-only stage");
  if (!env.CALC_OFFICE_TEST_DATABASE || env.MYSQL_DATABASE !== env.CALC_OFFICE_TEST_DATABASE) errors.push("Use the explicitly confirmed isolated Office-test database");
  if (env.MYSQL_DATABASE && ["u213420663_calc", "u213420663_calc_restore", "u213420663_office_test"].includes(env.MYSQL_DATABASE)) errors.push("Existing production, restore and Office databases are forbidden");
  if (!env.OFFICE_API_BASE_URL || !/^https:\/\//.test(env.OFFICE_API_BASE_URL)) errors.push("HTTPS Office API endpoint required");
  if (!env.OFFICE_CALC_GRANT_VALIDATION_URL || !/^https:\/\//.test(env.OFFICE_CALC_GRANT_VALIDATION_URL)) errors.push("HTTPS Office grant validation required");
  for (const key of ["MYSQL_PASSWORD", "BREBO_CALC_SHARED_SECRET", "CALC_SESSION_SECRET"]) {
    if (!env[key] || env[key].length < 32) errors.push(key + " must be configured securely");
  }
  if (env.BREBO_CALC_SHARED_SECRET && env.BREBO_CALC_SHARED_SECRET === env.CALC_SESSION_SECRET) errors.push("Launch and session secrets must differ");
  return errors;
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const errors = validateOfficeTestProgramOnly(process.env);
  if (errors.length) {
    for (const error of errors) console.error("OFFICE_TEST_CALC_BLOCKED: " + error);
    process.exitCode = 1;
  } else {
    console.log("OFFICE_TEST_CALC_PROGRAM_ONLY_PREFLIGHT_OK");
    console.log("NO_DATABASE_IMPORT_OR_MIGRATION_PERFORMED");
    console.log("RUNTIME_DEPLOYMENT_AND_ROUTER_NOT_VERIFIED");
  }
}
