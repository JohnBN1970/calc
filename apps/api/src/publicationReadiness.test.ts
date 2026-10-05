import test from "node:test";
import assert from "node:assert/strict";
import { calculatePublicationReadiness } from "./publicationReadiness.js";

test("publicatie is klaar bij opgeslagen totalen en volledige btw-dekking",()=>{
  assert.deepEqual(calculatePublicationReadiness({
    versionStatus:"draft",costLineCount:2,
    directCost:100,storedDirectCost:100,
    markupAmount:20,storedMarkupAmount:20,
    salesPrice:120,storedSalesPrice:120,
    vatTaxableBase:120
  }),{canPublish:true,reasons:[]});
});

test("publicatie meldt alle relevante blokkades",()=>{
  const result=calculatePublicationReadiness({
    versionStatus:"established",costLineCount:0,
    directCost:101,storedDirectCost:100,
    markupAmount:19,storedMarkupAmount:20,
    salesPrice:120,storedSalesPrice:121,
    vatTaxableBase:100
  });
  assert.equal(result.canPublish,false);
  assert.equal(result.reasons.length,4);
  assert.equal(result.reasons.some(reason=>reason.includes("conceptversie")),true);
  assert.equal(result.reasons.some(reason=>reason.includes("verkoopregels")),true);
  assert.equal(result.reasons.some(reason=>reason.includes("BTW-regime")),true);\n  assert.equal(result.reasons.filter(reason=>reason.includes("gewijzigd sinds de laatste opslag")).length,1);
});
