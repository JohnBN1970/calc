import type { OfficeCalculationContextSnapshot } from "./officeClient.js";
import { detectSourceFactConflicts } from "./sourceFactConflict.js";
import { assessDocumentRevisions } from "./sourceRevision.js";
import { sourceDecisionReason, type SourceDecision } from "./sourceDecision.js";

export function evaluateSourceDecisions(snapshot:OfficeCalculationContextSnapshot):SourceDecision[]{
  const revisionMap=new Map(
    assessDocumentRevisions(snapshot).map(item=>[item.documentId,item.supersededByDocumentId] as const)
  );
  return detectSourceFactConflicts(snapshot).map(conflict=>sourceDecisionReason({
    positionRef:conflict.positionRef,
    factType:conflict.factType,
    measurementKind:conflict.measurementKind==="not_applicable"?null:conflict.measurementKind,
    values:conflict.values.map(value=>({documentId:value.documentId,value:value.value})),
    supersededBy:revisionMap
  }));
}

export function blockingSourceDecisions(decisions:SourceDecision[]):SourceDecision[]{
  return decisions.filter(decision=>decision.status==="conflict");
}
