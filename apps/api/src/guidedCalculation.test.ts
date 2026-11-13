import { test } from "node:test";
import assert from "node:assert/strict";
import { guidanceQuestions, buildGuidedProposal, normalizeGuidedAnswers, guidedPublicationReasons, guidanceBasis, guidedLineFromDatabase, type GuidedLine } from "./guidedCalculation.js";
import { calculateLineAmount } from "./calculationLineAmount.js";

const base:GuidedLine[]=[{structureKey:"ordinary",lineType:"item",code:"31",description:"Kozijn",quantity:2,unit:"st",materialUnitCost:450,vatRegimeId:1,priceSourceType:"article"}];
function completed(){
  const answers=normalizeGuidedAnswers({});
  for(const q of guidanceQuestions){answers[q.id].decision=q.kind==="cost"?"no":"confirmed";answers[q.id].explanation="Gecontroleerd in werkplan / bestaande scope.";}
  answers.crane={decision:"yes",quantity:6,unit:"uur",unitPrice:125,carrier:"equipment",vatRegimeId:1,explanation:"Kraanofferte K-123, inclusief aan-/afvoer."};
  return answers;
}
test("crane answer becomes six hours of equipment, not six hundred hours or subcontracting",()=>{
  const proposal=buildGuidedProposal(completed(),base,17);
  assert.equal(proposal.complete,true);
  const crane=proposal.lines.find(line=>line.code==="VRG-CRANE")!;
  assert.equal(crane.equipmentUnitCost,125);
  assert.equal(crane.subcontractingUnitCost,0);
  assert.equal(calculateLineAmount(crane),750);
  assert.deepEqual(guidedPublicationReasons([...base,...proposal.lines]),[]);
  assert.equal(JSON.parse(proposal.lines[0].sourceDetails!).actorId,17);
  assert.doesNotThrow(()=>JSON.parse(crane.sourceDetails!));
});
test("unanswered questions may be saved as a draft but block publication",()=>{
  const proposal=buildGuidedProposal({},base,17);
  assert.equal(proposal.complete,false);
  assert.equal(proposal.lines.length,1);
  assert.equal(guidedPublicationReasons([...base,...proposal.lines]).length,12);
});
test("missing price is an open question and never becomes a zero-price cost line",()=>{
  const answers=completed();answers.crane.unitPrice=null;
  const proposal=buildGuidedProposal(answers,base,17);
  assert.equal(proposal.complete,false);
  assert.equal(proposal.lines.length,1);
  assert.ok(proposal.reasons.some(reason=>reason.includes("prijs")));
});
test("not needed requires a reason so already-budgeted work can be acknowledged",()=>{
  const answers=completed();answers.toilet.explanation="";
  assert.ok(buildGuidedProposal(answers,base,17).reasons.some(reason=>reason.includes("bouwtoilet")));
});
test("negative, nonfinite, string and sub-storage-precision prices are rejected",()=>{
  for(const unitPrice of [-1,0,NaN,Infinity,"125",0.00001]){
    assert.throws(()=>buildGuidedProposal({...completed(),crane:{...completed().crane,unitPrice}},base,17));
  }
  assert.throws(()=>normalizeGuidedAnswers({unknown:{decision:"yes"}}));
});
test("changed quantities, sources or tariffs require renewed review",()=>{
  const proposal=buildGuidedProposal(completed(),base,17);
  for(const change of [{quantity:3},{sourceDetails:'{"document":12}'},{materialUnitCost:460}]){
    assert.ok(guidedPublicationReasons([{...base[0],...change},...proposal.lines]).some(reason=>reason.includes("gewijzigd")));
  }
});
test("deleted, duplicate or edited guided costs cannot pass the question gate",()=>{
  const proposal=buildGuidedProposal(completed(),base,17);
  assert.ok(guidedPublicationReasons([...base,proposal.lines[0]]).length);
  assert.ok(guidedPublicationReasons([...base,...proposal.lines,proposal.lines[1]]).length);
  assert.ok(guidedPublicationReasons([...base,proposal.lines[0],{...proposal.lines[1],quantity:8}]).length);
  assert.ok(guidedPublicationReasons([...base,proposal.lines[1]]).length);
});
test("changing a yes to no removes the proposed cost on replacement",()=>{
  const answers=completed();const first=buildGuidedProposal(answers,base,17);
  answers.crane.decision="no";
  const second=buildGuidedProposal(answers,[...base,...first.lines],17);
  assert.equal(second.lines.length,1);
  assert.deepEqual(guidedPublicationReasons([...base,...second.lines]),[]);
  assert.ok(guidedPublicationReasons([...base,...second.lines,first.lines[1]]).length);
});
test("database decimals and changed database identity preserve a valid review",()=>{
  const answers=completed();answers.crane.quantity=1.234567;answers.crane.unitPrice=123.456789;
  const proposal=buildGuidedProposal(answers,base,17);
  const rows=[...base,...proposal.lines].map((line,index)=>guidedLineFromDatabase({
    id:index+100,structure_key:line.structureKey,line_type:line.lineType,code:line.code,description:line.description,unit:line.unit,
    quantity:String(line.quantity??0),labour_total_hours:line.labourTotalHours??null,
    labour_unit_cost:String(line.labourUnitCost??0),material_unit_cost:String(line.materialUnitCost??0),equipment_unit_cost:String(line.equipmentUnitCost??0),
    subcontracting_unit_cost:String(line.subcontractingUnitCost??0),other_unit_cost:String(line.otherUnitCost??0),vat_regime_id:line.vatRegimeId??null,
    price_source_type:line.priceSourceType,source_reference:line.sourceReference,source_details:line.sourceDetails
  }));
  assert.deepEqual(guidedPublicationReasons(rows),[]);
  assert.equal(guidanceBasis(rows),guidanceBasis([...base,...proposal.lines]));
});
test("automatic recipe proposals require questions; legacy manual calculation remains usable",()=>{
  assert.deepEqual(guidedPublicationReasons(base),[]);
  assert.ok(guidedPublicationReasons([{...base[0],priceSourceType:"recipe"}]).length);
});
test("corrupt metadata is reported without silently accepting the review",()=>{
  assert.ok(guidedPublicationReasons([...base,{lineType:"note",structureKey:"guided:review",sourceDetails:"broken"}]).length);
});
