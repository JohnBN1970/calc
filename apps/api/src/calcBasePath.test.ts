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
