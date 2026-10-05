import test from "node:test";
import assert from "node:assert/strict";
import { measurementKindForFact } from "./measurementSemantics.js";

const fact=(fragment:string)=>({
  id:1,document_id:1,fact_type:"width_mm",position_ref:"K12",value_text:null,value_number:1200,
  unit:"mm",source_page:1,source_fragment:fragment,extraction_method:"text",confidence:1,review_status:"reviewed"
});

test("recognizes daylight dimensions",()=>assert.equal(measurementKindForFact(fact("dagmaat 1200 mm")),"daylight"));
test("recognizes frame dimensions",()=>assert.equal(measurementKindForFact(fact("kozijnmaat 1250 mm")),"frame"));
test("does not invent a measurement kind",()=>assert.equal(measurementKindForFact(fact("breedte 1200 mm")),"unspecified"));
