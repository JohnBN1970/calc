import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTakeoffComponents } from "./componentTakeoff.js";

const base={
  document_id:1,position_ref:"K1",classification_ref:null,description:null,
  source_page:1,source_fragment:null,extraction_method:"test",confidence:1,review_status:"reviewed"
};

test("component geometry derives area and perimeter from BxH and quantity",()=>{
  const [row]=evaluateTakeoffComponents([{
    ...base,id:1,component_ref:"vak-1",parent_component_ref:null,component_type:"vak",
    quantity:2,width_mm:1000,height_mm:1500,area_m2:null,perimeter_m:null
  }]);
  assert.equal(row.geometry_status,"complete");
  assert.equal(row.effective_area_m2,3);
  assert.equal(row.effective_perimeter_m,10);
  assert.deepEqual(row.warnings,[]);
});

test("component geometry flags child dimensions outside parent",()=>{
  const rows=evaluateTakeoffComponents([
    {...base,id:1,component_ref:"kozijn",parent_component_ref:null,component_type:"frame",quantity:1,width_mm:1000,height_mm:1500,area_m2:null,perimeter_m:null},
    {...base,id:2,component_ref:"vak-1",parent_component_ref:"kozijn",component_type:"glass",quantity:1,width_mm:1100,height_mm:1400,area_m2:null,perimeter_m:null}
  ]);
  assert.equal(rows[1].warnings.some(x=>x.includes("breder")),true);
});

test("unreviewed or incomplete component stays visible as review issue",()=>{
  const [row]=evaluateTakeoffComponents([{
    ...base,id:3,component_ref:"vak-2",parent_component_ref:null,component_type:"glass",
    quantity:1,width_mm:null,height_mm:900,area_m2:null,perimeter_m:null,review_status:"proposed"
  }]);
  assert.equal(row.geometry_status,"incomplete");
  assert.equal(row.warnings.some(x=>x.includes("Breedte")),true);
  assert.equal(row.warnings.some(x=>x.includes("review")),true);
});
