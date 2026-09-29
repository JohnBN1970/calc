import type { AssemblyTakeoffResult } from "./takeoff.js";
import { calculateRecipeQuantity, type RecipeTakeoffRule } from "./recipeTakeoff.js";

export type RecipeCalculationLineDefinition = {
  recipeRef: string;
  lineRef: string;
  description: string;
  unit: string;
  rule: RecipeTakeoffRule;
};

export type GeneratedCalculationLine = {
  source: "recipe_takeoff";
  recipeRef: string;
  recipeLineRef: string;
  positionRef: string;
  description: string;
  unit: string;
  quantity: number;
  takeoffBasis: RecipeTakeoffRule["basis"];
  factor: number;
  wastePct: number;
};

export function generateCalculationLines(
  positionRef: string,
  takeoff: AssemblyTakeoffResult,
  definitions: RecipeCalculationLineDefinition[]
): GeneratedCalculationLine[] {
  const position = positionRef.trim();
  if (!position) throw new Error("positionRef is required.");

  return definitions.map(def => {
    if (!def.recipeRef.trim() || !def.lineRef.trim() || !def.description.trim() || !def.unit.trim()) {
      throw new Error("Recipe calculation line definition is incomplete.");
    }
    return {
      source: "recipe_takeoff",
      recipeRef: def.recipeRef,
      recipeLineRef: def.lineRef,
      positionRef: position,
      description: def.description,
      unit: def.unit,
      quantity: calculateRecipeQuantity(takeoff, def.rule),
      takeoffBasis: def.rule.basis,
      factor: def.rule.factor ?? 1,
      wastePct: def.rule.wastePct ?? 0
    };
  });
}

export function aggregateGeneratedCalculationLines(lines: GeneratedCalculationLine[]): GeneratedCalculationLine[] {
  const grouped = new Map<string, GeneratedCalculationLine>();
  for (const line of lines) {
    const key = [line.recipeRef,line.recipeLineRef,line.description,line.unit,line.takeoffBasis,line.factor,line.wastePct].join("|");
    const existing = grouped.get(key);
    if (existing) existing.quantity += line.quantity;
    else grouped.set(key,{...line,positionRef:"MULTIPLE"});
  }
  return [...grouped.values()];
}
