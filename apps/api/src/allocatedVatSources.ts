import { calculateLineAmount } from "./calculationLineAmount.js";
import { lineContributesToCalculationTotals } from "./calculationLineTotals.js";
import { applyAmountAllocations } from "./costAllocation.js";
import type { VatSource } from "./lineVatAggregation.js";

export type AllocatedVatLine={
  id:number;
  lineType:string;
  quantity:number|null;
  labourTotalHours:number|null;
  labourUnitCost:number;
  materialUnitCost:number;
  equipmentUnitCost:number;
  subcontractingUnitCost:number;
  otherUnitCost:number;
  vatRegimeId:number|null;
};

export function effectiveAllocatedVatSources(input:{
  lines:AllocatedVatLine[];
  allocations:Array<{sourceLineId:number;targetLineId:number;amount:number}>;
}):VatSource[]{
  const costLines=input.lines.filter(line=>lineContributesToCalculationTotals(line.lineType));
  const byId=new Map(costLines.map(line=>[
    line.id,
    calculateLineAmount({
      quantity:line.quantity,
      labourTotalHours:line.labourTotalHours,
      labourUnitCost:line.labourUnitCost,
      materialUnitCost:line.materialUnitCost,
      equipmentUnitCost:line.equipmentUnitCost,
      subcontractingUnitCost:line.subcontractingUnitCost,
      otherUnitCost:line.otherUnitCost
    })
  ]));
  const effective=applyAmountAllocations({amountsByLine:byId,allocations:input.allocations});
  return costLines.map(line=>({
    vatRegimeId:line.vatRegimeId,
    salesAmount:effective.get(line.id)??0
  }));
}
