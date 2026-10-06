import test from "node:test";
import assert from "node:assert/strict";
import { proposeRecipesForConcept } from "./recipeProposal.js";
import type { CalculationConcept } from "./calculationConcept.js";

const concept:CalculationConcept={
  contract:"brebo-calc-concept-v1",
  sourceDocumentSetId:null,
  sourceSelectionVersion:null,
  unresolved:[],
  readyForRecipeProposal:true,
  sourceDecisions:[],
  positions:[{
    positionRef:"K12",quantity:1,widthMm:1200,heightMm:1500,description:"kozijn",supplierUnitPrice:null,
    sourceDocumentIds:[1,2],sourcePages:[2,18],reviewStatus:"reviewed",scopes:[],warnings:[],
    sourceFacts:[
      {factType:"width_mm",measurementKind:"daylight",valueText:null,valueNumber:1200,unit:"mm",documentId:1,sourcePage:2,sourceFragment:"dagmaat 1200",confidence:1,reviewStatus:"reviewed"},
      {factType:"description",measurementKind:null,valueText:"Houten kozijn HR++",valueNumber:null,unit:null,documentId:2,sourcePage:18,sourceFragment:"K12 houten kozijn HR++ beglazing",confidence:.98,reviewStatus:"reviewed"}
    ]
  }]
};

test("recipe applicability can match fused bestek or mail evidence",()=>{
  const proposals=proposeRecipesForConcept(concept,[{
    recipeRef:"10",label:"Houten kozijn HR++",priority:10,
    descriptionIncludes:["houten","hr++"]
  }]);
  assert.equal(proposals.length,1);
  assert.equal(proposals[0].positionRef,"K12");
  assert.ok(proposals[0].reasons.some(reason=>reason.includes("broninhoud bevat")));
  assert.ok(proposals[0].reasons.some(reason=>reason.includes("meerdere actuele bronnen")));
  const hrEvidence=proposals[0].evidence.find(item=>item.term.toLocaleLowerCase("nl-NL")==="hr++");
  assert.equal(hrEvidence?.documentId,2);
  assert.equal(hrEvidence?.sourcePage,18);
});
