import test from "node:test";
import assert from "node:assert/strict";
import { effectiveAllocatedVatSources } from "./allocatedVatSources.js";
import { aggregateVat } from "./lineVatAggregation.js";
import { evaluateTailCostHierarchy } from "./tailCostEvaluation.js";

test("mixed VAT, allocation and independent subcalculation tail costs reconcile",()=>{
  const lineSales=effectiveAllocatedVatSources({
    lines:[
      {id:1,lineType:"item",quantity:1,labourTotalHours:null,labourUnitCost:0,materialUnitCost:800,equipmentUnitCost:0,subcontractingUnitCost:0,otherUnitCost:0,vatRegimeId:1},
      {id:2,lineType:"item",quantity:1,labourTotalHours:null,labourUnitCost:0,materialUnitCost:200,equipmentUnitCost:0,subcontractingUnitCost:0,otherUnitCost:0,vatRegimeId:2}
    ],
    allocations:[{sourceLineId:1,targetLineId:2,amount:100}]
  });
  const hierarchy=evaluateTailCostHierarchy({
    totalDirectCost:1000,mainDirectCost:200,
    subcalculations:[{id:10,ref:"gevel",description:"Gevel",lineIds:[1],directCost:800,
      costs:{labour:0,material:800,equipment:0,subcontracting:0,other:0}}],
    components:[
      {id:1,versionId:1,ownerType:"subcalculation",ownerRef:"gevel",componentKey:"sub",description:"Sub 10%",basis:"percentage",value:10,baseScope:"owner_direct_cost",baseRef:null,quantity:null,sortOrder:0,active:true,vatRegimeId:1},
      {id:2,versionId:1,ownerType:"calculation",ownerRef:null,componentKey:"main",description:"Main 5%",basis:"percentage",value:5,baseScope:"owner_direct_cost",baseRef:null,quantity:null,sortOrder:1,active:true,vatRegimeId:2}
    ]
  });
  assert.equal(hierarchy.tailCost,90);
  assert.equal(hierarchy.salesPrice,1090);
  const breakdown=aggregateVat({
    regimes:[
      {id:1,code:"high",label:"21%",treatment:"normal",rate:21,active:true,sortOrder:1},
      {id:2,code:"low",label:"9%",treatment:"normal",rate:9,active:true,sortOrder:2}
    ],
    lineSales,tailCosts:hierarchy.rows
  });
  assert.equal(breakdown.reduce((sum,row)=>sum+row.taxableBase,0),1090);
  assert.equal(breakdown.find(row=>row.code==="high")?.taxableBase,780);
  assert.equal(breakdown.find(row=>row.code==="low")?.taxableBase,310);
  assert.ok(Math.abs(breakdown.reduce((sum,row)=>sum+row.vatAmount,0)-191.7)<0.000001);
});
