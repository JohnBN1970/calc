import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  database: {
    host: process.env.MYSQL_HOST ?? "localhost",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    database: process.env.MYSQL_DATABASE ?? "u213420663_calc",
    user: process.env.MYSQL_USER ?? "u213420663_calc",
    password: required("MYSQL_PASSWORD")
  },
  office: {
    baseUrl: (() => {
    const value = required("OFFICE_API_BASE_URL");
    const normalized = value.endsWith("/") ? value.slice(0, -1) : value;
    // The Office endpoint is deployment configuration, never a hardcoded
    // redirect to a legacy Drupal host. Migration must update the env explicitly.
    return normalized;
  })(),
    sharedSecret: required("BREBO_CALC_SHARED_SECRET")
  },
  corsOrigin: process.env.CORS_ORIGIN ?? "https://calculatie.brebobv.nl",
  sessionSecret: required("CALC_SESSION_SECRET")
};
