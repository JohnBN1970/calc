import test from "node:test";
import assert from "node:assert/strict";
import { fusePositionSources } from "./sourceFusion.js";

function snapshot(){
  return {contract:"brebo-calculation-context-snapshot-v1",context:{
    calculation_id:1,project_id:1,document_set:null,
    documents:[
      {item_id:1,document_id:1,title:"Tekening",document_type:"drawing",document_family:"drawing",mime_type:"application/pdf",role:null,relevance:1,selection_source:"auto",review_status:"reviewed",exclusion_reason:null},
      {item_id:2,document_id:2,title:"Bestek",document_type:"specification",document_family:"specification",mime_type:"application/pdf",role:null,relevance:1,selection_source:"auto",review_status:"reviewed",exclusion_reason:null},
      {item_id:3,document_id:3,title:"Offerte",document_type:"quote",document_family:"commercial",mime_type:"application/pdf",role:null,relevance:1,selection_source:"auto",review_status:"reviewed",exclusion_reason:null}
    ],
    facts:[
      {id:1,document_id:1,fact_type:"quantity",position_ref:"K12",value_text:null,value_number:4,unit:"st",source_page:2,source_fragment:"4x K12",extraction_method:"text",confidence:1,review_status:"reviewed"},
      {id:2,document_id:1,fact_type:"width_mm",position_ref:"K12",value_text:null,value_number:1200,unit:"mm",source_page:2,source_fragment:"dagmaat 1200",extraction_method:"text",measurement_kind:"daylight",confidence:1,review_status:"reviewed"},
      {id:3,document_id:1,fact_type:"height_mm",position_ref:"K12",value_text:null,value_number:1500,unit:"mm",source_page:2,source_fragment:"dagmaat 1500",extraction_method:"text",measurement_kind:"daylight",confidence:1,review_status:"reviewed"},
      {id:4,document_id:2,fact_type:"description",position_ref:"K12",value_text:"Houten kozijn, HR++",value_number:null,unit:null,source_page:18,source_fragment:"K12 houten kozijn HR++",extraction_method:"text",confidence:.95,review_status:"reviewed"},
      {id:5,document_id:3,fact_type:"supplier_unit_price",position_ref:"K12",value_text:null,value_number:875,unit:"EUR/st",source_page:1,source_fragment:"K12 875,00",extraction_method:"text",confidence:.98,review_status:"reviewed"}
    ],takeoff:[],review:{has_context:true,proposed_documents:3,proposed_facts:5,unresolved:[]}
  }} as any;
}

test("fuses complementary geometry specification and commercial facts with provenance",()=>{
  const result=fusePositionSources(snapshot(),new Set([1,2,3]));
  const k12=result.find(item=>item.positionRef==="K12")!;
  assert.equal(k12.blocked,false);
  assert.deepEqual(k12.sourceDocumentIds,[1,2,3]);
  assert.equal(k12.facts.find(item=>item.factType==="description")?.documentId,2);
  assert.equal(k12.facts.find(item=>item.factType==="supplier_unit_price")?.valueNumber,875);
  assert.equal(k12.facts.find(item=>item.factType==="width_mm")?.measurementKind,"daylight");
});
