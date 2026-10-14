import assert from "node:assert/strict";
import { test } from "node:test";
process.env.MYSQL_PASSWORD ??= "test-only-not-used";
process.env.OFFICE_API_BASE_URL ??= "https://office.example.test";
process.env.BREBO_CALC_SHARED_SECRET ??= "test-only-0123456789abcdef0123456789abcdef";
process.env.CALC_SESSION_SECRET ??= "test-only-0123456789abcdef0123456789abcdef";

const { isOfficeGrantActive } = await import("./officeGrantClient.js");

const endpoint = "https://office.example.test/api/workbench/v1/calculation-grants/validate";
const grant = { reference: "a".repeat(64), actor_id: 2, project_id: 3, calculation_id: 4 };

test("Office grant client rejects invalid reference and unsafe destinations", async () => {
  assert.equal(await isOfficeGrantActive({ ...grant, reference: "bad" }, endpoint), false);
  assert.equal(await isOfficeGrantActive(grant, "http://office.example.test/api/workbench/v1/calculation-grants/validate"), false);
  assert.equal(await isOfficeGrantActive(grant, "https://office.example.test/other"), false);
  assert.equal(await isOfficeGrantActive(grant, endpoint + "?token=x"), false);
});

test("Office grant client only accepts explicit active true", async () => {
  const original = globalThis.fetch;
  try {
    for (const payload of [{ active: false }, {}, { active: "true" }, { error: "unavailable" }]) {
      globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 });
      assert.equal(await isOfficeGrantActive(grant, endpoint), false);
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ active: true }), { status: 200 });
    assert.equal(await isOfficeGrantActive(grant, endpoint), true);
  } finally {
    globalThis.fetch = original;
  }
});

test("Office grant client fails closed on network errors, HTTP failures and malformed JSON", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.equal(await isOfficeGrantActive(grant, endpoint), false);
    globalThis.fetch = async () => new Response('{"active":true}', { status: 503 });
    assert.equal(await isOfficeGrantActive(grant, endpoint), false);
    globalThis.fetch = async () => new Response("not json", { status: 200 });
    assert.equal(await isOfficeGrantActive(grant, endpoint), false);
  } finally {
    globalThis.fetch = original;
  }
});
