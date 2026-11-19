import assert from "node:assert/strict";
import test from "node:test";
import { canReleaseReviewedLines, evaluatePublicationReviewGate, validateLineReview } from "./lineReviewPolicy.js";

const approved = { lineId: 1, authorActorId: 10, reviewerActorId: 20, decision: "approved" as const, comment: "" };
test("second head sales reviewer can approve", () => assert.equal(validateLineReview(approved, "head_sales"), null));
test("self approval is rejected", () => assert.match(validateLineReview({...approved,reviewerActorId:10},"administrator") ?? "", /eigen/));
test("calculator cannot approve", () => assert.match(validateLineReview(approved,"calculator") ?? "", /Hoofd Sales/));
test("rejection requires comment", () => assert.match(validateLineReview({...approved,decision:"rejected",comment:"  "},"head_sales") ?? "", /opmerking/));
test("release requires all distinct approved lines", () => {
 assert.equal(canReleaseReviewedLines([1],[approved]),true);
 assert.equal(canReleaseReviewedLines([1,2],[approved]),false);
 assert.equal(canReleaseReviewedLines([1,1],[approved]),false);
 assert.equal(canReleaseReviewedLines([1],[{...approved,decision:"rejected"}]),false);
 assert.equal(canReleaseReviewedLines([1],[{...approved,reviewerActorId:10}]),false);
});

test("publication review gate is opt-in and fails closed when enabled", () => {
  assert.equal(evaluatePublicationReviewGate([1], [], false).allowed,true);
  assert.equal(evaluatePublicationReviewGate([1], [], true).allowed,false);
  assert.equal(evaluatePublicationReviewGate([1], [approved], true).allowed,true);
  assert.equal(evaluatePublicationReviewGate([1,2], [approved], true).allowed,false);
  assert.equal(evaluatePublicationReviewGate([1], [{...approved,reviewerActorId:10}], true).allowed,false);
});

test("release rejects foreign, duplicate and invalid actor review records", () => {
  assert.equal(canReleaseReviewedLines([1],[approved,{...approved,lineId:999}]),false);
  assert.equal(canReleaseReviewedLines([1],[{...approved,authorActorId:0}]),false);
  assert.equal(canReleaseReviewedLines([1],[{...approved,reviewerActorId:-1}]),false);
  assert.equal(canReleaseReviewedLines([1],[{...approved,reviewerActorId:NaN}]),false);
  assert.equal(canReleaseReviewedLines([1,2],[approved,{...approved,lineId:1}]),false);
});

test("release rejects unknown review decision from persisted data", () => {
  assert.equal(canReleaseReviewedLines([1],[{...approved,decision:"unknown" as "approved"}]),false);
});
