import type { OfficeWorkspaceState } from "./officeClient.js";
import { officeCostingInputLines } from "./officeRecipeLines.js";
import { officeRecipeDirectCostLines } from "./officeRecipeDirectCosts.js";
import { evaluateOfficeAdditionalCosts } from "./additionalCostComponents.js";

export type OfficeCostRollup = {
  officeVersion: string;
  complete: boolean;
  missingPriceCount: number;
  baseCostTotal: number;
  additionalCostTotal: number;
  grandTotal: number;
  byLineType: Record<string, {
    lineCount: number;
    baseCost: number;
    additionalCost: number;
    totalCost: number;
  }>;
};

export function buildOfficeCostRollup(workspace: OfficeWorkspaceState): OfficeCostRollup {
  const inputLines = officeCostingInputLines(workspace);
  const wasteByIdentity = new Map(inputLines.map(line => [line.identity, line.wastePct]));
  const directLines = officeRecipeDirectCostLines(inputLines, wasteByIdentity);
  const additional = evaluateOfficeAdditionalCosts(workspace);

  const lineTypeByRecipeLineId = new Map<number, string>();
  for (const recipe of workspace.recipes ?? []) {
    for (const line of recipe.lines ?? []) {
      lineTypeByRecipeLineId.set(Number(line.id), String(line.line_type || "other"));
    }
  }

  const byLineType: OfficeCostRollup["byLineType"] = {};
  const ensure = (lineType: string) => byLineType[lineType] ??= {
    lineCount: 0,
    baseCost: 0,
    additionalCost: 0,
    totalCost: 0
  };

  for (const line of directLines) {
    const lineType = lineTypeByRecipeLineId.get(Number(line.identity.split(":")[0])) ?? "other";
    // identity is recipeInstanceId:lineKey, so resolve line type by matching recipe instance/line key below.
    const match = (workspace.recipes ?? []).flatMap(recipe => (recipe.lines ?? []).map(item => ({recipe,item})))
      .find(x => Number(x.recipe.id) === line.recipeInstanceId && x.item.line_key === line.recipeLineRef);
    const resolvedType = String(match?.item.line_type || lineType);
    const bucket = ensure(resolvedType);
    bucket.lineCount += 1;
    bucket.baseCost += line.totalDirectCost ?? 0;
  }

  for (const component of additional) {
    const lineType = lineTypeByRecipeLineId.get(component.recipeLineId) ?? "other";
    const bucket = ensure(lineType);
    bucket.additionalCost += component.amount;
  }

  for (const bucket of Object.values(byLineType)) {
    bucket.totalCost = bucket.baseCost + bucket.additionalCost;
  }

  const missingPriceCount = directLines.filter(line => line.priceStatus === "missing").length;
  const baseCostTotal = directLines.reduce((sum, line) => sum + (line.totalDirectCost ?? 0), 0);
  const additionalCostTotal = additional.reduce((sum, component) => sum + component.amount, 0);

  return {
    officeVersion: String(workspace.version.version),
    complete: missingPriceCount === 0,
    missingPriceCount,
    baseCostTotal,
    additionalCostTotal,
    grandTotal: baseCostTotal + additionalCostTotal,
    byLineType
  };
}
