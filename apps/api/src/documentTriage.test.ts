import test from "node:test";
import assert from "node:assert/strict";
import { triageCalculationDocuments } from "./documentTriage.js";
import type { OfficeCalculationContextSnapshot } from "./officeClient.js";

function snapshot():OfficeCalculationContextSnapshot{
  return{
    contract:"brebo-calculation-context-snapshot-v1",
    context:{
      calculation_id:1,project_id:2,document_set:null,
      documents:[
        {item_id:1,document_id:10,title:"Kozijnstaat",document_type:"drawing",document_family:"schedule",mime_type:"application/pdf",role:null,relevance:1,selection_source:"source",review_status:"reviewed",exclusion_reason:null},
        {item_id:2,document_id:20,title:"Offerte leverancier",document_type:"quote",document_family:"commercial",mime_type:"application/pdf",role:null,relevance:1,selection_source:"source",review_status:"proposed",exclusion_reason:null},
        {item_id:3,document_id:30,title:"Algemene brief",document_type:"letter",document_family:"general",mime_type:"application/pdf",role:null,relevance:.5,selection_source:"source",review_status:"proposed",exclusion_reason:null}
      ],
      facts:[
        {id:1,document_id:10,fact_type:"quantity",position_ref:"K1",value_text:null,value_number:2,unit:"st",source_page:1,source_fragment:null,extraction_method:"managed",confidence:.9,review_status:"reviewed"},
        {id:2,document_id:10,fact_type:"width_mm",position_ref:"K1",value_text:null,value_number:1200,unit:"mm",source_page:1,source_fragment:null,extraction_method:"managed",confidence:.9,review_status:"reviewed"},
        {id:3,document_id:10,fact_type:"height_mm",position_ref:"K1",value_text:null,value_number:1500,unit:"mm",source_page:1,source_fragment:null,extraction_method:"managed",confidence:.9,review_status:"reviewed"},
        {id:4,document_id:20,fact_type:"supplier_unit_price",position_ref:"K1",value_text:null,value_number:850,unit:"EUR",source_page:1,source_fragment:null,extraction_method:"managed",confidence:.8,review_status:"proposed"}
      ],
      takeoff:[],
      review:{has_context:true,proposed_documents:2,proposed_facts:1,unresolved:[]}
    }
  };
}

test("Calc kiest complete geometrie als primaire calculatiebron",()=>{
  const result=triageCalculationDocuments(snapshot());
  assert.equal(result[0].documentId,10);
  assert.equal(result[0].status,"primary");
  assert.ok(result[0].score>=60);
  assert.deepEqual(result[0].positionRefs,["K1"]);
});

test("prijsdocument blijft ondersteunend en algemene brief vraagt review",()=>{
  const result=triageCalculationDocuments(snapshot());
  assert.equal(result.find(item=>item.documentId===20)?.status,"supporting");
  assert.equal(result.find(item=>item.documentId===30)?.status,"review");
});
