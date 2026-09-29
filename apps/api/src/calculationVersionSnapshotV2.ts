import type { CalculationStructureNode, StructuredCalculationLine } from "./calculationStructure.js";
import type { SalesPriceBuildUp } from "./salesPriceBuildUp.js";

export type CalculationVersionSnapshotV2={
  contract:"brebo-calc-version-snapshot-v2";
  calculationId:string;
  versionNo:number;
  establishedAt:string;
  structure:CalculationStructureNode[];
  structuredLines:StructuredCalculationLine[];
  pricing:SalesPriceBuildUp;
};

function stable(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function createCalculationVersionSnapshotV2(input:Omit<CalculationVersionSnapshotV2,"contract">):CalculationVersionSnapshotV2{
  if(!input.calculationId.trim())throw new Error("Calculation id is required.");
  if(!Number.isInteger(input.versionNo)||input.versionNo<1)throw new Error("Invalid calculation version.");
  if(!input.establishedAt.trim())throw new Error("Established timestamp is required.");
  if(!input.structuredLines.length)throw new Error("Cannot establish an empty calculation.");
  return{contract:"brebo-calc-version-snapshot-v2",...input};
}

export function canonicalCalculationSnapshotV2(snapshot:CalculationVersionSnapshotV2):string{return stable(snapshot);}
