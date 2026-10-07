export type CostBreakdown={labour:number;material:number;equipment:number;subcontracting:number;other:number};

export function totalCost(costs:CostBreakdown):number{
  return costs.labour+costs.material+costs.equipment+costs.subcontracting+costs.other;
}

export function applyCostAllocations(input:{
  costsByLine:Map<number,CostBreakdown>;
  allocations:Array<{sourceLineId:number;targetLineId:number;amount:number}>;
}):Map<number,CostBreakdown>{
  const result=new Map<number,CostBreakdown>(
    [...input.costsByLine].map(([id,costs])=>[id,{...costs}])
  );
  const base=new Map<number,CostBreakdown>(
    [...input.costsByLine].map(([id,costs])=>[id,{...costs}])
  );
  const outgoingBySource=new Map<number,number>();

  for(const allocation of input.allocations){
    if(!Number.isFinite(allocation.amount)||allocation.amount<0)throw new Error("Kostenverdeling bevat een ongeldig bedrag.");
    if(allocation.sourceLineId===allocation.targetLineId)throw new Error("Kostenverdeling kan niet naar dezelfde regel verwijzen.");
    const sourceBase=base.get(allocation.sourceLineId);
    const sourceCurrent=result.get(allocation.sourceLineId);
    const targetCurrent=result.get(allocation.targetLineId);
    if(!sourceBase||!sourceCurrent||!targetCurrent)throw new Error("Kostenverdeling verwijst naar een niet-meetellende of ontbrekende calculatieregel.");
    const sourceTotal=totalCost(sourceBase);
    const nextOutgoing=(outgoingBySource.get(allocation.sourceLineId)??0)+allocation.amount;
    if(nextOutgoing-sourceTotal>0.01)throw new Error("Kostenverdeling overschrijdt de directe kost van de bronregel.");
    outgoingBySource.set(allocation.sourceLineId,nextOutgoing);
    if(allocation.amount===0)continue;
    if(sourceTotal<=0)throw new Error("Kostenverdeling heeft een bedrag op een bronregel zonder directe kost.");

    const factor=allocation.amount/sourceTotal;
    const moved:CostBreakdown={
      labour:sourceBase.labour*factor,
      material:sourceBase.material*factor,
      equipment:sourceBase.equipment*factor,
      subcontracting:sourceBase.subcontracting*factor,
      other:sourceBase.other*factor
    };
    for(const key of ["labour","material","equipment","subcontracting","other"] as const){
      sourceCurrent[key]-=moved[key];
      targetCurrent[key]+=moved[key];
    }
  }
  return result;
}


export function applyAmountAllocations(input:{
  amountsByLine:Map<number,number>;
  allocations:Array<{sourceLineId:number;targetLineId:number;amount:number}>;
}):Map<number,number>{
  const result=new Map(input.amountsByLine);
  const base=new Map(input.amountsByLine);
  const outgoingBySource=new Map<number,number>();
  for(const allocation of input.allocations){
    if(!Number.isFinite(allocation.amount)||allocation.amount<0)throw new Error("Kostenverdeling bevat een ongeldig bedrag.");
    if(allocation.sourceLineId===allocation.targetLineId)throw new Error("Kostenverdeling kan niet naar dezelfde regel verwijzen.");
    const sourceBase=base.get(allocation.sourceLineId);
    const sourceCurrent=result.get(allocation.sourceLineId);
    const targetCurrent=result.get(allocation.targetLineId);
    if(sourceBase==null||sourceCurrent==null||targetCurrent==null)throw new Error("Kostenverdeling verwijst naar een niet-meetellende of ontbrekende calculatieregel.");
    const nextOutgoing=(outgoingBySource.get(allocation.sourceLineId)??0)+allocation.amount;
    if(nextOutgoing-sourceBase>0.01)throw new Error("Kostenverdeling overschrijdt de directe kost van de bronregel.");
    outgoingBySource.set(allocation.sourceLineId,nextOutgoing);
    result.set(allocation.sourceLineId,sourceCurrent-allocation.amount);
    result.set(allocation.targetLineId,targetCurrent+allocation.amount);
  }
  return result;
}
