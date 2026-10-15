import assert from "node:assert/strict";
import { test } from "node:test";

process.env.MYSQL_PASSWORD ??= "test-only-not-used";
process.env.OFFICE_API_BASE_URL ??= "https://office.example.test";
process.env.BREBO_CALC_SHARED_SECRET ??= "test-only-0123456789abcdef0123456789abcdef";
process.env.CALC_SESSION_SECRET ??= "test-only-0123456789abcdef0123456789abcdef";

const { isOfficeGrantActive } = await import("./officeGrantClient.js");

test("v2 grant: string operator and projectless draft", async () => {
  const originalFetch = globalThis.fetch;
  const grant = {
    reference: "a".repeat(64),
    actor_id: "office-operator@example.com",
    project_id: null,
    calculation_id: 42,
  };
  const endpoint = "https://office.example.test/api/workbench/v1/calculation-grants/validate";
  try {
    globalThis.fetch = async (_url, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), grant);
      return new Response(JSON.stringify({ active: true }), { status: 200 });
    };
    assert.equal(await isOfficeGrantActive(grant, endpoint), true);
    globalThis.fetch = async () => new Response(JSON.stringify({ active: false }), { status: 200 });
    assert.equal(await isOfficeGrantActive(grant, endpoint), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
