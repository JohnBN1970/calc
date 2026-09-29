import type { CuttingPlan, CuttingRequirement, ProductionBundle, ProductionMode } from "./cutting.js";

export type PurchaseListLine = {
  stockLengthMm: number;
  quantity: number;
};

export type WorkshopListLine = {
  groupRef: string;
  label: string;
  pieceCount: number;
  piecesMm: number[];
};

export type SiteListLine = {
  groupRef: string;
  positionRef?: string | null;
  destinationRef?: string | null;
  pieceLengthMm: number;
  quantity: number;
};

export type ProductionOutputs = {
  purchaseList: PurchaseListLine[];
  workshopList: WorkshopListLine[];
  labels: string[];
  siteList: SiteListLine[];
};

function modeFor(req: CuttingRequirement): ProductionMode {
  return req.productionMode ?? "either";
}

export function createProductionOutputs(
  plan: CuttingPlan,
  requirements: CuttingRequirement[]
): ProductionOutputs {
  const purchaseCounts = new Map<number, number>();
  for (const bar of plan.bars) {
    purchaseCounts.set(bar.stockLengthMm, (purchaseCounts.get(bar.stockLengthMm) ?? 0) + 1);
  }
  const purchaseList = [...purchaseCounts.entries()]
    .map(([stockLengthMm, quantity]) => ({ stockLengthMm, quantity }))
    .sort((a,b) => a.stockLengthMm - b.stockLengthMm);

  const workshopBundles: ProductionBundle[] = plan.bundles.filter(b => b.productionMode === "workshop");
  const workshopList = workshopBundles.map(b => ({
    groupRef: b.groupRef,
    label: b.label,
    pieceCount: b.pieceCount,
    piecesMm: [...b.piecesMm].sort((a,b) => b-a)
  }));
  const labels = workshopList.map(x => x.label);

  const siteList = requirements
    .filter(req => modeFor(req) === "site")
    .map(req => ({
      groupRef: req.groupRef?.trim() || req.destinationRef?.trim() || req.positionRef?.trim() || "UNGROUPED",
      positionRef: req.positionRef,
      destinationRef: req.destinationRef,
      pieceLengthMm: req.lengthMm,
      quantity: req.quantity
    }))
    .sort((a,b) => a.groupRef.localeCompare(b.groupRef) || b.pieceLengthMm-a.pieceLengthMm);

  return { purchaseList, workshopList, labels, siteList };
}
