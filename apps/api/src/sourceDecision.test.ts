import test from "node:test";
import assert from "node:assert/strict";
import { sourceDecisionReason, differentMeasurementKindDecision } from "./sourceDecision.js";

test("different measurement kinds are not treated as a value conflict",()=>{
  const result=differentMeasurementKindDecision({positionRef:"K12",factType:"width_mm",kinds:["daylight","frame"],documentIds:[1,2]});
  assert.equal(result.status,"different_measurement_kind");
  assert.equal(result.leadingDocumentId,null);
});

test("different active values require review",()=>{
  const result=sourceDecisionReason({positionRef:"K12",factType:"width_mm",measurementKind:"daylight",values:[{documentId:1,value:"1200"},{documentId:2,value:"1250"}]});
  assert.equal(result.status,"conflict");
  assert.equal(result.leadingDocumentId,null);
});

test("a proven superseded source can yield to its current revision",()=>{
  const result=sourceDecisionReason({
    positionRef:"K12",factType:"width_mm",measurementKind:"daylight",
    values:[{documentId:1,value:"1200"},{documentId:2,value:"1250"}],
    supersededBy:new Map([[1,2],[2,null]])
  });
  assert.equal(result.status,"superseded");
  assert.equal(result.leadingDocumentId,2);
});
