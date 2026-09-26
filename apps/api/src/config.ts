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
    baseUrl: required("OFFICE_API_BASE_URL"),
    token: required("OFFICE_API_TOKEN")
  },
  corsOrigin: process.env.CORS_ORIGIN ?? "https://calculatie.brebobv.nl"
};
