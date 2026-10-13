import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCalcBasePath, stripCalcBasePath, calcSessionCookiePath } from "./calcBasePath.js";

test("root deployment remains unchanged", () => {
  assert.equal(normalizeCalcBasePath(undefined), "");
  assert.equal(normalizeCalcBasePath("/"), "");
  assert.equal(stripCalcBasePath("/api/health?ready=1", ""), "/api/health?ready=1");
  assert.equal(calcSessionCookiePath(""), "/");
});

test("Office prefix routes and query strings", () => {
  const base = normalizeCalcBasePath("/calculaties/");
  assert.equal(base, "/calculaties");
  assert.equal(stripCalcBasePath("/calculaties", base), "/");
  assert.equal(stripCalcBasePath("/calculaties?view=summary", base), "/?view=summary");
  assert.equal(stripCalcBasePath("/calculaties/api/health?x=1", base), "/api/health?x=1");
  assert.equal(stripCalcBasePath("/calculaties/launch?token=abc", base), "/launch?token=abc");
  assert.equal(calcSessionCookiePath(base), "/calculaties");
});

test("unrelated routes and deceptive prefixes are rejected", () => {
  assert.equal(stripCalcBasePath("/calculaties-extra/api/health", "/calculaties"), null);
  assert.equal(stripCalcBasePath("/crm", "/calculaties"), null);
  for (const input of ["https://example.com", "//evil", "/a//b", "/a/../b", "/a?x=1", "/a#b"]) {
    assert.throws(() => normalizeCalcBasePath(input));
  }
});


test("Office /calc-werkbank prefix preserves API, assets and launch routes", () => {
  const base = normalizeCalcBasePath("/calc-werkbank/");
  assert.equal(base, "/calc-werkbank");
  for (const route of ["/api/health", "/api/launch/consume", "/assets/index.js", "/"]) {
    const externalPath: string = base + (route === "/" ? "/" : route);
    assert.equal(stripCalcBasePath(externalPath, base), route);
  }
  assert.equal(stripCalcBasePath("/calc-werkbank/api/launch/consume?source=office", base), "/api/launch/consume?source=office");
  assert.equal(calcSessionCookiePath(base), "/calc-werkbank");
});

test("Office prefix never captures login, CRM or lookalike paths", () => {
  const base = normalizeCalcBasePath("/calc-werkbank");
  for (const route of [
    "/inloggen", "/uitloggen", "/crm/aanvragen",
    "/calc-werkbank-extra", "/calc-werkbanked/api/health",
    "/calc/start", "/api/launch/consume",
  ]) {
    assert.equal(stripCalcBasePath(route, base), null, route);
  }
});
