import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import mysql from "mysql2/promise";

// Runs only with disposable CI-owned MySQL. No production, restore or Office DB.
const database = process.env.MYSQL_DATABASE;
if (database !== "isolated_calc_crm_e2e" || process.env.CALC_CRM_E2E_SCOPE !== "disposable-ci") {
  throw new Error("CRM integration tests require the isolated disposable CI database");
}
const password = process.env.MYSQL_PASSWORD;
if (!password || password.length < 12) throw new Error("CI MySQL password unavailable");

const launchSecret = "ci-launch-only-11111111111111111111111111111";
const sessionSecret = "ci-session-only-2222222222222222222222222222";
const mockPort = 39994;
const calcPort = 39993;
const officeOrigin = "https://127.0.0.1:" + mockPort;
const validationPath = "/api/workbench/v1/calculation-grants/validate";
const validationUrl = officeOrigin + "/office-test" + validationPath;
const baseUrl = "http://127.0.0.1:" + calcPort;
const grant = "a".repeat(64);

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "root",
  password,
  database,
});
let calcProcess;
let mockServer;
let mockAuthorized = true;
let validChecks = 0;
let processLogs = "";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const [existingTables] = await connection.query("SHOW TABLES");
  assert.equal(existingTables.length, 0, "Refuse to run against a populated database");

  const sql = readFileSync(new URL("../database/office_test_crm_first_empty_schema.sql", import.meta.url), "utf8")
    .replace(/^--.*$/gm, "");
  for (const statement of sql.split(";").map((v) => v.trim()).filter(Boolean)) {
    await connection.query(statement);
  }

  mockServer = createServer({
    key: readFileSync(process.env.CALC_E2E_TLS_KEY),
    cert: readFileSync(process.env.CALC_E2E_TLS_CERT),
  }, async (req, res) => {
    if (req.method !== "POST" || req.url !== "/office-test" + validationPath) {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const timestamp = req.headers["x-brebo-timestamp"];
    const requestId = req.headers["x-brebo-request-id"];
    const signature = req.headers["x-brebo-signature"];
    const canonical = ["POST", validationPath, createHash("sha256").update(raw).digest("hex"), timestamp, requestId].join("\n");
    const expected = "v1=" + createHmac("sha256", launchSecret).update(canonical).digest("hex");
    let verified = typeof signature === "string" && signature.length === expected.length
      && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    const data = JSON.parse(raw);
    verified = verified && data.reference === grant && data.actor_id === "7"
      && data.project_id === null && data.calculation_id === 9;
    if (verified) validChecks++;
    const active = verified && mockAuthorized;
    res.writeHead(active ? 200 : 403, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ active }));
  });
  mockServer.listen(mockPort, "127.0.0.1");
  await once(mockServer, "listening");

  calcProcess = spawn(process.execPath, ["apps/api/dist/index.js"], {
    cwd: new URL("../", import.meta.url).pathname,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(calcPort),
      CALC_CRM_FIRST_LAUNCH_ENABLED: "enabled",
      CALC_CRM_FIRST_SCHEMA_VERIFIED: "enabled",
      CALC_OFFICE_GRANT_ENFORCEMENT: "enabled",
      CALC_OFFICE_TEST_DATABASE: database,
      MYSQL_DATABASE: database,
      OFFICE_API_BASE_URL: officeOrigin + "/office-test",
      OFFICE_CALC_GRANT_VALIDATION_URL: validationUrl,
      BREBO_CALC_SHARED_SECRET: launchSecret,
      CALC_SESSION_SECRET: sessionSecret,
      CALC_BASE_PATH: "",
      NODE_EXTRA_CA_CERTS: process.env.CALC_E2E_TLS_CERT,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  calcProcess.stdout.on("data", (chunk) => { processLogs += String(chunk).slice(0, 1000); });
  calcProcess.stderr.on("data", (chunk) => { processLogs += String(chunk).slice(0, 1000); });

  let health = null;
  for (let i = 0; i < 40; i++) {
    try {
      health = await fetch(baseUrl + "/api/health", { signal: AbortSignal.timeout(1200) });
      if (health.ok) break;
    } catch {}
    if (calcProcess.exitCode !== null) throw new Error("Calc stopped before HTTP readiness");
    await wait(400);
  }
  assert(health?.ok, "Calc API did not start with an isolated database");

  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    v: 2,
    grant_ref: grant,
    calculation_id: 9,
    project_id: null,
    actor_id: "7",
    exp: now + 90,
    nonce: randomBytes(16).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(tokenPayload)).toString("base64url");
  const token = encoded + "." + createHmac("sha256", launchSecret).update(encoded).digest("hex");

  const launch = await fetch(baseUrl + "/api/launch/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(launch.status, 200, "Office v2 launch did not create a draft");
  const response = await launch.json();
  assert.equal(response.status, "ok");
  assert.equal(response.workbenchPath, "/crm-draft");
  const cookie = launch.headers.get("set-cookie")?.split(";")[0];
  assert(cookie?.startsWith("brebo_calc_session="), "No scoped session cookie issued");

  const read = () => fetch(baseUrl + "/api/crm-draft", { headers: { Cookie: cookie }, cache: "no-store" });
  const first = await read();
  assert.equal(first.status, 200);
  const firstDraft = await first.json();
  assert.equal(firstDraft.calculationId, 9);
  assert.equal(firstDraft.lines.length, 0);

  const appended = await fetch(baseUrl + "/api/crm-draft/lines", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: "https://127.0.0.1:" + calcPort,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: "Kozijnen leveren en plaatsen",
      unit: "st",
      quantity: 12,
      materialUnitCost: 250,
      labourUnitCost: 45,
    }),
  });
  assert.equal(appended.status, 201, "CRM calculation line was not persisted");
  const after = await read();
  assert.equal(after.status, 200);
  const saved = await after.json();
  assert.equal(saved.lines.length, 1);
  assert.equal(saved.lines[0].description, "Kozijnen leveren en plaatsen");
  assert.equal(Number(saved.lines[0].quantity), 12);

  const replay = await fetch(baseUrl + "/api/launch/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(replay.status, 409, "Launch replay was not rejected");

  const maliciousForm = await fetch(baseUrl + "/api/launch/consume", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://malicious.invalid" },
    body: new URLSearchParams({ token }),
  });
  assert.equal(maliciousForm.status, 403, "Cross-site unauthorized launch form accepted");

  mockAuthorized = false;
  const revoked = await read();
  assert.equal(revoked.status, 401, "Revoked Office grant was not enforced");

  const [calcRows] = await connection.query("SELECT COUNT(*) AS total FROM calculations");
  assert.equal(calcRows[0].total, 1);
  assert(validChecks >= 5, "Continuous Office grant checks were not executed");

  process.stdout.write("CRM_FIRST_E2E=PASS\nNEW_BLANK_CALC=CREATED\nLINE_SAVE_REOPEN=PASS\nREPLAY=BLOCKED\nREVOKED_OFFICE_GRANT=DENIED\nHISTORICAL_DATA=NOT_IMPORTED\n");
} catch (error) {
  process.stderr.write(String(error) + "\n");
  // Avoid logging user credentials, grant tokens or secrets in workflow output.
  process.stderr.write("CALC_CRM_E2E_FAILED\n");
  process.exitCode = 1;
} finally {
  if (calcProcess) {
    calcProcess.kill();
    await Promise.race([once(calcProcess, "exit").catch(() => {}), wait(2000)]);
  }
  if (mockServer) await new Promise((resolve) => mockServer.close(resolve));
  await connection.end();
}
