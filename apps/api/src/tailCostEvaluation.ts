import type { TailCostComponent } from "./tailCostEngine.js";
import { evaluateTailCosts, splitTailCostOwnership } from "./tailCostEngine.js";
import type { SubcalculationResult } from "./subcalculationEvaluation.js";

export type TailCostEvaluationRow = ReturnType<typeof evaluateTailCosts>[number];

export type TailCostPartitionOverlap={
  lineId:number;
  subcalculations:Array<{id:number;ref:string;description:string}>;
};

export function findTailCostPartitionOverlaps(input:{
  subcalculations:SubcalculationResult[];
  components:TailCostComponent[];
}):TailCostPartitionOverlap[]{
  const tailOwners=new Set(
    input.components
      .filter(component=>component.ownerType==="subcalculation"&&component.ownerRef)
      .map(component=>String(component.ownerRef))
  );
  const byLine=new Map<number,Array<{id:number;ref:string;description:string}>>();
  for(const subcalculation of input.subcalculations){
    if(!tailOwners.has(subcalculation.ref))continue;
    for(const lineId of subcalculation.lineIds){
      const owners=byLine.get(lineId)??[];
      owners.push({id:subcalculation.id,ref:subcalculation.ref,description:subcalculation.description});
      byLine.set(lineId,owners);
    }
  }
  return [...byLine.entries()]
    .filter(([,owners])=>owners.length>1)
    .map(([lineId,subcalculations])=>({lineId,subcalculations}))
    .sort((a,b)=>a.lineId-b.lineId);
}

export function evaluateTailCostHierarchy(input:{
  totalDirectCost:number;
  mainDirectCost:number;
  subcalculations:SubcalculationResult[];
  components:TailCostComponent[];
}){
  const ownership=splitTailCostOwnership(input.components);
  const overlaps=findTailCostPartitionOverlaps({
    subcalculations:input.subcalculations,
    components:input.components
  });
  if(overlaps.length){
    const detail=overlaps.slice(0,10).map(overlap=>{
      const owners=overlap.subcalculations.map(item=>item.description+" ["+item.ref+"]").join(" + ");
      return "regel #"+overlap.lineId+": "+owners;
    }).join("; ");
    const suffix=overlaps.length>10?" (+"+(overlaps.length-10)+" overige overlap(pen))":"";
    throw new Error("Staartkosten kunnen niet veilig worden berekend: calculatieregels vallen in meerdere deelcalculaties met eigen staartkosten. "+detail+suffix+". Kies één financiële doorsnede of verwijder de overlappende staartkosten.");
  }
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
