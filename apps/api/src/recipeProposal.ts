import type { CalcRecipeVersion } from "./calcRecipeRepository.js";
import type { CalculationConcept, CalculationConceptPosition } from "./calculationConcept.js";

export type RecipeProposalRule = {
  recipeRef: string;
  label: string;
  priority: number;
  requiresReviewedGeometry?: boolean;
  descriptionIncludes?: string[];
  descriptionExcludes?: string[];
  minWidthMm?: number;
  maxWidthMm?: number;
  minHeightMm?: number;
  maxHeightMm?: number;
};

export type RecipeProposal = {
  positionRef: string;
  recipeRef: string;
  label: string;
  priority: number;
  confidence: number;
  reasons: string[];
  reviewRequired: boolean;
};

function normalize(value: string | null): string {
  return (value ?? "").trim().toLocaleLowerCase("nl-NL");
}

function sourceEvidenceText(position:CalculationConceptPosition):string{
  const fragments=position.sourceFacts.flatMap(fact=>[
    fact.factType==="description"?fact.valueText:null,
    fact.sourceFragment
  ]).filter((value):value is string=>Boolean(value?.trim()));
  return normalize([position.description??"",...fragments].join(" "));
}

function matches(position: CalculationConceptPosition, rule: RecipeProposalRule): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const description = sourceEvidenceText(position);

  if (rule.requiresReviewedGeometry && position.reviewStatus !== "reviewed") return { ok: false, reasons: [] };

  if (rule.descriptionIncludes?.length) {
    const hits = rule.descriptionIncludes.filter(term => description.includes(normalize(term)));
    if (!hits.length) return { ok: false, reasons: [] };
    reasons.push(`broninhoud bevat: ${hits.join(", ")}`);
  }

  if (rule.descriptionExcludes?.some(term => description.includes(normalize(term)))) return { ok: false, reasons: [] };

  if (rule.minWidthMm != null && position.widthMm < rule.minWidthMm) return { ok: false, reasons: [] };
  if (rule.maxWidthMm != null && position.widthMm > rule.maxWidthMm) return { ok: false, reasons: [] };
  if (rule.minHeightMm != null && position.heightMm < rule.minHeightMm) return { ok: false, reasons: [] };
  if (rule.maxHeightMm != null && position.heightMm > rule.maxHeightMm) return { ok: false, reasons: [] };

  reasons.push(`geometrie ${position.widthMm}×${position.heightMm} mm`);
  if (position.reviewStatus === "reviewed") reasons.push("bronfeiten zijn gereviewd");
  else reasons.push("bronfeiten zijn nog proposed");

  return { ok: true, reasons };
}

export function proposeRecipesForConcept(
  concept: CalculationConcept,
  rules: RecipeProposalRule[]
): RecipeProposal[] {
  const proposals: RecipeProposal[] = [];

  for (const position of concept.positions) {
    for (const rule of rules) {
      if (!rule.recipeRef.trim() || !rule.label.trim()) throw new Error("Recipe proposal rule identity is incomplete.");
      if (!Number.isFinite(rule.priority)) throw new Error(`Invalid recipe proposal priority for ${rule.recipeRef}.`);

      const match = matches(position, rule);
      if (!match.ok) continue;

      const evidenceScore = position.reviewStatus === "reviewed" ? 0.85 : 0.65;
      const descriptionScore = rule.descriptionIncludes?.length ? 0.10 : 0;
      const multiSourceScore = new Set(position.sourceFacts.map(fact=>fact.documentId)).size>1 ? 0.02 : 0;
      const confidence = Math.min(0.99, evidenceScore + descriptionScore + multiSourceScore);
      if(multiSourceScore)match.reasons.push("onderbouwd door meerdere actuele bronnen");

      proposals.push({
        positionRef: position.positionRef,
        recipeRef: rule.recipeRef,
        label: rule.label,
        priority: rule.priority,
        confidence,
        reasons: match.reasons,
        reviewRequired: true
      });
    }
  }

  return proposals.sort((a, b) =>
    a.positionRef.localeCompare(b.positionRef) ||
    b.priority - a.priority ||
    b.confidence - a.confidence ||
    a.recipeRef.localeCompare(b.recipeRef)
  );
}


export function proposalRulesFromCalcRecipes(recipes: CalcRecipeVersion[]): RecipeProposalRule[] {
  return recipes.flatMap(recipe => {
    const applicability = recipe.applicability;
    if (!applicability) return [];

    const priority = Number(applicability.priority ?? 0);
    if (!Number.isFinite(priority)) {
      throw new Error(`Invalid applicability priority for Calc recipe ${recipe.recipeKey}.`);
    }

    const asStringArray=(value:unknown):string[]|undefined =>
      Array.isArray(value) ? value.map(item=>String(item)).filter(Boolean) : undefined;
    const asOptionalNumber=(value:unknown):number|undefined => {
      if(value==null||value==="") return undefined;
      const numeric=Number(value);
      return Number.isFinite(numeric)?numeric:undefined;
    };

    return [{
      recipeRef: String(recipe.id),
      label: recipe.name,
      priority,
      requiresReviewedGeometry: Boolean(applicability.requiresReviewedGeometry ?? false),
      descriptionIncludes: asStringArray(applicability.descriptionIncludes),
      descriptionExcludes: asStringArray(applicability.descriptionExcludes),
      minWidthMm: asOptionalNumber(applicability.minWidthMm),
      maxWidthMm: asOptionalNumber(applicability.maxWidthMm),
      minHeightMm: asOptionalNumber(applicability.minHeightMm),
      maxHeightMm: asOptionalNumber(applicability.maxHeightMm)
    }];
  });
}
