import type { GeneratedCalculationLine } from "./generatedCalculationLines.js";
import type { MaterialCostPipelineResult } from "./materialCostPipeline.js";

export type CostedGeneratedCalculationLine = GeneratedCalculationLine & {
  materialCost: {
    articleRef: string;
    supplierRef: string | null;
    sourceRef: string | null;
    selectedForDate: string | null;
    physicalConsumption: number;
    contentUnit: string;
    purchasedQuantity: number;
    packageCount: number;
    orderUnitCount: number;
    packagingRemainder: number;
    packageDescription: string;
    packagePrice: number;
    totalMaterialCost: number;
    effectiveCostPerRecipeUnit: number;
  };
};

function key(recipeRef:string, recipeLineRef:string):string {
  return `${recipeRef}\u0000${recipeLineRef}`;
}

export function attachMaterialCosts(
  lines: GeneratedCalculationLine[],
  costs: MaterialCostPipelineResult[]
): CostedGeneratedCalculationLine[] {
  const byRecipeLine = new Map<string, MaterialCostPipelineResult>();
  for (const cost of costs) {
    const k=key(cost.recipeRef,cost.recipeLineRef);
    if (byRecipeLine.has(k)) {
      throw new Error(`Multiple material cost results for ${cost.recipeRef}/${cost.recipeLineRef}; explicit disambiguation is required.`);
    }
    byRecipeLine.set(k,cost);
  }

  return lines.map(line => {
    const cost=byRecipeLine.get(key(line.recipeRef,line.recipeLineRef));
    if (!cost) {
      throw new Error(`Missing material cost result for ${line.recipeRef}/${line.recipeLineRef}.`);
    }
    if (Math.abs(cost.grossRecipeQuantity-line.quantity)>1e-9) {
      throw new Error(`Quantity mismatch for ${line.recipeRef}/${line.recipeLineRef}.`);
    }
    return {
      ...line,
      materialCost: {
        articleRef: cost.articleRef,
        supplierRef: cost.supplierRef,
        sourceRef: cost.sourceRef,
        selectedForDate: cost.selectedForDate,
        physicalConsumption: cost.physicalConsumption,
        contentUnit: cost.contentUnit,
        purchasedQuantity: cost.purchasedQuantity,
        packageCount: cost.packageCount,
        orderUnitCount: cost.orderUnitCount,
        packagingRemainder: cost.packagingRemainder,
        packageDescription: cost.packageDescription,
        packagePrice: cost.packagePrice,
        totalMaterialCost: cost.totalMaterialCost,
        effectiveCostPerRecipeUnit: cost.effectiveCostPerRecipeUnit
      }
    };
  });
}
