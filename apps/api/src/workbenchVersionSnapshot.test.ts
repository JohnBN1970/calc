import test from "node:test";
import assert from "node:assert/strict";
import { createWorkbenchEstablishedSnapshot, fingerprintWorkbenchSnapshot, snapshotDate, snapshotJson } from "./workbenchVersionSnapshot.js";

const base=()=>({
  calculationId:1,
  versionId:2,
  versionNo:1,
  establishedAt:"2026-10-04T08:00:00.000Z",
  lines:[
    {
      structureKey:"chapter-a",parentStructureKey:null,lineType:"chapter",sortOrder:10,code:"01",description:"Kozijnen",unit:null,quantity:null,
      labourNorm:null,labourTotalHours:null,labourHoursInputMode:null,labourUnitCost:0,materialUnitCost:0,equipmentUnitCost:0,
      subcontractingUnitCost:0,otherUnitCost:0,vatRegimeId:null,priceSourceType:"manual",officeSourceId:null,sourceReference:null,
      sourceSupplier:null,sourceUnitPrice:null,sourcePriceDate:null,sourceDocumentId:null,sourceDetails:null
    },
    {
      structureKey:"line-a",parentStructureKey:"chapter-a",lineType:"item",sortOrder:20,code:"01.01",description:"Regel",unit:"st",quantity:1,
      labourNorm:null,labourTotalHours:null,labourHoursInputMode:null,labourUnitCost:0,materialUnitCost:100,equipmentUnitCost:0,
      subcontractingUnitCost:0,otherUnitCost:0,vatRegimeId:1,priceSourceType:"manual",officeSourceId:null,sourceReference:null,
      sourceSupplier:null,sourceUnitPrice:null,sourcePriceDate:null,sourceDocumentId:null,sourceDetails:null
    }
  ],
  allocations:[],
  subcalculations:[],
  subcalculationScopes:[],
  subcalculationMemberships:[],
  tailCosts:[],
  lineScopes:[],
  commercial:{
    directCost:100,
    markupAmount:20,
    salesPrice:120,
    summary:{
      purchase:100,sales:120,margin:20,marginPct:20/120*100,vat:25.2,totalInclVat:145.2,vatRate:21,
      vatBreakdown:[{code:"21",label:"21% btw",rate:21,taxableBase:120,vatAmount:25.2,reverseCharged:false}]
    }
  }
});

test("workbench snapshot is stable and fingerprintable",()=>{
  const snapshot=createWorkbenchEstablishedSnapshot(base());
  assert.equal(snapshot.contract,"brebo-calc-workbench-snapshot-v3");
  assert.deepEqual(snapshot.lines.map(line=>line.sortOrder),[10,20]);
  assert.match(fingerprintWorkbenchSnapshot(snapshot),/^[0-9a-f]{64}$/);
  assert.equal(fingerprintWorkbenchSnapshot(snapshot),fingerprintWorkbenchSnapshot(snapshot));
});

test("workbench snapshot fails closed when VAT does not cover sales",()=>{
  const input=base();
  input.commercial.summary.vatBreakdown[0].taxableBase=100;
  assert.throws(()=>createWorkbenchEstablishedSnapshot(input),/VAT breakdown/);
});

test("workbench snapshot fails on missing structural parent",()=>{
  const input=base();
  input.lines[1].parentStructureKey="missing";
  assert.throws(()=>createWorkbenchEstablishedSnapshot(input),/Missing parent structure key/);
});


test("snapshot bronvelden worden canoniek geserialiseerd",()=>{
  assert.equal(snapshotDate(new Date("2026-10-04T12:34:56.000Z")),"2026-10-04");
  assert.equal(snapshotDate("2026-10-04 00:00:00"),"2026-10-04");
  assert.equal(snapshotJson({x:1,y:[2,3]}),JSON.stringify({x:1,y:[2,3]}));
  assert.equal(snapshotJson('{"x":1}'),'{"x":1}');
  assert.throws(()=>snapshotDate("04-10-2026"),/Invalid snapshot date/);
  assert.throws(()=>snapshotJson("[object Object]"));
});


test("snapshot met alleen optieregels geldt als lege calculatie",()=>{
  const input=base();
  input.lines=input.lines.map(line=>({...line,lineType:"option"}));
  assert.throws(()=>createWorkbenchEstablishedSnapshot(input),/empty calculation/);
});
