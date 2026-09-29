import type { FullyCostedGeneratedCalculationLine } from "./directCostComponents.js";
import type { CalculationStructureNode } from "./calculationStructure.js";
import type { SalesPriceBuildUp } from "./salesPriceBuildUp.js";

export type CalculationVersionSnapshot={
  contract:"brebo-calc-version-snapshot-v1";
  calculationId:string;
  versionNo:number;
  establishedAt:string;
  structure:CalculationStructureNode[];
  lines:FullyCostedGeneratedCalculationLine[];
  pricing:SalesPriceBuildUp;
};

function stable(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;
  if(value&&typeof value==="object"){
    return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createCalculationVersionSnapshot(input:Omit<CalculationVersionSnapshot,"contract">):CalculationVersionSnapshot{
  if(!input.calculationId.trim())throw new Error("Calculation id is required.");
  if(!Number.isInteger(input.versionNo)||input.versionNo<1)throw new Error("Invalid calculation version.");
  if(!input.establishedAt.trim())throw new Error("Established timestamp is required.");
  if(!input.lines.length)throw new Error("Cannot establish an empty calculation.");
  return{contract:"brebo-calc-version-snapshot-v1",...input};
}

export function canonicalCalculationSnapshot(snapshot:CalculationVersionSnapshot):string{
  return stable(snapshot);
}
