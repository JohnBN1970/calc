import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCrmDraftLine } from "./crmDraftLine.js";

test("accepts a minimal new CRM calculation line", () => {
  assert.deepEqual(parseCrmDraftLine({description:"Kozijnen leveren en plaatsen",unit:"st",quantity:12,materialUnitCost:250,labourUnitCost:45}), {
    description:"Kozijnen leveren en plaatsen",unit:"st",quantity:12,materialUnitCost:250,labourUnitCost:45
  });
});
test("rejects non-finite, empty, negative or oversized fields", () => {
  for (const payload of [
    {}, {description:""}, {description:" x "}, {description:"x",quantity:0},
    {description:"x",quantity:Infinity}, {description:"x",materialUnitCost:-1},
    {description:"x",quantity:"1"}, {description:"x",unit:"a".repeat(33)},
    {description:"x".repeat(501)}
  ]) assert.equal(parseCrmDraftLine(payload), null);
});
