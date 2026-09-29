import type { DirectCostedGeneratedCalculationLine } from "./labourCostPipeline.js";

export type DirectCostKind = "equipment" | "subcontract" | "other";

export type DirectCostComponent = {
  recipeRef: string;
  recipeLineRef: string;
  kind: DirectCostKind;
  description: string;
  amount: number;
  sourceRef: string | null;
};

export type FullyCostedGeneratedCalculationLine = DirectCostedGeneratedCalculationLine & {
  directCostComponents: DirectCostComponent[];
  directCost: DirectCostedGeneratedCalculationLine["directCost"] & {
    equipmentCost: number;
    subcontractCost: number;
    otherDirectCost: number;
    totalDirectCost: number;
  };
};

function key(recipeRef:string, recipeLineRef:string):string {
  return `${recipeRef}\u0000${recipeLineRef}`;
}

export function attachDirectCostComponents(
  lines: DirectCostedGeneratedCalculationLine[],
  components: DirectCostComponent[]
): FullyCostedGeneratedCalculationLine[] {
  const byLine=new Map<string,DirectCostComponent[]>();
  for(const component of components){
    if(!component.recipeRef.trim()||!component.recipeLineRef.trim()||!component.description.trim()) throw new Error("Direct cost component identity is incomplete.");
    if(!["equipment","subcontract","other"].includes(component.kind)) throw new Error("Invalid direct cost component kind.");
    if(!Number.isFinite(component.amount)||component.amount<0) throw new Error(`Invalid direct cost amount for ${component.recipeRef}/${component.recipeLineRef}.`);
    const k=key(component.recipeRef,component.recipeLineRef);
    byLine.set(k,[...(byLine.get(k)??[]),component]);
  }
  return lines.map(line=>{
    const directCostComponents=byLine.get(key(line.recipeRef,line.recipeLineRef))??[];
    const equipmentCost=directCostComponents.filter(x=>x.kind==="equipment").reduce((s,x)=>s+x.amount,0);
    const subcontractCost=directCostComponents.filter(x=>x.kind==="subcontract").reduce((s,x)=>s+x.amount,0);
    const otherDirectCost=directCostComponents.filter(x=>x.kind==="other").reduce((s,x)=>s+x.amount,0);
    return {...line,directCostComponents,directCost:{...line.directCost,equipmentCost,subcontractCost,otherDirectCost,totalDirectCost:line.directCost.materialCost+line.directCost.labourCost+equipmentCost+subcontractCost+otherDirectCost}};
  });
}
