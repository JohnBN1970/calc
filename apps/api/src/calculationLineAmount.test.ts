import test from "node:test";
import assert from "node:assert/strict";
import { calculateLineAmount, calculateLineCostBreakdown } from "./calculationLineAmount.js";

test("arbeid gebruikt totaaluren maal uurprijs",()=>{
  assert.equal(calculateLineAmount({quantity:10,labourTotalHours:10,labourUnitCost:0.15}),1.5);
});

test("materiaal materieel onderaanneming en overig volgen hoeveelheid",()=>{
  assert.equal(calculateLineAmount({
    quantity:2,
    materialUnitCost:3,
    equipmentUnitCost:4,
    subcontractingUnitCost:5,
    otherUnitCost:6
  }),36);
});

test("arbeid en overige kostensoorten worden gecombineerd",()=>{
  assert.equal(calculateLineAmount({
    quantity:2,
    labourTotalHours:3,
    labourUnitCost:10,
    materialUnitCost:5
  }),40);
});

test("lege waarden gedragen zich als nul",()=>{
  assert.equal(calculateLineAmount({quantity:null,labourTotalHours:null,labourUnitCost:null}),0);
});


test("kostopbouw gebruikt dezelfde centrale regelberekening",()=>{
  assert.deepEqual(calculateLineCostBreakdown({
    quantity:2,
    labourTotalHours:3,
    labourUnitCost:10,
    materialUnitCost:5,
    equipmentUnitCost:2,
    subcontractingUnitCost:4,
    otherUnitCost:1
  }),{
    labour:30,
    material:10,
    equipment:4,
    subcontracting:8,
    other:2
  });
});
