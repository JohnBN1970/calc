import type { OfficeCalculationContextSnapshot } from "./officeClient.js";
import { triageCalculationDocuments, type CalcDocumentTriageItem } from "./documentTriage.js";
import { measurementKindForFact, measurementKindLabel, type MeasurementKind } from "./measurementSemantics.js";

export type CalculationConceptPosition = {
  positionRef: string;
  quantity: number;
  widthMm: number;
  heightMm: number;
  description: string | null;
  supplierUnitPrice: number | null;
  sourceDocumentIds: number[];
  sourcePages: number[];
  reviewStatus: "reviewed" | "proposed";
  scopes: Array<{
    type:"building"|"facade"|"dwelling"|"dwelling_type"|"building_part";
    ref:string;
  }>;
  warnings: string[];
};

export type CalculationConcept = {
  contract: "brebo-calc-concept-v1";
  sourceDocumentSetId: number | null;
  sourceSelectionVersion: string | null;
  positions: CalculationConceptPosition[];
  unresolved: string[];
  readyForRecipeProposal: boolean;
};

function factStatus(statuses: string[]): "reviewed" | "proposed" {
  return statuses.length > 0 && statuses.every(status => ["reviewed", "accepted", "confirmed"].includes(status))
    ? "reviewed"
    : "proposed";
}

export function buildConceptFromOfficeContext(
  snapshot: OfficeCalculationContextSnapshot,
  documentTriage: CalcDocumentTriageItem[] = triageCalculationDocuments(snapshot)
): CalculationConcept {
  const context = snapshot.context;
  const acceptedDocumentIds=new Set(documentTriage.filter(item=>item.status==="primary"||item.status==="supporting").map(item=>item.documentId));
  const primaryDocumentIds=new Set(documentTriage.filter(item=>item.status==="primary").map(item=>item.documentId));
  const factsByPosition = new Map<string, typeof context.facts>();

  for (const fact of context.facts) {
    if(!acceptedDocumentIds.has(Number(fact.document_id))) continue;
    const ref = fact.position_ref?.trim();
    if (!ref) continue;
    const rows = factsByPosition.get(ref) ?? [];
    rows.push(fact);
    factsByPosition.set(ref, rows);
  }

  const positions: CalculationConceptPosition[] = [];
  const unresolved = [...context.review.unresolved];
  const scopesByPosition=new Map<string,CalculationConceptPosition["scopes"]>();
  for(const row of context.position_scopes??[]){
    const ref=String(row.position_ref??"").trim();
    if(!ref)continue;
    const scopes:CalculationConceptPosition["scopes"]=[];
    const push=(type:CalculationConceptPosition["scopes"][number]["type"],value:unknown)=>{
      const normalized=String(value??"").trim();
      if(normalized)scopes.push({type,ref:normalized});
    };
    push("building",row.building);
    push("facade",row.facade);
    push("dwelling",row.dwelling);
    push("dwelling_type",row.dwelling_type);
    push("building_part",row.building_part);
    scopesByPosition.set(ref,scopes);
  }

  const takeoffsByPosition = new Map<string, typeof context.takeoff>();
  for (const row of context.takeoff) {
    const positionRef = row.position_ref.trim();
    if (!positionRef) {
      unresolved.push("Uittrekstaat bevat een positie zonder referentie.");
      continue;
    }
    const rows = takeoffsByPosition.get(positionRef) ?? [];
    rows.push(row);
    takeoffsByPosition.set(positionRef, rows);
  }

  for (const [positionRef, takeoffs] of takeoffsByPosition) {
    const completeTakeoffs = takeoffs.filter(row =>
      row.quantity > 0 && Number(row.width_mm) > 0 && Number(row.height_mm) > 0
    );
    if (!completeTakeoffs.length) {
      unresolved.push(`Positie ${positionRef} heeft nog geen volledige positieve hoeveelheid/B×H.`);
      continue;
    }

    const row = completeTakeoffs[0];
    const facts = factsByPosition.get(positionRef) ?? [];
    const primaryFacts=facts.filter(f=>primaryDocumentIds.has(Number(f.document_id)));
    const hasQuantity=primaryFacts.some(f=>f.fact_type==="quantity");
    const geometryKinds=[...new Set(primaryFacts.filter(f=>f.fact_type==="width_mm"||f.fact_type==="height_mm").map(f=>measurementKindForFact(f)))];
    const completeKinds=geometryKinds.filter(kind=>
      primaryFacts.some(f=>f.fact_type==="width_mm"&&measurementKindForFact(f)===kind)&&
      primaryFacts.some(f=>f.fact_type==="height_mm"&&measurementKindForFact(f)===kind)
    );
    if(!hasQuantity||completeKinds.length===0){
      unresolved.push(`Positie ${positionRef} mist complete hoeveelheid + B×H van dezelfde maatsoort uit een door Calc primair geselecteerd document.`);
      continue;
    }
    if(completeKinds.length>1){
      unresolved.push(`Positie ${positionRef} bevat meerdere complete maatsoorten (${completeKinds.map(kind=>measurementKindLabel(kind as MeasurementKind)).join(", ")}); expliciete keuze vereist.`);
      continue;
    }
    const measurementKind=completeKinds[0] as MeasurementKind;
    const descriptions = facts.filter(f => f.fact_type === "description" && f.value_text?.trim());
    const prices = facts.filter(f => f.fact_type === "supplier_unit_price" && f.value_number !== null);
    const relevantFacts = facts.filter(f => ["quantity", "width_mm", "height_mm", "description", "supplier_unit_price"].includes(f.fact_type));
    const warnings: string[] = [];

    warnings.push("Geometrie geïnterpreteerd als "+measurementKindLabel(measurementKind)+".");
    if (completeTakeoffs.length > 1) {
      warnings.push(`${completeTakeoffs.length} geometrische take-offs gevonden; expliciete keuze vereist vóór receptplaatsing.`);
    }
    const distinctDescriptions = [...new Set(descriptions.map(f => f.value_text!.trim()))];
    if (distinctDescriptions.length > 1) warnings.push("Meerdere bronbeschrijvingen gevonden.");
    const distinctPrices = [...new Set(prices.map(f => Number(f.value_number)))];
    if (distinctPrices.length > 1) warnings.push("Meerdere leveranciersprijzen gevonden.");

    const sourceDocumentIds = [...new Set(relevantFacts.map(f => f.document_id))].sort((a, b) => a - b);
    const sourcePages = [...new Set(relevantFacts.flatMap(f => f.source_page === null ? [] : [f.source_page]))].sort((a, b) => a - b);
    const reviewStatus = factStatus(relevantFacts.map(f => f.review_status));

    if (reviewStatus === "proposed") warnings.push("Bronfeiten wachten nog op menselijke review.");

    positions.push({
      positionRef,
      quantity: row.quantity,
      widthMm: Number(row.width_mm),
      heightMm: Number(row.height_mm),
      description: distinctDescriptions[0] ?? null,
      supplierUnitPrice: distinctPrices[0] ?? null,
      sourceDocumentIds,
      sourcePages,
      reviewStatus,
      scopes:scopesByPosition.get(positionRef)??[],
      warnings
    });
  }

  const ignoredRelevantFacts=context.facts.filter(fact=>
    !acceptedDocumentIds.has(Number(fact.document_id)) &&
    ["quantity","width_mm","height_mm","description","supplier_unit_price"].includes(fact.fact_type)
  ).length;
  if(ignoredRelevantFacts>0) unresolved.push(`${ignoredRelevantFacts} calculatiefeit(en) uit review-documenten zijn bewust niet meegerekend.`);
  if (!positions.length) unresolved.push("Geen complete calculatieposities uit door Calc geaccepteerde bronnen opgebouwd.");

  return {
    contract: "brebo-calc-concept-v1",
    sourceDocumentSetId: context.document_set?.id ?? null,
    sourceSelectionVersion: context.document_set?.selection_version ?? null,
    positions,
    unresolved: [...new Set(unresolved)],
    readyForRecipeProposal: positions.length > 0
  };
}
