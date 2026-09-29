export type ProductionMode = "workshop" | "site" | "either";

export type CuttingRequirement = {
  lengthMm: number;
  quantity: number;
  groupRef?: string | null;
  positionRef?: string | null;
  destinationRef?: string | null;
  productionMode?: ProductionMode;
};

export type CuttingProfile = {
  stockLengthsMm: number[];
  kerfMm?: number;
  endTrimMm?: number;
  minReusableRemnantMm?: number;
  maxPracticalStockLengthMm?: number | null;
  practicalWasteTolerancePct?: number;
};

export type CutBar = {
  stockLengthMm: number;
  cutsMm: number[];
  usedMm: number;
  remnantMm: number;
};

export type ProductionBundle = {
  groupRef: string;
  productionMode: ProductionMode;
  pieceCount: number;
  piecesMm: number[];
  label: string;
};

export type CuttingPlan = {
  bars: CutBar[];
  bundles: ProductionBundle[];
  totalStockMm: number;
  totalUsedMm: number;
  totalWasteMm: number;
  reusableRemnantMm: number;
};

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive.`);
  return value;
}

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be zero or positive.`);
  return value;
}

function expandRequirements(requirements: CuttingRequirement[]): Array<{ lengthMm:number; groupRef?:string|null }> {
  const pieces: Array<{ lengthMm:number; groupRef?:string|null }> = [];
  for (const req of requirements) {
    const lengthMm = positive(req.lengthMm, "lengthMm");
    const quantity = Math.floor(positive(req.quantity, "quantity"));
    for (let i = 0; i < quantity; i++) pieces.push({ lengthMm, groupRef:req.groupRef });
  }
  return pieces.sort((a,b) => b.lengthMm - a.lengthMm);
}

export function createCuttingPlan(requirements: CuttingRequirement[], profile: CuttingProfile): CuttingPlan {
  const kerf = nonNegative(profile.kerfMm ?? 3, "kerfMm");
  const endTrim = nonNegative(profile.endTrimMm ?? 0, "endTrimMm");
  const minReusable = nonNegative(profile.minReusableRemnantMm ?? 300, "minReusableRemnantMm");
  const practicalTolerance = nonNegative(profile.practicalWasteTolerancePct ?? 3, "practicalWasteTolerancePct");
  const maxPractical = profile.maxPracticalStockLengthMm == null ? null : positive(profile.maxPracticalStockLengthMm, "maxPracticalStockLengthMm");

  const allowedStock = profile.stockLengthsMm
    .map(v => positive(v, "stockLength"))
    .filter(v => maxPractical == null || v <= maxPractical)
    .sort((a,b) => a-b);
  if (!allowedStock.length) throw new Error("No practical stock lengths available.");

  const pieces = expandRequirements(requirements);
  const bars: CutBar[] = [];

  for (const piece of pieces) {
    let bestBarIndex = -1;
    let bestRemainder = Number.POSITIVE_INFINITY;

    for (let i=0;i<bars.length;i++) {
      const bar = bars[i];
      const extra = piece.lengthMm + (bar.cutsMm.length > 0 ? kerf : 0);
      const remainder = bar.stockLengthMm - bar.usedMm - extra;
      if (remainder >= 0 && remainder < bestRemainder) {
        bestBarIndex = i;
        bestRemainder = remainder;
      }
    }

    if (bestBarIndex >= 0) {
      const bar = bars[bestBarIndex];
      bar.usedMm += piece.lengthMm + (bar.cutsMm.length > 0 ? kerf : 0);
      bar.cutsMm.push(piece.lengthMm);
      bar.remnantMm = bar.stockLengthMm - bar.usedMm;
      continue;
    }

    const required = piece.lengthMm + 2 * endTrim;
    const theoretical = allowedStock.find(v => v >= required);
    if (theoretical == null) throw new Error(`Piece ${piece.lengthMm} mm does not fit available stock lengths.`);

    let chosen = theoretical;
    const alternatives = allowedStock.filter(v => v >= required);
    for (const candidate of alternatives) {
      const extraWastePct = ((candidate - theoretical) / theoretical) * 100;
      if (extraWastePct <= practicalTolerance) chosen = candidate;
      else break;
    }

    const used = piece.lengthMm + 2 * endTrim;
    bars.push({ stockLengthMm: chosen, cutsMm:[piece.lengthMm], usedMm:used, remnantMm:chosen-used });
  }

  const totalStockMm = bars.reduce((sum,b)=>sum+b.stockLengthMm,0);
  const totalUsedMm = bars.reduce((sum,b)=>sum+b.usedMm,0);
  const totalWasteMm = bars.reduce((sum,b)=>sum + (b.remnantMm < minReusable ? b.remnantMm : 0),0);
  const reusableRemnantMm = bars.reduce((sum,b)=>sum + (b.remnantMm >= minReusable ? b.remnantMm : 0),0);

  const bundleMap = new Map<string, ProductionBundle>();
  for (const req of requirements) {
    const groupRef = req.groupRef?.trim() || req.destinationRef?.trim() || req.positionRef?.trim() || "UNGROUPED";
    const mode = req.productionMode ?? "either";
    const key = `${mode}:${groupRef}`;
    const current = bundleMap.get(key) ?? {
      groupRef,
      productionMode: mode,
      pieceCount: 0,
      piecesMm: [],
      label: `${groupRef} | ${mode === "workshop" ? "WERKPLAATS" : mode === "site" ? "BOUWPLAATS" : "TE BEPALEN"}`
    };
    for (let i = 0; i < req.quantity; i++) current.piecesMm.push(req.lengthMm);
    current.pieceCount += req.quantity;
    bundleMap.set(key, current);
  }

  const bundles = [...bundleMap.values()].sort((a,b) => a.groupRef.localeCompare(b.groupRef));

  return { bars, bundles, totalStockMm, totalUsedMm, totalWasteMm, reusableRemnantMm };
}
