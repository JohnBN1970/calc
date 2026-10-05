import test from "node:test";
import assert from "node:assert/strict";
import { lineContributesToCalculationTotals } from "./calculationLineTotals.js";

test("alleen actieve kostregels tellen mee in Calc-totalen",()=>{
  assert.equal(lineContributesToCalculationTotals("item"),true);
  assert.equal(lineContributesToCalculationTotals("allowance"),true);
  assert.equal(lineContributesToCalculationTotals("adjustable"),true);
  assert.equal(lineContributesToCalculationTotals("chapter"),false);
  assert.equal(lineContributesToCalculationTotals("paragraph"),false);
  assert.equal(lineContributesToCalculationTotals("note"),false);
  assert.equal(lineContributesToCalculationTotals("option"),false);
});
