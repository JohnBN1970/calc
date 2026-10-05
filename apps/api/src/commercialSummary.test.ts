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


test("gemengde btw-regimes worden apart berekend",()=>{
  const result=buildCommercialSummary({
    purchase:700,
    sales:1000,
    vatRate:null,
    vatBreakdown:[
      {code:"laag",label:"Laag",rate:9,taxableBase:400,vatAmount:36,reverseCharged:false},
      {code:"hoog",label:"Hoog",rate:21,taxableBase:500,vatAmount:105,reverseCharged:false},
      {code:"verlegd",label:"Verlegd",rate:null,taxableBase:100,vatAmount:0,reverseCharged:true}
    ]
  });
  assert.equal(result.vat,141);
  assert.equal(result.vatRate,null);
  assert.equal(result.vatBreakdown.length,3);
});

test("som btw-grondslagen moet verkoopprijs volgen",()=>{
  assert.throws(()=>buildCommercialSummary({
    purchase:700,
    sales:1000,
    vatRate:null,
    vatBreakdown:[
      {code:"hoog",label:"Hoog",rate:21,taxableBase:900,vatAmount:189,reverseCharged:false}
    ]
  }),/grondslagen/);
});


test("commerciele samenvatting bevat factuurtotaal inclusief btw",()=>{
  const summary=buildCommercialSummary({
    purchase:80,
    sales:100,
    vatRate:null,
    vatBreakdown:[
      {code:"NL9",label:"9%",rate:9,taxableBase:40,vatAmount:3.6,reverseCharged:false},
      {code:"NL21",label:"21%",rate:21,taxableBase:60,vatAmount:12.6,reverseCharged:false}
    ]
  });
  assert.equal(summary.vat,16.2);
  assert.equal(summary.totalInclVat,116.2);
});
