import type { DirectCostedGeneratedCalculationLine } from "./labourCostPipeline.js";

export type CalculationLineHandoffV2 = {
  contract: "brebo-calc-calculation-line-handoff-v2";
  calculationId: number;
  calculationVersionRef: string;
  projectId: number;
  generatedAt: string;
  lines: DirectCostedGeneratedCalculationLine[];
  totals: {
    lineCount: number;
    totalMaterialCost: number;
    totalLabourHours: number;
    totalLabourCost: number;
    totalDirectCost: number;
  };
};

export function createCalculationLineHandoffV2(input: {
  calculationId: number;
  calculationVersionRef: string;
  projectId: number;
  generatedAt: string;
  lines: DirectCostedGeneratedCalculationLine[];
}): CalculationLineHandoffV2 {
  if (!Number.isInteger(input.calculationId) || input.calculationId <= 0) throw new Error("Invalid calculation id.");
  if (!Number.isInteger(input.projectId) || input.projectId <= 0) throw new Error("Invalid project id.");
  if (!input.calculationVersionRef.trim()) throw new Error("calculationVersionRef is required.");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(input.generatedAt)) throw new Error("generatedAt must be an ISO timestamp.");

  const totals = input.lines.reduce(
    (acc, line) => {
      acc.totalMaterialCost += line.materialCost.totalMaterialCost;
      acc.totalLabourHours += line.labourCost.totalHours;
      acc.totalLabourCost += line.labourCost.totalLabourCost;
      acc.totalDirectCost += line.directCost.totalDirectCost;
      return acc;
    },
    { lineCount: input.lines.length, totalMaterialCost: 0, totalLabourHours: 0, totalLabourCost: 0, totalDirectCost: 0 }
  );

  return {
    contract: "brebo-calc-calculation-line-handoff-v2",
    calculationId: input.calculationId,
    calculationVersionRef: input.calculationVersionRef,
    projectId: input.projectId,
    generatedAt: input.generatedAt,
    lines: input.lines,
    totals
  };
}
