import type { CalculationStructureResult } from "./calculationStructure.js";
import { buildSalesPrice, type SalesPriceComponent, type SalesPriceBuildUp } from "./salesPriceBuildUp.js";

export type CalculationPricingSummary={
  directCost:number;
  pricing:SalesPriceBuildUp;
};

function totalDirectCost(structure:CalculationStructureResult[]):number{
  return structure.reduce((sum,node)=>sum+node.totals.totalDirectCost,0);
}

export function createCalculationPricingSummary(structure:CalculationStructureResult[],components:SalesPriceComponent[]):CalculationPricingSummary{
  const directCost=totalDirectCost(structure);
  return{directCost,pricing:buildSalesPrice(directCost,components)};
}
