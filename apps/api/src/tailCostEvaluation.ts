import type { TailCostComponent } from "./tailCostRepository.js";
import { evaluateTailCosts, splitTailCostOwnership } from "./tailCostRepository.js";
import type { SubcalculationResult } from "./subcalculationEvaluation.js";

export type TailCostEvaluationRow = ReturnType<typeof evaluateTailCosts>[number];

export function evaluateTailCostHierarchy(input:{
  totalDirectCost:number;
  mainDirectCost:number;
  subcalculations:SubcalculationResult[];
  components:TailCostComponent[];
}){
  const ownership=splitTailCostOwnership(input.components);
  const subcalculationResults=input.subcalculations.map(subcalculation=>{
    const components=ownership.bySubcalculation.get(subcalculation.ref) ?? [];
    const evaluated=evaluateTailCosts({
      ownerDirectCost:subcalculation.directCost,
      consolidatedDirectCost:input.totalDirectCost,
      consolidatedRunningTotal:input.totalDirectCost,
      components
    });
    const tailCost=evaluated.reduce((sum,row)=>sum+row.amount,0);
    return {
      ...subcalculation,
      tailCosts:evaluated,
      tailCost,
      salesPrice:subcalculation.directCost+tailCost
    };
  });

  const subcalculationTailCost=subcalculationResults.reduce((sum,row)=>sum+row.tailCost,0);
  const calculationTailCosts=evaluateTailCosts({
    ownerDirectCost:input.mainDirectCost,
    consolidatedDirectCost:input.totalDirectCost,
    consolidatedRunningTotal:input.totalDirectCost+subcalculationTailCost,
    components:ownership.calculation
  });
  const calculationTailCost=calculationTailCosts.reduce((sum,row)=>sum+row.amount,0);
  const tailCost=subcalculationTailCost+calculationTailCost;

  return {
    totalDirectCost:input.totalDirectCost,
    mainDirectCost:input.mainDirectCost,
    subcalculationTailCost,
    calculationTailCost,
    tailCost,
    salesPrice:input.totalDirectCost+tailCost,
    calculationTailCosts,
    subcalculations:subcalculationResults
  };
}
