import type { FullyCostedGeneratedCalculationLine } from "./directCostComponents.js";

export type CalculationLineHandoffV3={
  contract:"brebo-calc-calculation-line-handoff-v3";
  calculationId:number;calculationVersionRef:string;projectId:number;generatedAt:string;
  lines:FullyCostedGeneratedCalculationLine[];
  totals:{lineCount:number;totalMaterialCost:number;totalLabourHours:number;totalLabourCost:number;totalEquipmentCost:number;totalSubcontractCost:number;totalOtherDirectCost:number;totalDirectCost:number};
};

export function createCalculationLineHandoffV3(input:{calculationId:number;calculationVersionRef:string;projectId:number;generatedAt:string;lines:FullyCostedGeneratedCalculationLine[]}):CalculationLineHandoffV3{
  if(!Number.isInteger(input.calculationId)||input.calculationId<=0)throw new Error("Invalid calculation id.");
  if(!Number.isInteger(input.projectId)||input.projectId<=0)throw new Error("Invalid project id.");
  if(!input.calculationVersionRef.trim())throw new Error("calculationVersionRef is required.");
  if(!/^\d{4}-\d{2}-\d{2}T/.test(input.generatedAt))throw new Error("generatedAt must be an ISO timestamp.");
  const totals=input.lines.reduce((a,l)=>{a.totalMaterialCost+=l.materialCost.totalMaterialCost;a.totalLabourHours+=l.labourCost.totalHours;a.totalLabourCost+=l.labourCost.totalLabourCost;a.totalEquipmentCost+=l.directCost.equipmentCost;a.totalSubcontractCost+=l.directCost.subcontractCost;a.totalOtherDirectCost+=l.directCost.otherDirectCost;a.totalDirectCost+=l.directCost.totalDirectCost;return a;},{lineCount:input.lines.length,totalMaterialCost:0,totalLabourHours:0,totalLabourCost:0,totalEquipmentCost:0,totalSubcontractCost:0,totalOtherDirectCost:0,totalDirectCost:0});
  return{contract:"brebo-calc-calculation-line-handoff-v3",calculationId:input.calculationId,calculationVersionRef:input.calculationVersionRef,projectId:input.projectId,generatedAt:input.generatedAt,lines:input.lines,totals};
}
