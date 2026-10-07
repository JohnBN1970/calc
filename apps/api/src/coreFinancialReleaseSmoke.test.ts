import test from "node:test";
import assert from "node:assert/strict";
import { applyCostAllocations } from "./costAllocation.js";
import { effectiveAllocatedVatSources } from "./allocatedVatSources.js";
import { aggregateVat } from "./lineVatAggregation.js";
import { evaluateTailCostHierarchy } from "./tailCostEvaluation.js";
import { calculatePublicationReadiness } from "./publicationReadiness.js";
import type { TailCostComponent } from "./tailCostEngine.js";

const component=(overrides:Partial<TailCostComponent>):TailCostComponent=>({
  id:1,versionId:1,ownerType:"calculation",ownerRef:null,componentKey:"x",description:"X",
  basis:"percentage",value:0,baseScope:"owner_direct_cost",baseRef:null,quantity:null,
  vatRegimeId:null,sortOrder:0,active:true,...overrides
});

test("core financial release smoke: allocation + mixed VAT + tail costs + publication readiness",()=>{
  const allocations=[{sourceLineId:1,targetLineId:2,amount:30}];

  const effectiveCosts=applyCostAllocations({
    costsByLine:new Map([
      [1,{labour:0,material:100,equipment:0,subcontracting:0,other:0}],
      [2,{labour:0,material:50,equipment:0,subcontracting:0,other:0}]
    ]),
    allocations
  });
  const mainDirect=effectiveCosts.get(1)!.material;
  const subDirect=effectiveCosts.get(2)!.material;
  assert.equal(mainDirect,70);
  assert.equal(subDirect,80);
  assert.equal(mainDirect+subDirect,150);

  const sub={
    id:10,ref:"deel",description:"Deelcalculatie",lineIds:[2],directCost:subDirect,
    costs:{labour:0,material:subDirect,equipment:0,subcontracting:0,other:0}
  };
  const hierarchy=evaluateTailCostHierarchy({
    totalDirectCost:150,
    mainDirectCost:mainDirect,
    subcalculations:[sub],
    components:[
      component({id:1,ownerType:"subcalculation",ownerRef:"deel",componentKey:"sub-10",description:"Deel 10%",value:10,vatRegimeId:2}),
      component({id:2,ownerType:"calculation",ownerRef:null,componentKey:"main-5",description:"Hoofd 5%",value:5,vatRegimeId:1})
    ]
  });
  assert.equal(hierarchy.subcalculationTailCost,8);
  assert.equal(hierarchy.calculationTailCost,3.5);
  assert.equal(hierarchy.salesPrice,161.5);

  const lineSales=effectiveAllocatedVatSources({
    lines:[
      {id:1,lineType:"item",quantity:1,labourTotalHours:null,labourUnitCost:0,materialUnitCost:100,equipmentUnitCost:0,subcontractingUnitCost:0,otherUnitCost:0,vatRegimeId:1},
      {id:2,lineType:"item",quantity:1,labourTotalHours:null,labourUnitCost:0,materialUnitCost:50,equipmentUnitCost:0,subcontractingUnitCost:0,otherUnitCost:0,vatRegimeId:2}
    ],
    allocations
  });
  const vat=aggregateVat({
    regimes:[
      {id:1,code:"hoog",label:"21%",treatment:"normal",rate:21,active:true,sortOrder:1},
      {id:2,code:"laag",label:"9%",treatment:"normal",rate:9,active:true,sortOrder:2}
    ],
    lineSales,
    tailCosts:[
      ...hierarchy.calculationTailCosts,
      ...hierarchy.subcalculations.flatMap(row=>row.tailCosts)
    ]
  });
  const taxableBase=vat.reduce((sum,item)=>sum+item.taxableBase,0);
  assert.ok(Math.abs(taxableBase-161.5)<0.000001);
  assert.ok(Math.abs(Number(vat.find(item=>item.code==="hoog")?.taxableBase)-73.5)<0.000001);
  assert.ok(Math.abs(Number(vat.find(item=>item.code==="laag")?.taxableBase)-88)<0.000001);

  const readiness=calculatePublicationReadiness({
    versionStatus:"draft",
    costLineCount:2,
    directCost:150,
    storedDirectCost:150,
    markupAmount:11.5,
    storedMarkupAmount:11.5,
    salesPrice:161.5,
    storedSalesPrice:161.5,
    vatTaxableBase:taxableBase
  });
  assert.deepEqual(readiness,{canPublish:true,reasons:[]});
});
