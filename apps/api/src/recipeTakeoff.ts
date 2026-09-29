import type { AssemblyTakeoffResult, TakeoffBasis } from "./takeoff.js";

export type RecipeTakeoffBasis =
  | TakeoffBasis
  | "part_area"
  | "internal_joint";

export type RecipeTakeoffRule = {
  basis: RecipeTakeoffBasis;
  factor?: number;
  wastePct?: number;
  roundingStep?: number | null;
  minimumQuantity?: number | null;
};

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be zero or positive.`);
  }
  return value;
}

function basisValue(result: AssemblyTakeoffResult, basis: RecipeTakeoffBasis): number {
  switch (basis) {
    case "area": return result.areaM2;
    case "perimeter": return result.perimeterM;
    case "two_sides_plus_head": return result.twoSidesPlusHeadM;
    case "width": return result.widthTotalM;
    case "height": return result.heightTotalM;
    case "part_area": return result.partAreaM2;
    case "internal_joint": return result.internalJointM;
  }
}

export function calculateRecipeQuantity(
  takeoff: AssemblyTakeoffResult,
  rule: RecipeTakeoffRule
): number {
  const factor = nonNegative(rule.factor ?? 1, "factor");
  const wastePct = nonNegative(rule.wastePct ?? 0, "wastePct");
  let quantity = basisValue(takeoff, rule.basis) * factor * (1 + wastePct / 100);

  if (rule.roundingStep != null) {
    const step = nonNegative(rule.roundingStep, "roundingStep");
    if (step === 0) throw new Error("roundingStep must be greater than zero.");
    quantity = Math.ceil(quantity / step) * step;
  }

  if (rule.minimumQuantity != null) {
    quantity = Math.max(quantity, nonNegative(rule.minimumQuantity, "minimumQuantity"));
  }

  return quantity;
}
