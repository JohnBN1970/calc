/**
 * Fail closed for CRM-first Calc launches. A GitHub packaging preflight does
 * not guarantee the deployed Node process has isolated database credentials.
 * This check runs inside the actual launch handler before any database access.
 */
export function crmFirstRuntimeReady(env: NodeJS.ProcessEnv): boolean {
  const isolated = env.CALC_OFFICE_TEST_DATABASE;
  const actual = env.MYSQL_DATABASE;
  if (env.CALC_CRM_FIRST_LAUNCH_ENABLED !== "enabled"
    || env.CALC_OFFICE_GRANT_ENFORCEMENT !== "enabled"
    || env.CALC_CRM_FIRST_SCHEMA_VERIFIED !== "enabled"
    || env.NODE_ENV !== "production"
    || !isolated || isolated.trim() !== isolated
    || !/^[a-zA-Z0-9_]{1,64}$/.test(isolated)
    || actual !== isolated
    || ["u213420663_calc", "u213420663_calc_restore", "u213420663_office_test"].includes(isolated)
    || env.CALC_IMPORT_EXISTING_DATA !== undefined
    || env.CALC_RUN_MIGRATIONS !== undefined) return false;

  try {
    const officeUrl = new URL(env.OFFICE_API_BASE_URL ?? "");
    const validationUrl = new URL(env.OFFICE_CALC_GRANT_VALIDATION_URL ?? "");
    if (officeUrl.protocol !== "https:" || validationUrl.protocol !== "https:"
      || officeUrl.username || officeUrl.password || validationUrl.username || validationUrl.password
      || validationUrl.search || validationUrl.hash
      || ![
        "/api/workbench/v1/calculation-grants/validate",
        "/office-test/api/workbench/v1/calculation-grants/validate"
      ].includes(validationUrl.pathname)) return false;
  } catch {
    return false;
  }
  const launchSecret = env.BREBO_CALC_SHARED_SECRET ?? "";
  const sessionSecret = env.CALC_SESSION_SECRET ?? "";
  return launchSecret.length >= 32
    && sessionSecret.length >= 32
    && launchSecret !== sessionSecret;
}
