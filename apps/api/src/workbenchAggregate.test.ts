import test from "node:test";
import assert from "node:assert/strict";
import { applyRecipeProposalDecisions, calcWorkbenchStructureFromLines, calculateAutomationReadiness, calculateScopeCoverage, explainRecipeSelectionIssues } from "./workbenchAggregate.js";

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


test("current recipe review decisions drive automatic candidates without leaking across source versions",()=>{
  const proposals=[
    {positionRef:"K1",recipeRef:"10",label:"A",priority:10,confidence:.9,reasons:[],evidence:[],reviewRequired:true},
    {positionRef:"K1",recipeRef:"11",label:"B",priority:9,confidence:.8,reasons:[],evidence:[],reviewRequired:true},
    {positionRef:"K2",recipeRef:"20",label:"C",priority:10,confidence:.9,reasons:[],evidence:[],reviewRequired:true}
  ];
  const decisions=[
    {positionRef:"K1",recipeVersionId:10,decision:"rejected" as const,reason:null,sourceSelectionVersion:"v2",decidedBy:1},
    {positionRef:"K1",recipeVersionId:11,decision:"accepted" as const,reason:null,sourceSelectionVersion:"v2",decidedBy:1},
    {positionRef:"K2",recipeVersionId:20,decision:"rejected" as const,reason:null,sourceSelectionVersion:"old",decidedBy:1}
  ];
  const current=applyRecipeProposalDecisions({proposals,decisions,sourceSelectionVersion:"v2"});
  assert.deepEqual(current.map(item=>item.recipeRef),["11","20"]);

  const changedSources=applyRecipeProposalDecisions({proposals,decisions,sourceSelectionVersion:"v3"});
  assert.deepEqual(changedSources.map(item=>item.recipeRef),["10","11","20"]);
});


test("unresolved recipe selection explains no match, rejection and ambiguity separately",()=>{
  const raw=[
    {positionRef:"K2",recipeRef:"20",label:"A",priority:1,confidence:.8,reasons:[],evidence:[],reviewRequired:true},
    {positionRef:"K3",recipeRef:"30",label:"B",priority:1,confidence:.8,reasons:[],evidence:[],reviewRequired:true},
    {positionRef:"K3",recipeRef:"31",label:"C",priority:1,confidence:.8,reasons:[],evidence:[],reviewRequired:true},
    {positionRef:"K4",recipeRef:"40",label:"D",priority:1,confidence:.8,reasons:[],evidence:[],reviewRequired:true},
    {positionRef:"K4",recipeRef:"41",label:"E",priority:1,confidence:.8,reasons:[],evidence:[],reviewRequired:true}
  ];
  const decisions=[
    {positionRef:"K2",recipeVersionId:20,decision:"rejected" as const,reason:null,sourceSelectionVersion:"v1",decidedBy:1},
    {positionRef:"K4",recipeVersionId:40,decision:"accepted" as const,reason:null,sourceSelectionVersion:"v1",decidedBy:1},
    {positionRef:"K4",recipeVersionId:41,decision:"accepted" as const,reason:null,sourceSelectionVersion:"v1",decidedBy:1}
  ];
  const effective=applyRecipeProposalDecisions({proposals:raw,decisions,sourceSelectionVersion:"v1"});
  const issues=explainRecipeSelectionIssues({positions:["K1","K2","K3","K4"].map(positionRef=>({positionRef})),rawProposals:raw,effectiveProposals:effective,decisions,sourceSelectionVersion:"v1"});
  assert.equal(issues.find(item=>item.positionRef==="K1")?.code,"no_match");
  assert.equal(issues.find(item=>item.positionRef==="K2")?.code,"all_rejected");
  assert.equal(issues.find(item=>item.positionRef==="K3")?.code,"multiple_candidates");
  assert.equal(issues.find(item=>item.positionRef==="K4")?.code,"multiple_accepted");
});
