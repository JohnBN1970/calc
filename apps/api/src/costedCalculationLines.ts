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

function key(recipeRef:string, recipeLineRef:string, positionRef:string):string {
  return `${recipeRef}\u0000${recipeLineRef}\u0000${positionRef}`;
}

export function attachMaterialCosts(
  lines: GeneratedCalculationLine[],
  costs: MaterialCostPipelineResult[]
): CostedGeneratedCalculationLine[] {
  const byRecipeLineAndPosition = new Map<string, MaterialCostPipelineResult>();
  for (const cost of costs) {
    if (!cost.positionRef.trim()) {
      throw new Error(`Missing positionRef for material cost ${cost.recipeRef}/${cost.recipeLineRef}.`);
    }
    const k=key(cost.recipeRef,cost.recipeLineRef,cost.positionRef);
    if (byRecipeLineAndPosition.has(k)) {
      throw new Error(`Multiple material cost results for ${cost.recipeRef}/${cost.recipeLineRef} at position ${cost.positionRef}; explicit disambiguation is required.`);
    }
    byRecipeLineAndPosition.set(k,cost);
  }

  return lines.map(line => {
    if (!line.positionRef.trim()) {
      throw new Error(`Missing positionRef for generated calculation line ${line.recipeRef}/${line.recipeLineRef}.`);
    }
    const cost=byRecipeLineAndPosition.get(key(line.recipeRef,line.recipeLineRef,line.positionRef));
    if (!cost) {
      throw new Error(`Missing material cost result for ${line.recipeRef}/${line.recipeLineRef} at position ${line.positionRef}.`);
    }
    if (Math.abs(cost.grossRecipeQuantity-line.quantity)>1e-9) {
      throw new Error(`Quantity mismatch for ${line.recipeRef}/${line.recipeLineRef} at position ${line.positionRef}.`);
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
