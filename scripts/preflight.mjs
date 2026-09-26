const required = [
  "MYSQL_PASSWORD",
  "OFFICE_API_BASE_URL",
  "BREBO_CALC_SHARED_SECRET",
  "CALC_SESSION_SECRET"
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error("Missing required environment variables: " + missing.join(", "));
  process.exit(1);
}

if (process.env.BREBO_CALC_SHARED_SECRET === process.env.CALC_SESSION_SECRET) {
  console.error("BREBO_CALC_SHARED_SECRET and CALC_SESSION_SECRET must be different.");
  process.exit(1);
}

console.log("BREBO Calc runtime configuration preflight passed.");
