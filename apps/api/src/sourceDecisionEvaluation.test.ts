import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSourceDecisions } from "./sourceDecisionEvaluation.js";

function snapshot(input:{sameNumber:boolean}){
  return {
    contract:"brebo-calculation-context-snapshot-v1",
    context:{
      calculation_id:1,project_id:1,document_set:null,
      documents:[
        {item_id:1,document_id:1,title:"Kozijnstaat A",document_type:"drawing",document_family:"drawing",mime_type:"application/pdf",role:null,relevance:1,selection_source:"auto",review_status:"reviewed",exclusion_reason:null,document_number:input.sameNumber?"T-100":"T-100",revision:"A",revision_date:"2026-01-01",document_status:"definitief"},
        {item_id:2,document_id:2,title:"Kozijnstaat B",document_type:"drawing",document_family:"drawing",mime_type:"application/pdf",role:null,relevance:1,selection_source:"auto",review_status:"reviewed",exclusion_reason:null,document_number:input.sameNumber?"T-100":"T-200",revision:"B",revision_date:"2026-02-01",document_status:"definitief"}
      ],
      facts:[
        {id:1,document_id:1,fact_type:"width_mm",position_ref:"K12",value_text:null,value_number:1200,unit:"mm",source_page:1,source_fragment:"dagmaat",extraction_method:"text",measurement_kind:"daylight",confidence:1,review_status:"reviewed"},
        {id:2,document_id:2,fact_type:"width_mm",position_ref:"K12",value_text:null,value_number:1250,unit:"mm",source_page:1,source_fragment:"dagmaat",extraction_method:"text",measurement_kind:"daylight",confidence:1,review_status:"reviewed"}
      ],
      takeoff:[],review:{has_context:true,proposed_documents:2,proposed_facts:2,unresolved:[]}
    }
  } as any;
}

test("proven newer revision supersedes older conflicting value",()=>{
  const [decision]=evaluateSourceDecisions(snapshot({sameNumber:true}));
  assert.equal(decision.status,"superseded");
  assert.equal(decision.leadingDocumentId,2);
  assert.equal(decision.leadingValue,"1250");
});

test("different current documents remain a real conflict",()=>{
  const [decision]=evaluateSourceDecisions(snapshot({sameNumber:false}));
  assert.equal(decision.status,"conflict");
  assert.equal(decision.leadingDocumentId,null);
});
