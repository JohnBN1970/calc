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
    sourceDocumentIds:[1,2],sourcePages:[2,18],sourceComponents:[],reviewStatus:"reviewed",scopes:[],warnings:[],
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


test("recipe applicability can match reviewed vak component evidence",()=>{
  const componentConcept:CalculationConcept=structuredClone(concept);
  componentConcept.positions[0].sourceFacts=[];
  componentConcept.positions[0].description="kozijn";
  componentConcept.positions[0].sourceComponents=[{
    id:50,document_id:3,position_ref:"K12",component_ref:"V1",parent_component_ref:"K12",
    component_type:"draaikiep",classification_ref:null,description:"Draaikiep vak met HR++ glas",
    quantity:1,width_mm:600,height_mm:1200,area_m2:null,perimeter_m:null,source_page:7,
    source_fragment:"V1 draaikiep HR++",extraction_method:"managed",confidence:.98,review_status:"reviewed",
    component_kind:"operable",component_kind_source:"explicit",calculated_area_m2:.72,
    calculated_perimeter_m:3.6,effective_area_m2:.72,effective_perimeter_m:3.6,
    geometry_status:"complete",warnings:[]
  }];
  const proposals=proposeRecipesForConcept(componentConcept,[{
    recipeRef:"21",label:"Draaikiep HR++",priority:20,descriptionIncludes:["draaikiep","hr++"]
  }]);
  assert.equal(proposals.length,1);
  const evidence=proposals[0].evidence.find(item=>item.term==="draaikiep");
  assert.equal(evidence?.documentId,3);
  assert.equal(evidence?.sourcePage,7);
  assert.equal(evidence?.factType,"component:operable");
});
