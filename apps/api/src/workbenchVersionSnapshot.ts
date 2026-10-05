import { createHash } from "node:crypto";
import type { CommercialSummary } from "./commercialSummary.js";
import { lineContributesToCalculationTotals } from "./calculationLineTotals.js";

export type WorkbenchSnapshotLine={
  structureKey:string;
  parentStructureKey:string|null;
  lineType:string;
  sortOrder?:number;
  code:string|null;
  description:string;
  unit:string|null;
  quantity:number|null;
  labourNorm:number|null;
  labourTotalHours:number|null;
  labourHoursInputMode:string|null;
  labourUnitCost:number;
  materialUnitCost:number;
  equipmentUnitCost:number;
  subcontractingUnitCost:number;
  otherUnitCost:number;
  vatRegimeId:number|null;
  priceSourceType:string;
  officeSourceId:string|null;
  sourceReference:string|null;
  sourceSupplier:string|null;
  sourceUnitPrice:number|null;
  sourcePriceDate:string|null;
  sourceDocumentId:string|null;
  sourceDetails:string|null;
  sourceVisualPage?:number|null;
  sourcePositionBounds?:string|null;
  sourceVisualCrop?:string|null;
  sourceVisualSearchRegion?:string|null;
  sourceTextRegions?:string|null;
  sourceOfferSummary?:string|null;
};

export type WorkbenchEstablishedSnapshot={
  contract:"brebo-calc-workbench-snapshot-v3";
  calculationId:number;
  versionId:number;
  versionNo:number;
  establishedAt:string;
  lines:WorkbenchSnapshotLine[];
  allocations:Array<Record<string,unknown>>;
  subcalculations:Array<Record<string,unknown>>;
  subcalculationScopes:Array<Record<string,unknown>>;
  subcalculationMemberships:Array<Record<string,unknown>>;
  tailCosts:Array<Record<string,unknown>>;
  lineScopes:Array<Record<string,unknown>>;
  commercial:{
    directCost:number;
    markupAmount:number;
    salesPrice:number;
    summary:CommercialSummary;
  };
};

export function snapshotDate(value:unknown):string|null{
  if(value==null||value==="")return null;
  if(value instanceof Date){
    if(Number.isNaN(value.getTime()))throw new Error("Invalid snapshot date.");
    return value.toISOString().slice(0,10);
  }
  const text=String(value).trim();
  const match=text.match(/^\d{4}-\d{2}-\d{2}/);
  if(!match)throw new Error("Invalid snapshot date.");
  return match[0];
}

export function snapshotJson(value:unknown):string|null{
  if(value==null||value==="")return null;
  if(typeof value==="string"){
    const text=value.trim();
    if(!text)return null;
    JSON.parse(text);
    return text;
  }
  return JSON.stringify(value);
}

function stable(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;
  if(value&&typeof value==="object"){
    return `{${Object.entries(value as Record<string,unknown>)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const close=(a:number,b:number)=>Math.abs(a-b)<=0.01;

export function createWorkbenchEstablishedSnapshot(
  input:Omit<WorkbenchEstablishedSnapshot,"contract">
):WorkbenchEstablishedSnapshot{
  if(!Number.isInteger(input.calculationId)||input.calculationId<=0)throw new Error("Calculation id is required.");
  if(!Number.isInteger(input.versionId)||input.versionId<=0)throw new Error("Calculation version id is required.");
  if(!Number.isInteger(input.versionNo)||input.versionNo<=0)throw new Error("Calculation version number is required.");
  if(!input.establishedAt.trim())throw new Error("Established timestamp is required.");
  if(!input.lines.some(line=>lineContributesToCalculationTotals(line.lineType))){
    throw new Error("Cannot establish an empty calculation.");
  }

  const keys=new Set<string>();
  for(const line of input.lines){
    if(!line.structureKey.trim())throw new Error("Every workbench line requires a stable structure key.");
    if(keys.has(line.structureKey))throw new Error(`Duplicate workbench structure key ${line.structureKey}.`);
    keys.add(line.structureKey);
  }
  for(const line of input.lines){
    if(line.parentStructureKey&&!keys.has(line.parentStructureKey)){
      throw new Error(`Missing parent structure key ${line.parentStructureKey}.`);
    }
  }

  const {directCost,markupAmount,salesPrice,summary}=input.commercial;
  if(![directCost,markupAmount,salesPrice].every(Number.isFinite)||directCost<0||markupAmount<0||salesPrice<0){
    throw new Error("Commercial totals are invalid.");
  }
  if(!close(directCost+markupAmount,salesPrice))throw new Error("Direct cost plus tail costs does not equal sales price.");
  if(!close(summary.purchase,directCost)||!close(summary.sales,salesPrice))throw new Error("Commercial summary does not match Calc totals.");
  const vatBase=summary.vatBreakdown.reduce((sum,item)=>sum+item.taxableBase,0);
  if(!close(vatBase,salesPrice))throw new Error("VAT breakdown does not cover the complete sales price.");

  return{contract:"brebo-calc-workbench-snapshot-v3",...input};
}

export function canonicalWorkbenchSnapshot(snapshot:WorkbenchEstablishedSnapshot):string{
  return stable(snapshot);
}

export function fingerprintWorkbenchSnapshot(snapshot:WorkbenchEstablishedSnapshot):string{
  return createHash("sha256").update(canonicalWorkbenchSnapshot(snapshot),"utf8").digest("hex");
}
