import type { OfficeWorkspaceState } from "./officeClient.js";

export type AdditionalCostBasis = "fixed" | "per_unit" | "percentage";

export type EvaluatedAdditionalCostComponent = {
  recipeInstanceId: number;
  recipeLineId: number;
  componentKey: string;
  description: string;
  basis: AdditionalCostBasis;
  value: number;
  quantity: number | null;
  sourceRef: string | null;
  amount: number;
};

function number(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid additional cost ${field}.`);
  return parsed;
}

export function evaluateOfficeAdditionalCosts(workspace: OfficeWorkspaceState): EvaluatedAdditionalCostComponent[] {
  return (workspace.recipes ?? []).flatMap(recipe => (recipe.lines ?? []).flatMap(line => {
    const activeQuantity = line.manual_quantity == null ? number(line.calculated_quantity, "calculated_quantity") : number(line.manual_quantity, "manual_quantity");
    const wastePct = number(line.waste_pct ?? 0, "waste_pct");
    const effectiveQuantity = activeQuantity * (1 + wastePct / 100);
    const unitCost = line.unit_cost == null ? null : number(line.unit_cost, "unit_cost");
    const baseAmount = unitCost == null ? null : effectiveQuantity * unitCost;

    return (line.cost_components ?? []).map(component => {
      const basis = String(component.basis) as AdditionalCostBasis;
      if (!["fixed", "per_unit", "percentage"].includes(basis)) {
        throw new Error(`Unsupported additional cost basis ${component.basis} for ${component.component_key}.`);
      }
      const value = number(component.value, "value");
      const quantity = component.quantity == null ? null : number(component.quantity, "quantity");
      let amount: number;
      if (basis === "fixed") amount = value;
      else if (basis === "per_unit") amount = value * (quantity ?? effectiveQuantity);
      else {
        if (baseAmount == null) throw new Error(`Percentage component ${component.component_key} requires a priced base line.`);
        amount = baseAmount * value / 100;
      }
      return {
        recipeInstanceId: Number(recipe.id),
        recipeLineId: Number(line.id),
        componentKey: component.component_key,
        description: component.description,
        basis,
        value,
        quantity,
        sourceRef: component.source_ref,
        amount
      };
    });
  }));
}
