import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTakeoffComponents, summarizeTakeoffByPosition } from "./componentTakeoff.js";

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


test("component type semantics distinguish glass, operable, door, panel and transom",()=>{
  const rows=evaluateTakeoffComponents([
    {...base,id:10,component_ref:"g1",parent_component_ref:null,component_type:"glass",description:null,quantity:1,width_mm:500,height_mm:700,area_m2:null,perimeter_m:null},
    {...base,id:11,component_ref:"v2",parent_component_ref:null,component_type:null,description:"draaikiep vak",quantity:1,width_mm:600,height_mm:800,area_m2:null,perimeter_m:null},
    {...base,id:12,component_ref:"d1",parent_component_ref:null,component_type:"deur",description:null,quantity:1,width_mm:900,height_mm:2100,area_m2:null,perimeter_m:null},
    {...base,id:13,component_ref:"p1",parent_component_ref:null,component_type:null,description:"sandwich paneel",quantity:1,width_mm:400,height_mm:500,area_m2:null,perimeter_m:null},
    {...base,id:14,component_ref:"kalf-1",parent_component_ref:null,component_type:null,description:"tussenkalf",quantity:1,width_mm:1000,height_mm:50,area_m2:null,perimeter_m:null}
  ]);
  assert.deepEqual(rows.map(row=>row.component_kind),["glass","operable","door","panel","transom"]);
  assert.equal(rows[0].component_kind_source,"explicit");
  assert.equal(rows[1].component_kind_source,"inferred");
});

test("unknown component type is not guessed silently",()=>{
  const [row]=evaluateTakeoffComponents([{
    ...base,id:15,component_ref:"x1",parent_component_ref:null,component_type:null,description:"bijzonder onderdeel",
    quantity:1,width_mm:100,height_mm:100,area_m2:null,perimeter_m:null
  }]);
  assert.equal(row.component_kind,"unknown");
  assert.equal(row.warnings.some(x=>x.includes("niet eenduidig")),true);
});


test("component relation exposes dimension deltas to parent",()=>{
  const rows=evaluateTakeoffComponents([
    {...base,id:20,component_ref:"vak-1",parent_component_ref:null,component_type:"field",description:null,quantity:1,width_mm:1000,height_mm:1200,area_m2:null,perimeter_m:null},
    {...base,id:21,component_ref:"glas-1",parent_component_ref:"vak-1",component_type:"glass",description:null,quantity:1,width_mm:960,height_mm:1160,area_m2:null,perimeter_m:null}
  ]);
  assert.equal(rows[1].relation_status,"ok");
  assert.equal(rows[1].parent_component_kind,"field");
  assert.equal(rows[1].width_delta_to_parent_mm,40);
  assert.equal(rows[1].height_delta_to_parent_mm,40);
});

test("missing and circular parent relations are reviewable",()=>{
  const missing=evaluateTakeoffComponents([
    {...base,id:22,component_ref:"glas-2",parent_component_ref:"vak-x",component_type:"glass",description:null,quantity:1,width_mm:500,height_mm:600,area_m2:null,perimeter_m:null}
  ])[0];
  assert.equal(missing.relation_status,"missing_parent");
  assert.equal(missing.warnings.some(x=>x.includes("ontbreekt")),true);

  const cycle=evaluateTakeoffComponents([
    {...base,id:23,component_ref:"a",parent_component_ref:"b",component_type:"field",description:null,quantity:1,width_mm:500,height_mm:600,area_m2:null,perimeter_m:null},
    {...base,id:24,component_ref:"b",parent_component_ref:"a",component_type:"field",description:null,quantity:1,width_mm:500,height_mm:600,area_m2:null,perimeter_m:null}
  ]);
  assert.equal(cycle.some(row=>row.relation_status==="cycle"),true);
});


test("position summary rolls up glass and vak readiness",()=>{
  const evaluated=evaluateTakeoffComponents([
    {...base,id:30,component_ref:"vak-1",parent_component_ref:null,component_type:"field",description:null,quantity:1,width_mm:1000,height_mm:1200,area_m2:null,perimeter_m:null},
    {...base,id:31,component_ref:"glas-1",parent_component_ref:"vak-1",component_type:"glass",description:null,quantity:2,width_mm:960,height_mm:1160,area_m2:null,perimeter_m:null},
    {...base,id:32,component_ref:"dk-1",parent_component_ref:"vak-1",component_type:"draaikiep",description:null,quantity:1,width_mm:500,height_mm:1000,area_m2:null,perimeter_m:null}
  ]);
  const [summary]=summarizeTakeoffByPosition(evaluated);
  assert.equal(summary.position_ref,"K1");
  assert.equal(summary.glass_count,2);
  assert.equal(summary.operable_count,1);
  assert.equal(summary.glass_area_m2,2.2272);
  assert.equal(summary.ready_for_glass_takeoff,true);
});

test("glass without valid parent is not ready for glass takeoff",()=>{
  const evaluated=evaluateTakeoffComponents([
    {...base,id:33,component_ref:"glas-x",parent_component_ref:null,component_type:"glass",description:null,quantity:1,width_mm:500,height_mm:600,area_m2:null,perimeter_m:null}
  ]);
  const [summary]=summarizeTakeoffByPosition(evaluated);
  assert.equal(summary.ready_for_glass_takeoff,false);
});
