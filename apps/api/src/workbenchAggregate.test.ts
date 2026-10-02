import test from "node:test";
import assert from "node:assert/strict";
import { calcWorkbenchStructureFromLines } from "./workbenchAggregate.js";

test("Calc structuur gebruikt stabiele sleutel en niet database-id",()=>{
  const first=calcWorkbenchStructureFromLines([
    {id:10,parent_id:null,structure_key:"chapter-stable",line_type:"chapter",code:"01",description:"Kozijnen"},
    {id:11,parent_id:10,structure_key:"paragraph-stable",line_type:"paragraph",code:"01.01",description:"Houten kozijnen"}
  ]);
  const afterSave=calcWorkbenchStructureFromLines([
    {id:110,parent_id:null,structure_key:"chapter-stable",line_type:"chapter",code:"01",description:"Kozijnen"},
    {id:111,parent_id:110,structure_key:"paragraph-stable",line_type:"paragraph",code:"01.01",description:"Houten kozijnen"}
  ]);
  assert.deepEqual(afterSave,first);
  assert.equal(first[1].node_key,"paragraph-stable");
  assert.equal(first[1].parent_key,"chapter-stable");
});
