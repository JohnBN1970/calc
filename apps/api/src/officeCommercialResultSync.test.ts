import test from "node:test";
import assert from "node:assert/strict";
import { verifyOfficeCommercialSummary } from "./officeCommercialResultSync.js";

const expected={
  purchase:100,sales:130,margin:30,margin_pct:23.076923,vat:27.3,vat_rate:21,
  vat_breakdown:[{code:"standaard",label:"Standaard",rate:21,taxable_base:130,vat_amount:27.3,reverse_charged:false}]
};

test("Office roundtrip bevestigt commerciele Calc-samenvatting",()=>{
  assert.doesNotThrow(()=>verifyOfficeCommercialSummary({...expected},expected));
});

test("Office roundtrip weigert afwijkende commerciele waarden",()=>{
  assert.throws(()=>verifyOfficeCommercialSummary({...expected,sales:129},expected),/verkoop/);
  assert.throws(()=>verifyOfficeCommercialSummary({...expected,margin_pct:20},expected),/margepercentage/);
  assert.throws(()=>verifyOfficeCommercialSummary({...expected,vat:26},expected),/btw/);
});

test("Office roundtrip weigert ontbrekende samenvatting",()=>{
  assert.throws(()=>verifyOfficeCommercialSummary(null,expected),/geen commerciele Calc-samenvatting/);
});
