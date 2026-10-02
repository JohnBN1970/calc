import test from "node:test";
import assert from "node:assert/strict";
import { aggregateVat } from "./lineVatAggregation.js";

const regimes=[
  {id:1,code:"hoog",label:"Hoog",treatment:"normal" as const,rate:21,active:true,sortOrder:1},
  {id:2,code:"laag",label:"Laag",treatment:"normal" as const,rate:9,active:true,sortOrder:2},
  {id:3,code:"verlegd",label:"Verlegd",treatment:"reverse_charge" as const,rate:null,active:true,sortOrder:3}
];

test("btw wordt vanuit regels per regime geaggregeerd",()=>{
  const rows=aggregateVat({
    regimes,
    lineSales:[
      {vatRegimeId:1,salesAmount:500},
      {vatRegimeId:1,salesAmount:100},
      {vatRegimeId:2,salesAmount:200},
      {vatRegimeId:3,salesAmount:300}
    ],
    tailCosts:[]
  });
  const high=rows.find(row=>row.code==="hoog")!;
  const low=rows.find(row=>row.code==="laag")!;
  const reversed=rows.find(row=>row.code==="verlegd")!;
  assert.equal(high.taxableBase,600);
  assert.equal(high.vatAmount,126);
  assert.equal(low.taxableBase,200);
  assert.equal(low.vatAmount,18);
  assert.equal(reversed.taxableBase,300);
  assert.equal(reversed.vatAmount,0);
  assert.equal(reversed.reverseCharged,true);
});

test("staartkosten volgen hun eigen btw-regime",()=>{
  const rows=aggregateVat({
    regimes,
    lineSales:[{vatRegimeId:1,salesAmount:1000}],
    tailCosts:[{
      id:10,versionId:1,ownerType:"calculation",ownerRef:null,
      componentKey:"ak",description:"Algemene kosten",basis:"fixed",value:100,
      baseScope:"owner_direct_cost",baseRef:null,quantity:null,vatRegimeId:2,
      sortOrder:0,active:true,baseAmount:1000,amount:100,
      ownerRunningTotal:1100,consolidatedRunningTotal:1100
    }]
  });
  assert.equal(rows.find(row=>row.code==="hoog")?.taxableBase,1000);
  assert.equal(rows.find(row=>row.code==="laag")?.taxableBase,100);
});

test("regels zonder btw-regime tellen niet stil mee",()=>{
  const rows=aggregateVat({
    regimes,
    lineSales:[{vatRegimeId:null,salesAmount:100}],
    tailCosts:[]
  });
  assert.deepEqual(rows,[]);
});
