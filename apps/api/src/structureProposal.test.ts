import test from "node:test";
import assert from "node:assert/strict";
import { buildCalcStructureProposal } from "./structureProposal.js";
import type { CalculationConcept } from "./calculationConcept.js";

const concept:CalculationConcept={
  contract:"brebo-calc-concept-v1",sourceDocumentSetId:null,sourceSelectionVersion:null,unresolved:[],readyForRecipeProposal:true,sourceDecisions:[],
  positions:[
    {positionRef:"K1",quantity:1,widthMm:1000,heightMm:1200,description:"kozijn",supplierUnitPrice:null,sourceDocumentIds:[1],sourcePages:[1],sourceFacts:[],reviewStatus:"reviewed",scopes:[],warnings:[]},
    {positionRef:"K2",quantity:1,widthMm:1000,heightMm:1200,description:"kozijn",supplierUnitPrice:null,sourceDocumentIds:[1],sourcePages:[1],sourceFacts:[],reviewStatus:"reviewed",scopes:[],warnings:[]},
    {positionRef:"D1",quantity:1,widthMm:900,heightMm:2300,description:"deur",supplierUnitPrice:null,sourceDocumentIds:[1],sourcePages:[2],sourceFacts:[],reviewStatus:"reviewed",scopes:[],warnings:[]}
  ]
};

test("eenduidige receptvoorstellen worden per recept gegroepeerd",()=>{
  const result=buildCalcStructureProposal({concept,recipeProposals:[
    {positionRef:"K1",recipeRef:"10",label:"Kozijnen",priority:10,confidence:.9,reasons:[],reviewRequired:true},
    {positionRef:"K2",recipeRef:"10",label:"Kozijnen",priority:10,confidence:.9,reasons:[],reviewRequired:true},
    {positionRef:"D1",recipeRef:"20",label:"Deuren",priority:10,confidence:.9,reasons:[],reviewRequired:true}
  ]});
  assert.equal(result.groups.length,2);
  assert.deepEqual(result.groups.find(group=>group.recipeRef==="10")?.positionRefs,["K1","K2"]);
  assert.deepEqual(result.unresolvedPositionRefs,[]);
});

test("meerdere of ontbrekende receptvoorstellen worden niet automatisch gekozen",()=>{
  const result=buildCalcStructureProposal({concept,recipeProposals:[
    {positionRef:"K1",recipeRef:"10",label:"Kozijnen A",priority:10,confidence:.9,reasons:[],reviewRequired:true},
    {positionRef:"K1",recipeRef:"11",label:"Kozijnen B",priority:9,confidence:.8,reasons:[],reviewRequired:true}
  ]});
  assert.deepEqual(result.unresolvedPositionRefs,["D1","K1","K2"]);
  assert.equal(result.groups.at(-1)?.label,"Nog te bepalen");
});
