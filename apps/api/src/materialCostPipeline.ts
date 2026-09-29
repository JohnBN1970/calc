import { convertMaterialConsumption, type MaterialConsumptionRule } from "./materialConsumption.js";
import { calculatePackagedMaterialCost, type PackagePrice } from "./materialCosting.js";

export type MaterialCostPipelineInput={
  recipeRef:string;
  recipeLineRef:string;
  description:string;
  grossRecipeQuantity:number;
  recipeUnit:string;
  consumptionRule:MaterialConsumptionRule;
  packagePrice:PackagePrice;
};

export type MaterialCostPipelineResult={
  recipeRef:string;
  recipeLineRef:string;
  description:string;
  grossRecipeQuantity:number;
  recipeUnit:string;
  physicalConsumption:number;
  contentUnit:string;
  articleRef:string;
  supplierRef:string|null;
  sourceRef:string|null;
  selectedForDate:string|null;
  packageDescription:string;
  packagePrice:number;
  purchasedQuantity:number;
  packageCount:number;
  orderUnitCount:number;
  packagingRemainder:number;
  totalMaterialCost:number;
  effectiveCostPerRecipeUnit:number;
};

export function calculateMaterialCostPipeline(input:MaterialCostPipelineInput):MaterialCostPipelineResult{
  if(!input.recipeRef.trim()||!input.recipeLineRef.trim()||!input.description.trim())throw new Error("Material pipeline identity is incomplete.");
  const physicalConsumption=convertMaterialConsumption(input.grossRecipeQuantity,input.consumptionRule);
  const cost=calculatePackagedMaterialCost(physicalConsumption,input.packagePrice);
  return{
    recipeRef:input.recipeRef,
    recipeLineRef:input.recipeLineRef,
    description:input.description,
    grossRecipeQuantity:input.grossRecipeQuantity,
    recipeUnit:input.recipeUnit,
    physicalConsumption,
    contentUnit:cost.contentUnit,
    articleRef:cost.articleRef,
    supplierRef:cost.supplierRef,
    sourceRef:cost.sourceRef,
    selectedForDate:cost.selectedForDate,
    packageDescription:cost.packageDescription,
    packagePrice:cost.packagePrice,
    purchasedQuantity:cost.purchasedQuantity,
    packageCount:cost.packageCount,
    orderUnitCount:cost.orderUnitCount,
    packagingRemainder:cost.packagingRemainder,
    totalMaterialCost:cost.totalMaterialCost,
    effectiveCostPerRecipeUnit:cost.totalMaterialCost/input.grossRecipeQuantity
  };
}
