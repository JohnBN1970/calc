import type { CostedGeneratedCalculationLine } from "./costedCalculationLines.js";

export type CalculationLineHandoff = {
  contract: "brebo-calc-calculation-line-handoff-v1";
  calculationId: number;
  calculationVersionRef: string;
  projectId: number;
  generatedAt: string;
  lines: CostedGeneratedCalculationLine[];
  totals: {
    lineCount: number;
    totalMaterialCost: number;
  };
};

export function createCalculationLineHandoff(input: {
  calculationId: number;
  calculationVersionRef: string;
  projectId: number;
  generatedAt: string;
  lines: CostedGeneratedCalculationLine[];
}): CalculationLineHandoff {
  if (!Number.isInteger(input.calculationId) || input.calculationId <= 0) throw new Error("Invalid calculation id.");
  if (!Number.isInteger(input.projectId) || input.projectId <= 0) throw new Error("Invalid project id.");
  if (!input.calculationVersionRef.trim()) throw new Error("calculationVersionRef is required.");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(input.generatedAt)) throw new Error("generatedAt must be an ISO timestamp.");
  const totalMaterialCost=input.lines.reduce((sum,line)=>sum+line.materialCost.totalMaterialCost,0);
  return {
    contract:"brebo-calc-calculation-line-handoff-v1",
    calculationId:input.calculationId,
    calculationVersionRef:input.calculationVersionRef,
    projectId:input.projectId,
    generatedAt:input.generatedAt,
    lines:input.lines,
    totals:{
      lineCount:input.lines.length,
      totalMaterialCost
    }
  };
}
