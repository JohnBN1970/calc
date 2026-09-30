import type { OfficeCalculationContextSnapshot } from "./officeClient.js";

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

export function buildConceptFromOfficeContext(snapshot: OfficeCalculationContextSnapshot): CalculationConcept {
  const context = snapshot.context;
  const factsByPosition = new Map<string, typeof context.facts>();

  for (const fact of context.facts) {
    const ref = fact.position_ref?.trim();
    if (!ref) continue;
    const rows = factsByPosition.get(ref) ?? [];
    rows.push(fact);
    factsByPosition.set(ref, rows);
  }

  const positions: CalculationConceptPosition[] = [];
  const unresolved = [...context.review.unresolved];

  for (const row of context.takeoff) {
    const positionRef = row.position_ref.trim();
    if (!positionRef) {
      unresolved.push("Uittrekstaat bevat een positie zonder referentie.");
      continue;
    }
    if (!(row.quantity > 0) || !(Number(row.width_mm) > 0) || !(Number(row.height_mm) > 0)) {
      unresolved.push(`Positie ${positionRef} heeft nog geen volledige positieve hoeveelheid/B×H.`);
      continue;
    }

    const facts = factsByPosition.get(positionRef) ?? [];
    const descriptions = facts.filter(f => f.fact_type === "description" && f.value_text?.trim());
    const prices = facts.filter(f => f.fact_type === "supplier_unit_price" && f.value_number !== null);
    const relevantFacts = facts.filter(f => ["quantity", "width_mm", "height_mm", "description", "supplier_unit_price"].includes(f.fact_type));
    const warnings: string[] = [];

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
      warnings
    });
  }

  if (!positions.length) unresolved.push("Geen complete calculatieposities uit de Office-context opgebouwd.");

  return {
    contract: "brebo-calc-concept-v1",
    sourceDocumentSetId: context.document_set?.id ?? null,
    sourceSelectionVersion: context.document_set?.selection_version ?? null,
    positions,
    unresolved: [...new Set(unresolved)],
    readyForRecipeProposal: positions.length > 0
  };
}
