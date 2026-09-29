import { createHash } from "node:crypto";
import { buildCalculationStructure } from "./calculationStructure.js";
import { canonicalCalculationSnapshotV2, type CalculationVersionSnapshotV2 } from "./calculationVersionSnapshotV2.js";

const close=(a:number,b:number)=>Math.abs(a-b)<=0.0001;

export type EstablishedCalculation={
  snapshot:CalculationVersionSnapshotV2;
  contentHash:string;
};

export function establishCalculation(snapshot:CalculationVersionSnapshotV2):EstablishedCalculation{
  const tree=buildCalculationStructure(snapshot.structure,snapshot.structuredLines);
  const directCost=tree.reduce((sum,node)=>sum+node.totals.totalDirectCost,0);
  if(!close(directCost,snapshot.pricing.directCost))throw new Error("Pricing direct cost does not match structured calculation.");
  const markup=snapshot.pricing.components.reduce((sum,c)=>sum+c.calculatedAmount,0);
  if(!close(markup,snapshot.pricing.totalMarkup))throw new Error("Pricing markup total is inconsistent.");
  if(!close(snapshot.pricing.directCost+snapshot.pricing.totalMarkup,snapshot.pricing.salesPrice))throw new Error("Sales price is inconsistent.");
  const refs=new Set(snapshot.structure.map(x=>x.ref));
  for(const item of snapshot.structuredLines)if(!refs.has(item.structureRef))throw new Error(`Missing structure ref ${item.structureRef}.`);
  const contentHash=createHash("sha256").update(canonicalCalculationSnapshotV2(snapshot),"utf8").digest("hex");
  return{snapshot,contentHash};
}
