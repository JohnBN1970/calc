import test from "node:test";
import assert from "node:assert/strict";
import { applyCostAllocations } from "./subcalculationEvaluation.js";

test("allocation moves direct cost proportionally without changing total",()=>{
  const result=applyCostAllocations({
    costsByLine:new Map([
      [1,{labour:40,material:60,equipment:0,subcontracting:0,other:0}],
      [2,{labour:0,material:20,equipment:0,subcontracting:0,other:0}]
    ]),
    allocations:[{sourceLineId:1,targetLineId:2,amount:30}]
  });
  assert.deepEqual(result.get(1),{labour:28,material:42,equipment:0,subcontracting:0,other:0});
  assert.deepEqual(result.get(2),{labour:12,material:38,equipment:0,subcontracting:0,other:0});
  const total=[...result.values()].reduce((sum,c)=>sum+c.labour+c.material+c.equipment+c.subcontracting+c.other,0);
  assert.equal(total,120);
});

test("allocation cannot exceed source direct cost",()=>{
  assert.throws(()=>applyCostAllocations({
    costsByLine:new Map([
      [1,{labour:10,material:0,equipment:0,subcontracting:0,other:0}],
      [2,{labour:0,material:0,equipment:0,subcontracting:0,other:0}]
    ]),
    allocations:[{sourceLineId:1,targetLineId:2,amount:10.02}]
  }),/overschrijdt/i);
});
