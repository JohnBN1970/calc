import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNlSfbParents } from "./classificationHierarchy.js";

test("NL-SfB paragraph 30 is repaired under chapter 3",()=>{
  const rows=normalizeNlSfbParents([
    {id:1,parentId:null,lineType:"chapter",code:"2-",description:"Bovenbouw"},
    {id:2,parentId:null,lineType:"chapter",code:"3-",description:"Afbouw"},
    {id:3,parentId:1,lineType:"paragraph",code:"30",description:"Afbouw"}
  ]);
  assert.equal(rows[2].parentId,2);
});

test("NL-SfB paragraph keeps correct parent",()=>{
  const rows=normalizeNlSfbParents([
    {id:10,parentId:null,lineType:"chapter",code:"3-",description:"Afbouw"},
    {id:11,parentId:10,lineType:"paragraph",code:"31",description:"Wandopeningen buiten"}
  ]);
  assert.equal(rows[1].parentId,10);
});

test("non classification rows are untouched",()=>{
  const rows=normalizeNlSfbParents([
    {id:20,parentId:null,lineType:"chapter",code:"3-",description:"Afbouw"},
    {id:21,parentId:999,lineType:"item",code:"30",description:"Vrije regel"}
  ]);
  assert.equal(rows[1].parentId,999);
});
