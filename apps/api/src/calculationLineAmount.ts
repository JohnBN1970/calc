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

export function calculateLineAmount(input:CalculationLineAmountInput):number{
  const quantity=moneyNumber(input.quantity);
  const labourHours=moneyNumber(input.labourTotalHours);
  const labour=moneyNumber(input.labourUnitCost);
  const material=moneyNumber(input.materialUnitCost);
  const equipment=moneyNumber(input.equipmentUnitCost);
  const subcontracting=moneyNumber(input.subcontractingUnitCost);
  const other=moneyNumber(input.otherUnitCost);

  return labourHours*labour+
    quantity*(material+equipment+subcontracting+other);
}
