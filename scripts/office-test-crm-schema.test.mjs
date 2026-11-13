import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(new URL("../database/office_test_crm_first_empty_schema.sql", import.meta.url), "utf8");
test("CRM-first empty schema permits projectless concepts", () => {
  assert.match(sql, /office_project_id BIGINT UNSIGNED NULL/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS calculations/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS calculation_versions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS calculation_lines/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS launch_nonces/);
});
test("empty CRM-first schema contains no data imports or destructive statements", () => {
  const statements = sql.split("\n").map(line => line.trim()).filter(line => !line.startsWith("--")).join("\n");
  assert.doesNotMatch(statements, /^\s*(?:DROP|TRUNCATE|DELETE|INSERT|REPLACE|UPDATE|ALTER|LOAD\s+DATA|SOURCE)\b/im);
});
