import test from "node:test";
import assert from "node:assert/strict";
import { calcWorkbenchStructureFromLines, calculateAutomationReadiness, calculateScopeCoverage } from "./workbenchAggregate.js";

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


test("scope-dekking toont alleen dimensies die daadwerkelijk in context voorkomen",()=>{
  const coverage=calculateScopeCoverage([
    {positionRef:"K1",scopes:[{type:"building",ref:"Gebouw A"},{type:"facade",ref:"Noord"},{type:"dwelling_type",ref:"Type A"}]},
    {positionRef:"K2",scopes:[{type:"building",ref:"Gebouw A"},{type:"dwelling_type",ref:"Type A"}]},
    {positionRef:"K3",scopes:[{type:"building",ref:"Gebouw A"},{type:"facade",ref:"Zuid"}]}
  ]);
  assert.deepEqual(coverage.find(item=>item.scopeType==="building"),{
    scopeType:"building",covered:3,total:3,missingPositionRefs:[]
  });
  assert.deepEqual(coverage.find(item=>item.scopeType==="facade"),{
    scopeType:"facade",covered:2,total:3,missingPositionRefs:["K2"]
  });
  assert.deepEqual(coverage.find(item=>item.scopeType==="dwelling_type"),{
    scopeType:"dwelling_type",covered:2,total:3,missingPositionRefs:["K3"]
  });
  assert.equal(coverage.some(item=>item.scopeType==="dwelling"),false);
});


test("automatische conceptopslag vereist gereviewde, waarschuwingvrije en eenduidige posities",()=>{
  assert.deepEqual(calculateAutomationReadiness({
    concept:{unresolved:[],positions:[{positionRef:"K1",reviewStatus:"reviewed",warnings:[]}]},
    structureProposal:{unresolvedPositionRefs:[]}
  }),{canAutoSaveConcept:true,reasons:[]});

  const blocked=calculateAutomationReadiness({
    concept:{
      unresolved:["Documentselectie bevat nog een open punt."],
      positions:[
        {positionRef:"K1",reviewStatus:"proposed",warnings:["Meerdere bronbeschrijvingen gevonden."]},
        {positionRef:"K2",reviewStatus:"reviewed",warnings:[]}
      ]
    },
    structureProposal:{unresolvedPositionRefs:["K2"]}
  });
  assert.equal(blocked.canAutoSaveConcept,false);
  assert.equal(blocked.reasons.some(reason=>reason.includes("menselijke bronreview")),true);
  assert.equal(blocked.reasons.some(reason=>reason.includes("Meerdere bronbeschrijvingen")),true);
  assert.equal(blocked.reasons.some(reason=>reason.includes("K2")),true);
});
