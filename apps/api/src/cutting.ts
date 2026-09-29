export type ProductionMode = "workshop" | "site" | "either";

export type CuttingRequirement = {
  lengthMm: number; quantity: number; groupRef?: string | null; positionRef?: string | null;
  destinationRef?: string | null; productionMode?: ProductionMode;
};
export type CuttingProfile = {
  stockLengthsMm: number[]; kerfMm?: number; endTrimMm?: number; minReusableRemnantMm?: number;
  maxPracticalStockLengthMm?: number | null; practicalWasteTolerancePct?: number;
  preferredStockLengthMm?: number | null; keepGroupsTogether?: boolean;
};
export type CutPiece = { lengthMm:number; groupRef:string };
export type CutBar = { stockLengthMm:number; cutsMm:number[]; pieces:CutPiece[]; usedMm:number; remnantMm:number };
export type ProductionBundle = { groupRef:string; productionMode:ProductionMode; pieceCount:number; piecesMm:number[]; label:string };
export type CuttingPlan = { bars:CutBar[]; bundles:ProductionBundle[]; totalStockMm:number; totalUsedMm:number; totalWasteMm:number; reusableRemnantMm:number };

function positive(v:number,n:string){if(!Number.isFinite(v)||v<=0)throw new Error(`${n} must be positive.`);return v}
function nonNegative(v:number,n:string){if(!Number.isFinite(v)||v<0)throw new Error(`${n} must be zero or positive.`);return v}
function groupFor(r:CuttingRequirement){return r.groupRef?.trim()||r.destinationRef?.trim()||r.positionRef?.trim()||"UNGROUPED"}
function expandRequirements(rs:CuttingRequirement[]):CutPiece[]{const p:CutPiece[]=[];for(const r of rs){const l=positive(r.lengthMm,"lengthMm"),q=positive(r.quantity,"quantity");if(!Number.isInteger(q))throw new Error("quantity must be a positive integer.");for(let i=0;i<q;i++)p.push({lengthMm:l,groupRef:groupFor(r)})}return p.sort((a,b)=>a.groupRef.localeCompare(b.groupRef)||b.lengthMm-a.lengthMm)}

export function createCuttingPlan(requirements:CuttingRequirement[],profile:CuttingProfile):CuttingPlan{
 const kerf=nonNegative(profile.kerfMm??3,"kerfMm"),endTrim=nonNegative(profile.endTrimMm??0,"endTrimMm"),minReusable=nonNegative(profile.minReusableRemnantMm??300,"minReusableRemnantMm"),tolerance=nonNegative(profile.practicalWasteTolerancePct??3,"practicalWasteTolerancePct");
 const maxPractical=profile.maxPracticalStockLengthMm==null?null:positive(profile.maxPracticalStockLengthMm,"maxPracticalStockLengthMm"),preferred=profile.preferredStockLengthMm==null?null:positive(profile.preferredStockLengthMm,"preferredStockLengthMm"),keepGroupsTogether=profile.keepGroupsTogether??true;
 const allowed=profile.stockLengthsMm.map(v=>positive(v,"stockLength")).filter(v=>maxPractical==null||v<=maxPractical).sort((a,b)=>a-b);if(!allowed.length)throw new Error("No practical stock lengths available.");if(preferred!=null&&!allowed.includes(preferred))throw new Error("preferredStockLengthMm must be an allowed practical stock length.");
 const bars:CutBar[]=[],epsilon=1e-6;
 for(const piece of expandRequirements(requirements)){let best=-1,bestScore=Infinity;
  for(let i=0;i<bars.length;i++){const bar=bars[i],extra=piece.lengthMm+(bar.cutsMm.length?kerf:0),rem=bar.stockLengthMm-bar.usedMm-extra;if(rem < -epsilon)continue;const mixed=bar.pieces.some(p=>p.groupRef!==piece.groupRef);const score=Math.max(0,rem)+(keepGroupsTogether&&mixed?bar.stockLengthMm:0);if(score<bestScore){best=i;bestScore=score}}
  if(best>=0){const bar=bars[best];bar.usedMm+=piece.lengthMm+(bar.cutsMm.length?kerf:0);bar.cutsMm.push(piece.lengthMm);bar.pieces.push(piece);bar.remnantMm=Math.max(0,bar.stockLengthMm-bar.usedMm);continue}
  const required=piece.lengthMm+2*endTrim,theoretical=allowed.find(v=>v>=required);if(theoretical==null)throw new Error(`Piece ${piece.lengthMm} mm does not fit available stock lengths.`);let chosen=theoretical;if(preferred!=null&&preferred>=required&&((preferred-theoretical)/theoretical)*100<=tolerance)chosen=preferred;const used=piece.lengthMm+2*endTrim;bars.push({stockLengthMm:chosen,cutsMm:[piece.lengthMm],pieces:[piece],usedMm:used,remnantMm:chosen-used});
 }
 const totalStockMm=bars.reduce((s,b)=>s+b.stockLengthMm,0),totalUsedMm=bars.reduce((s,b)=>s+b.usedMm,0),totalWasteMm=bars.reduce((s,b)=>s+(b.remnantMm<minReusable?b.remnantMm:0),0),reusableRemnantMm=bars.reduce((s,b)=>s+(b.remnantMm>=minReusable?b.remnantMm:0),0);
 const bundleMap=new Map<string,ProductionBundle>();for(const r of requirements){const groupRef=groupFor(r),mode=r.productionMode??"either",key=`${mode}:${groupRef}`,current=bundleMap.get(key)??{groupRef,productionMode:mode,pieceCount:0,piecesMm:[],label:`${groupRef} | ${mode==="workshop"?"WERKPLAATS":mode==="site"?"BOUWPLAATS":"TE BEPALEN"}`};for(let i=0;i<r.quantity;i++)current.piecesMm.push(r.lengthMm);current.pieceCount+=r.quantity;bundleMap.set(key,current)}
 return{bars,bundles:[...bundleMap.values()].sort((a,b)=>a.groupRef.localeCompare(b.groupRef)),totalStockMm,totalUsedMm,totalWasteMm,reusableRemnantMm};
}
