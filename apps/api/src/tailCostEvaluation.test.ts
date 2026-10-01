import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTailCostHierarchy } from "./tailCostEvaluation.js";
import type { TailCostComponent } from "./tailCostRepository.js";

const component=(overrides:Partial<TailCostComponent>):TailCostComponent=>({
  id:1,versionId:1,ownerType:"calculation",ownerRef:null,componentKey:"x",description:"X",
  basis:"percentage",value:0,baseScope:"owner_direct_cost",baseRef:null,quantity:null,sortOrder:0,active:true,
  ...overrides
});

const sub={
  id:10,ref:"gevel-zuid",description:"Gevel Zuid",lineIds:[1,2],directCost:800,
  costs:{labour:0,material:800,equipment:0,subcontracting:0,other:0}
};

test("hoofd-staartkosten rekenen alleen over hoofdregels",()=>{
  const result=evaluateTailCostHierarchy({
    totalDirectCost:1000,
    mainDirectCost:200,
    subcalculations:[sub],
    components:[
      component({id:1,ownerType:"subcalculation",ownerRef:"gevel-zuid",componentKey:"sub-10",description:"Deelcalc 10%",value:10}),
      component({id:2,ownerType:"calculation",ownerRef:null,componentKey:"main-5",description:"Hoofd 5%",value:5,baseScope:"owner_direct_cost"})
    ]
  });
  assert.equal(result.subcalculationTailCost,80);
  assert.equal(result.calculationTailCost,10);
  assert.equal(result.tailCost,90);
  assert.equal(result.salesPrice,1090);
});

test("projectbrede staartkosten vereisen expliciet geconsolideerde basis",()=>{
  const result=evaluateTailCostHierarchy({
    totalDirectCost:1000,
    mainDirectCost:200,
    subcalculations:[sub],
    components:[
      component({id:1,ownerType:"subcalculation",ownerRef:"gevel-zuid",componentKey:"sub-10",description:"Deelcalc 10%",value:10}),
      component({id:2,ownerType:"calculation",ownerRef:null,componentKey:"project-5",description:"Project 5%",value:5,baseScope:"consolidated_direct_cost"})
    ]
  });
  assert.equal(result.subcalculationTailCost,80);
  assert.equal(result.calculationTailCost,50);
  assert.equal(result.salesPrice,1130);
});

test("overlappende deelcalculaties verdubbelen nooit de directe kost",()=>{
  const second={...sub,id:11,ref:"glas",description:"Glas",lineIds:[2,3],directCost:500};
  const result=evaluateTailCostHierarchy({
    totalDirectCost:1000,
    mainDirectCost:100,
    subcalculations:[sub,second],
    components:[]
  });
  assert.equal(result.totalDirectCost,1000);
  assert.equal(result.tailCost,0);
  assert.equal(result.salesPrice,1000);
});
