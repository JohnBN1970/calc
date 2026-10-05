import test from "node:test";
import assert from "node:assert/strict";
import { buildConceptFromOfficeContext } from "./calculationConcept.js";
import type { OfficeCalculationContextSnapshot } from "./officeClient.js";

function makeSnapshot(primary:boolean):OfficeCalculationContextSnapshot{
  return {
    contract:"brebo-calculation-context-snapshot-v1",
    context:{
      calculation_id:1,project_id:2,document_set:null,
      documents:[
        {item_id:1,document_id:10,title:"Kozijnstaat",document_type:"drawing",document_family:"schedule",mime_type:"application/pdf",role:null,relevance:1,selection_source:"source",review_status:primary?"reviewed":"proposed",exclusion_reason:primary?null:"handmatige review vereist"},
        {item_id:2,document_id:20,title:"Prijsblad",document_type:"quote",document_family:"commercial",mime_type:"application/pdf",role:null,relevance:1,selection_source:"source",review_status:"proposed",exclusion_reason:"nog beoordelen"}
      ],
      facts:[
        {id:1,document_id:10,fact_type:"quantity",position_ref:"K1",value_text:null,value_number:2,unit:"st",source_page:1,source_fragment:null,extraction_method:"managed",confidence:.9,review_status:"reviewed"},
        {id:2,document_id:10,fact_type:"width_mm",position_ref:"K1",value_text:null,value_number:1200,unit:"mm",source_page:1,source_fragment:null,extraction_method:"managed",confidence:.9,review_status:"reviewed"},
        {id:3,document_id:10,fact_type:"height_mm",position_ref:"K1",value_text:null,value_number:1500,unit:"mm",source_page:1,source_fragment:null,extraction_method:"managed",confidence:.9,review_status:"reviewed"},
        {id:4,document_id:20,fact_type:"supplier_unit_price",position_ref:"K1",value_text:null,value_number:999,unit:"EUR",source_page:1,source_fragment:null,extraction_method:"managed",confidence:.8,review_status:"proposed"}
      ],
      position_scopes:[{position_ref:"K1",building:"Gebouw A",facade:"Noord",dwelling:"A-01",dwelling_type:"Type A",building_part:"Voorgevel"}],
      takeoff:[{id:1,position_ref:"K1",quantity:2,width_mm:1200,height_mm:1500,area_m2:3.6,perimeter_m:10.8,top_m:2.4,bottom_m:2.4,left_m:3,right_m:3}],
      review:{has_context:true,proposed_documents:1,proposed_facts:1,unresolved:[]}
    }
  };
}

test("review-document levert geen stille leveranciersprijs aan Calc-concept",()=>{
  const concept=buildConceptFromOfficeContext(makeSnapshot(true));
  assert.equal(concept.positions.length,1);
  assert.equal(concept.positions[0].supplierUnitPrice,null);
  assert.deepEqual(concept.positions[0].sourceDocumentIds,[10]);
  assert.ok(concept.unresolved.some(message=>message.includes("review-documenten")));
});

test("positie zonder primaire geometrie wordt niet calculabel",()=>{
  const concept=buildConceptFromOfficeContext(makeSnapshot(false));
  assert.equal(concept.positions.length,0);
  assert.equal(concept.readyForRecipeProposal,false);
  assert.ok(concept.unresolved.some(message=>message.includes("primair geselecteerd document")));
});


test("Office positiecontext wordt alleen als Calc-scope overgenomen",()=>{
  const concept=buildConceptFromOfficeContext(makeSnapshot(true));
  assert.deepEqual(concept.positions[0].scopes,[
    {type:"building",ref:"Gebouw A"},
    {type:"facade",ref:"Noord"},
    {type:"dwelling",ref:"A-01"},
    {type:"dwelling_type",ref:"Type A"},
    {type:"building_part",ref:"Voorgevel"}
  ]);
});


test("ontbrekende Office positiecontext laat Calc-scopes leeg",()=>{
  const snapshot=makeSnapshot(true);
  delete snapshot.context.position_scopes;
  const concept=buildConceptFromOfficeContext(snapshot);
  assert.deepEqual(concept.positions[0].scopes,[]);
});
