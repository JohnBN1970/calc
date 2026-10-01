import type { OfficeWorkspaceState } from "./officeClient.js";

export type OfficeAuthoritativeRecipeLine = {
  source: "office_recipe_instance";
  recipeInstanceId: number;
  recipeVersionId: number | null;
  recipeLineId: number;
  paragraphKey: string;
  recipeName: string;
  lineKey: string;
  lineType: string;
  description: string;
  unit: string | null;
  calculatedQuantity: number;
  manualQuantity: number | null;
  activeQuantity: number;
  wastePct: number;
  materialRef: string | null;
  priceSourceRef: string | null;
  unitCost: number | null;
  isCustom: boolean;
  snapshotHash: string;
};

function finiteNumber(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid Office recipe result field ${field}.`);
  return parsed;
}

export function officeAuthoritativeRecipeLines(workspace: OfficeWorkspaceState): OfficeAuthoritativeRecipeLine[] {
  return (workspace.recipes ?? []).flatMap(recipe => (recipe.lines ?? []).map(line => {
    const calculatedQuantity = finiteNumber(line.calculated_quantity ?? 0, "calculated_quantity");
    const manualQuantity = line.manual_quantity == null ? null : finiteNumber(line.manual_quantity, "manual_quantity");
    return {
      source: "office_recipe_instance" as const,
      recipeInstanceId: Number(recipe.id),
      recipeVersionId: recipe.recipe_version_id == null ? null : Number(recipe.recipe_version_id),
      recipeLineId: Number(line.id),
      paragraphKey: recipe.paragraph_key,
      recipeName: recipe.name,
      lineKey: line.line_key,
      lineType: line.line_type,
      description: line.description,
      unit: line.unit,
      calculatedQuantity,
      manualQuantity,
      activeQuantity: manualQuantity ?? calculatedQuantity,
      wastePct: finiteNumber(line.waste_pct ?? 0, "waste_pct"),
      materialRef: line.material_ref,
      priceSourceRef: line.price_source_ref,
      unitCost: line.unit_cost == null ? null : finiteNumber(line.unit_cost, "unit_cost"),
      isCustom: Number(line.is_custom) === 1,
      snapshotHash: recipe.snapshot_hash
    };
  }));
}


export type OfficeCostingInputLine = {
  source: "office_recipe_instance";
  identity: string;
  structureRef: string;
  recipeInstanceId: number;
  recipeVersionId: number | null;
  recipeLineRef: string;
  description: string;
  unit: string | null;
  quantity: number;
  materialRef: string | null;
  priceSourceRef: string | null;
  officeUnitCost: number | null;
  snapshotHash: string;
};

export function officeCostingInputLines(workspace: OfficeWorkspaceState): OfficeCostingInputLine[] {
  return officeAuthoritativeRecipeLines(workspace).map(line => ({
    source: "office_recipe_instance",
    identity: `${line.recipeInstanceId}:${line.lineKey}`,
    structureRef: line.paragraphKey,
    recipeInstanceId: line.recipeInstanceId,
    recipeVersionId: line.recipeVersionId,
    recipeLineRef: line.lineKey,
    description: line.description,
    unit: line.unit,
    quantity: line.activeQuantity,
    materialRef: line.materialRef,
    priceSourceRef: line.priceSourceRef,
    officeUnitCost: line.unitCost,
    snapshotHash: line.snapshotHash
  }));
}
