export type TailCostBasis="fixed"|"percentage"|"per_unit";
export type TailCostBaseScope=
  |"direct_cost"|"running_total"|"selected_lines"|"subcalculation"|"quantity"
  |"owner_direct_cost"|"owner_running_total"
  |"consolidated_direct_cost"|"consolidated_running_total";
export type TailCostOwnerType="calculation"|"subcalculation";

export type TailCostComponent={
  id:number;versionId:number;ownerType:TailCostOwnerType;ownerRef:string|null;
  componentKey:string;description:string;basis:TailCostBasis;value:number;
  baseScope:TailCostBaseScope;baseRef:string|null;quantity:number|null;vatRegimeId:number|null;sortOrder:number;active:boolean;
};

export function evaluateTailCosts(input:{
  ownerDirectCost:number;
  consolidatedDirectCost:number;
  consolidatedRunningTotal?:number;
  components:TailCostComponent[];
  baseAmounts?:Record<string,number>;
}){
  let ownerRunningTotal=input.ownerDirectCost;
  let consolidatedRunningTotal=input.consolidatedRunningTotal ?? input.consolidatedDirectCost;
  return input.components.map(component=>{
    let baseAmount:number;
    if(component.baseScope==="owner_direct_cost" || component.baseScope==="direct_cost") baseAmount=input.ownerDirectCost;
    else if(component.baseScope==="owner_running_total" || component.baseScope==="running_total") baseAmount=ownerRunningTotal;
    else if(component.baseScope==="consolidated_direct_cost") baseAmount=input.consolidatedDirectCost;
    else if(component.baseScope==="consolidated_running_total") baseAmount=consolidatedRunningTotal;
    else if(component.baseScope==="quantity" && component.quantity!=null) baseAmount=component.quantity;
    else {
      const key=`${component.baseScope}:${component.baseRef??""}`;
      const resolved=input.baseAmounts?.[key];
      if(resolved==null||!Number.isFinite(resolved))throw new Error(`Rekenbasis ontbreekt voor ${component.description}.`);
      baseAmount=resolved;
    }
    let amount:number;
    if(component.basis==="fixed") amount=component.value;
    else if(component.basis==="percentage") amount=baseAmount*(component.value/100);
    else amount=component.value*(component.quantity ?? baseAmount);
    ownerRunningTotal+=amount;
    consolidatedRunningTotal+=amount;
    return {...component,baseAmount,amount,ownerRunningTotal,consolidatedRunningTotal};
  });
}

export function splitTailCostOwnership(components:TailCostComponent[]) {
  const calculation=components.filter(component=>component.ownerType==="calculation");
  const bySubcalculation=new Map<string,TailCostComponent[]>();
  for(const component of components){
    if(component.ownerType!=="subcalculation"||!component.ownerRef)continue;
    const list=bySubcalculation.get(component.ownerRef)??[];
    list.push(component);bySubcalculation.set(component.ownerRef,list);
  }
  return {calculation,bySubcalculation};
}
