import {test} from "node:test";
import assert from "node:assert/strict";
import {assertEditRevision,revisionReason,calculationLineChanges,auditLinesFromDatabase,appendCalculationChange} from "./calculationChangeHistory.js";
import type {PoolConnection} from "mysql2/promise";

test("a stale user cannot save after another authorized user saved",()=>{
 assert.doesNotThrow(()=>assertEditRevision(3,3));
 for(const expected of [2,4,null,undefined,"3",-1,NaN])assert.throws(()=>assertEditRevision(expected,3),/andere bevoegde gebruiker/);
});
test("a new revision needs a concrete reason",()=>{
 assert.equal(revisionReason(" Tekening revisie B ",true),"Tekening revisie B");
 for(const reason of [null,undefined,"", " ","x".repeat(1001)])assert.throws(()=>revisionReason(reason,true));
});
test("line history records old and new price, quantities and question answers",()=>{
 const before=[{structureKey:"a",description:"Kozijn",quantity:2,materialUnitCost:450,sourceDetails:'{"review":"pending"}'}];
 const after=[{...before[0],quantity:3,materialUnitCost:475,sourceDetails:'{"review":"confirmed"}'}];
 const changes=calculationLineChanges(before,after);
 assert.equal(changes.length,1);
 assert.equal(changes[0].kind,"changed");
 assert.deepEqual(changes[0].fields.find(item=>item.field==="materialUnitCost"),{field:"materialUnitCost",before:450,after:475});
 assert.ok(changes[0].fields.some(item=>item.field==="sourceDetails"));
});
test("saving a new database identity does not report every existing line as replaced",()=>{
 const row={id:12,structure_key:"a",description:"Kozijn",quantity:"2.0000",material_unit_cost:"450.0000"};
 const before=auditLinesFromDatabase([row]);const after=auditLinesFromDatabase([{...row,id:98}]);
 assert.deepEqual(calculationLineChanges(before,after),[]);
});
test("deleted and added lines remain attributable and duplicate identity is rejected",()=>{
 const a={structureKey:"a",description:"oud"};const b={structureKey:"b",description:"nieuw"};
 assert.deepEqual(calculationLineChanges([a],[b]).map(c=>c.kind),["removed","added"]);
 assert.throws(()=>calculationLineChanges([a],[a,a]),/Dubbele/);
});
test("database round-off does not create false price edits",()=>{
 assert.deepEqual(calculationLineChanges([{structureKey:"a",description:"x",quantity:1.123456}],[{structureKey:"a",description:"x",quantity:"1.1235"}]),[]);
});
test("the audit append uses the authenticated actor and the caller's transaction",async()=>{
 const calls:unknown[][]=[];
 const connection={execute:async(...args:unknown[])=>{calls.push(args);}} as unknown as PoolConnection;
 await appendCalculationChange(connection,{calculationId:4,versionId:8,actorId:17,kind:"draft_saved",editRevision:3,reason:"Nieuwe prijs",changes:{lines:[]}});
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0][1],[4,8,17,"draft_saved",3,"Nieuwe prijs",'{"lines":[]}']);
 await assert.rejects(appendCalculationChange(connection,{calculationId:4,versionId:8,actorId:0,kind:"draft_saved",editRevision:3,reason:"x",changes:{}}));
});
