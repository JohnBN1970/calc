import test from "node:test";
import assert from "node:assert/strict";
import { effectiveAllocatedVatSources } from "./allocatedVatSources.js";
import { aggregateVat } from "./lineVatAggregation.js";

test("allocation moves VAT base to target line regime without changing total base",()=>{
  const lineSales=effectiveAllocatedVatSources({
    lines:[
      {id:1,lineType:"item",quantity:1,labourTotalHours:null,labourUnitCost:0,materialUnitCost:100,equipmentUnitCost:0,subcontractingUnitCost:0,otherUnitCost:0,vatRegimeId:1},
      {id:2,lineType:"item",quantity:1,labourTotalHours:null,labourUnitCost:0,materialUnitCost:50,equipmentUnitCost:0,subcontractingUnitCost:0,otherUnitCost:0,vatRegimeId:2}
    ],
    allocations:[{sourceLineId:1,targetLineId:2,amount:30}]
  });
  const breakdown=aggregateVat({
    regimes:[
      {id:1,code:"hoog",label:"21%",treatment:"normal",rate:21,active:true,sortOrder:1},
      {id:2,code:"laag",label:"9%",treatment:"normal",rate:9,active:true,sortOrder:2}
    ],
    lineSales,
    tailCosts:[]
  });
  assert.equal(breakdown.find(item=>item.code==="hoog")?.taxableBase,70);
  assert.equal(breakdown.find(item=>item.code==="laag")?.taxableBase,80);
  assert.equal(breakdown.reduce((sum,item)=>sum+item.taxableBase,0),150);
  assert.ok(Math.abs(Number(breakdown.find(item=>item.code==="hoog")?.vatAmount)-14.7)<0.000001);
  assert.ok(Math.abs(Number(breakdown.find(item=>item.code==="laag")?.vatAmount)-7.2)<0.000001);
});
