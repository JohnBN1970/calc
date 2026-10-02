import test from "node:test";
import assert from "node:assert/strict";
import { buildCommercialSummary } from "./commercialSummary.js";

test("margepercentage is marge gedeeld door verkoop",()=>{
  const result=buildCommercialSummary({purchase:800,sales:1000,vatRate:21});
  assert.equal(result.margin,200);
  assert.equal(result.marginPct,20);
  assert.equal(result.vat,210);
});

test("btw wordt niet stil aangenomen wanneer tarief ontbreekt",()=>{
  const result=buildCommercialSummary({purchase:800,sales:1000,vatRate:null});
  assert.equal(result.vatRate,null);
  assert.equal(result.vat,0);
});
