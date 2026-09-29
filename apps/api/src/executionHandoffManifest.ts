import type { ProductionOutputs } from "./productionOutputs.js";
import type { CuttingPlan } from "./cutting.js";
import type { ExecutionHandoff } from "./executionHandoff.js";

export type ExecutionHandoffManifest = {
  contract: "brebo-calc-execution-handoff-manifest-v1";
  handoff: ExecutionHandoff;
  summary: {
    purchaseLineCount: number;
    workshopBundleCount: number;
    siteLineCount: number;
    totalStockMm: number;
    totalUsedMm: number;
    totalWasteMm: number;
    reusableRemnantMm: number;
  };
  outputs: ProductionOutputs;
};

export function createExecutionHandoffManifest(
  handoff: ExecutionHandoff,
  plan: CuttingPlan,
  outputs: ProductionOutputs
): ExecutionHandoffManifest {
  if (handoff.contract !== "brebo-calc-execution-handoff-v1") {
    throw new Error("Unsupported execution handoff contract.");
  }
  return {
    contract: "brebo-calc-execution-handoff-manifest-v1",
    handoff,
    summary: {
      purchaseLineCount: outputs.purchaseList.length,
      workshopBundleCount: outputs.workshopList.length,
      siteLineCount: outputs.siteList.length,
      totalStockMm: plan.totalStockMm,
      totalUsedMm: plan.totalUsedMm,
      totalWasteMm: plan.totalWasteMm,
      reusableRemnantMm: plan.reusableRemnantMm
    },
    outputs
  };
}
