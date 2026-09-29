import type { GeneratedCalculationLine } from "./generatedCalculationLines.js";
import type { CostedGeneratedCalculationLine } from "./costedCalculationLines.js";

export type LabourNorm = {
  recipeRef: string;
  recipeLineRef: string;
  roleRef: string;
  normHoursPerUnit: number;
  sourceRef: string | null;
};

export type LabourRate = {
  roleRef: string;
  hourlyCostRate: number;
  sourceRef: string | null;
};

export type DirectCostedGeneratedCalculationLine = CostedGeneratedCalculationLine & {
  labourCost: {
    roleRef: string;
    normHoursPerUnit: number;
    labourQuantity: number;
    totalHours: number;
    hourlyCostRate: number;
    totalLabourCost: number;
    normSourceRef: string | null;
    rateSourceRef: string | null;
  };
  directCost: {
    materialCost: number;
    labourCost: number;
    totalDirectCost: number;
  };
};

function recipeLineKey(recipeRef: string, recipeLineRef: string): string {
  return `${recipeRef}\u0000${recipeLineRef}`;
}

export function attachLabourCosts(
  lines: CostedGeneratedCalculationLine[],
  norms: LabourNorm[],
  rates: LabourRate[]
): DirectCostedGeneratedCalculationLine[] {
  const normByRecipeLine = new Map<string, LabourNorm>();
  for (const norm of norms) {
    if (!norm.recipeRef.trim() || !norm.recipeLineRef.trim() || !norm.roleRef.trim()) {
      throw new Error("Labour norm identity is incomplete.");
    }
    if (!Number.isFinite(norm.normHoursPerUnit) || norm.normHoursPerUnit < 0) {
      throw new Error(`Invalid labour norm for ${norm.recipeRef}/${norm.recipeLineRef}.`);
    }
    const key = recipeLineKey(norm.recipeRef, norm.recipeLineRef);
    if (normByRecipeLine.has(key)) {
      throw new Error(`Multiple labour norms for ${norm.recipeRef}/${norm.recipeLineRef}; explicit disambiguation is required.`);
    }
    normByRecipeLine.set(key, norm);
  }

  const rateByRole = new Map<string, LabourRate>();
  for (const rate of rates) {
    if (!rate.roleRef.trim()) throw new Error("Labour rate roleRef is required.");
    if (!Number.isFinite(rate.hourlyCostRate) || rate.hourlyCostRate < 0) {
      throw new Error(`Invalid hourly labour cost rate for ${rate.roleRef}.`);
    }
    if (rateByRole.has(rate.roleRef)) {
      throw new Error(`Multiple labour rates for role ${rate.roleRef}; explicit disambiguation is required.`);
    }
    rateByRole.set(rate.roleRef, rate);
  }

  return lines.map((line) => {
    const norm = normByRecipeLine.get(recipeLineKey(line.recipeRef, line.recipeLineRef));
    if (!norm) throw new Error(`Missing labour norm for ${line.recipeRef}/${line.recipeLineRef}.`);

    const rate = rateByRole.get(norm.roleRef);
    if (!rate) throw new Error(`Missing labour rate for role ${norm.roleRef}.`);

    // Labour follows the net recipe need. Material waste must not silently create labour hours.
    const labourQuantity = line.netQuantity;
    const totalHours = labourQuantity * norm.normHoursPerUnit;
    const totalLabourCost = totalHours * rate.hourlyCostRate;
    const materialCost = line.materialCost.totalMaterialCost;

    return {
      ...line,
      labourCost: {
        roleRef: norm.roleRef,
        normHoursPerUnit: norm.normHoursPerUnit,
        labourQuantity,
        totalHours,
        hourlyCostRate: rate.hourlyCostRate,
        totalLabourCost,
        normSourceRef: norm.sourceRef,
        rateSourceRef: rate.sourceRef
      },
      directCost: {
        materialCost,
        labourCost: totalLabourCost,
        totalDirectCost: materialCost + totalLabourCost
      }
    };
  });
}
