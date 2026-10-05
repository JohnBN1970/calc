import test from "node:test";
import assert from "node:assert/strict";
import { diffCommercialTotals, diffVersionLines, type VersionDiffLine } from "./versionDiff.js";

const line=(key:string,description:string,material=10):VersionDiffLine=>({
  structureKey:key,lineType:"item",code:null,description,unit:"st",quantity:1,
  labourNorm:null,labourTotalHours:null,labourHoursInputMode:null,labourUnitCost:0,
  materialUnitCost:material,equipmentUnitCost:0,subcontractingUnitCost:0,otherUnitCost:0,
  vatRegimeId:1,priceSourceType:"manual",sourceReference:null
});

test("versiediff herkent toegevoegd verwijderd en gewijzigd",()=>{
  const changes=diffVersionLines({
    before:[line("a","A"),line("b","B"),line("c","C",10)],
    after:[line("a","A"),line("c","C",12),line("d","D")]
  });
  assert.deepEqual(changes.map(item=>[item.structureKey,item.kind]),[
    ["b","removed"],["c","changed"],["d","added"]
  ]);
  assert.ok(changes.find(item=>item.structureKey==="c")?.changedFields.includes("materialUnitCost"));
});

test("commerciele delta wordt richting nieuwe versie berekend",()=>{
  assert.deepEqual(diffCommercialTotals({
    before:{directCost:100,markupAmount:10,salesPrice:110},
    after:{directCost:120,markupAmount:12,salesPrice:132}
  }),{directCost:20,markupAmount:2,salesPrice:22});
});
