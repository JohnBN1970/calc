export type CalculationLineAmountInput={
  quantity?:number|null;
  labourTotalHours?:number|null;
  labourUnitCost?:number|null;
  materialUnitCost?:number|null;
  equipmentUnitCost?:number|null;
  subcontractingUnitCost?:number|null;
  otherUnitCost?:number|null;
};

function moneyNumber(value:number|null|undefined):number{
  const parsed=Number(value??0);
  return Number.isFinite(parsed)?parsed:0;
}

export type CalculationLineCostBreakdown={
  labour:number;
  material:number;
  equipment:number;
  subcontracting:number;
  other:number;
};

export function calculateLineCostBreakdown(input:CalculationLineAmountInput):CalculationLineCostBreakdown{
  const quantity=moneyNumber(input.quantity);
  const labourHours=moneyNumber(input.labourTotalHours);
  return{
    labour:labourHours*moneyNumber(input.labourUnitCost),
    material:quantity*moneyNumber(input.materialUnitCost),
    equipment:quantity*moneyNumber(input.equipmentUnitCost),
    subcontracting:quantity*moneyNumber(input.subcontractingUnitCost),
    other:quantity*moneyNumber(input.otherUnitCost)
  };
}

export function calculateLineAmount(input:CalculationLineAmountInput):number{
  const costs=calculateLineCostBreakdown(input);
  return costs.labour+costs.material+costs.equipment+costs.subcontracting+costs.other;
}
