import type { OfficeCostingInputLine } from "./officeRecipeLines.js";

export type OfficeRecipeDirectCostLine = OfficeCostingInputLine & {
  effectiveQuantity: number;
  wastePct: number;
  unitCost: number | null;
  totalDirectCost: number | null;
  priceStatus: "priced" | "missing";
};

export function officeRecipeDirectCostLines(
  lines: OfficeCostingInputLine[],
  wasteByIdentity: Map<string, number>
): OfficeRecipeDirectCostLine[] {
  return lines.map(line => {
    const wastePct = Number(wasteByIdentity.get(line.identity) ?? 0);
    if (!Number.isFinite(wastePct) || wastePct < 0) {
      throw new Error(`Invalid Office waste percentage for ${line.identity}.`);
    }
    if (!Number.isFinite(line.quantity) || line.quantity < 0) {
      throw new Error(`Invalid Office quantity for ${line.identity}.`);
    }
    const effectiveQuantity = line.quantity * (1 + wastePct / 100);
    const unitCost = line.officeUnitCost;
    if (unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      throw new Error(`Invalid Office unit cost for ${line.identity}.`);
    }
    return {
      ...line,
      effectiveQuantity,
      wastePct,
      unitCost,
      totalDirectCost: unitCost == null ? null : effectiveQuantity * unitCost,
      priceStatus: unitCost == null ? "missing" as const : "priced" as const
    };
  });
}
