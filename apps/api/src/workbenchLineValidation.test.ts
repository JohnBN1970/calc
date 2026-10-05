import test from "node:test";
import assert from "node:assert/strict";
import { findIncompleteLabourLines } from "./workbenchLineValidation.js";

test("uurprijs zonder totaaluren blokkeert de arbeidsregel",()=>{
  const rows=findIncompleteLabourLines([
    {lineType:"item",labourUnitCost:0.15,labourTotalHours:null,description:"Arbeid"},
    {lineType:"item",labourUnitCost:0.15,labourTotalHours:0,description:"Bewust nul uur"},
    {lineType:"item",labourUnitCost:0,labourTotalHours:null,description:"Geen arbeid"},
    {lineType:"option",labourUnitCost:25,labourTotalHours:null,description:"Optie"}
  ]);
  assert.deepEqual(rows.map(row=>row.description),["Arbeid"]);
});
