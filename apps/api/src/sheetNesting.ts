export type SheetPiece={ref:string;widthMm:number;heightMm:number;quantity:number;allowRotation?:boolean;groupRef?:string|null};
export type SheetProfile={sheetWidthMm:number;sheetHeightMm:number;kerfMm?:number;edgeTrimMm?:number;allowRotation?:boolean};
export type SheetPlacement={pieceRef:string;groupRef:string|null;xMm:number;yMm:number;widthMm:number;heightMm:number;rotated:boolean};
export type SheetLayout={sheetNo:number;placements:SheetPlacement[];usedAreaM2:number;remainingAreaM2:number};
export type SheetNestingPlan={sheetCount:number;layouts:SheetLayout[];purchasedAreaM2:number;usedAreaM2:number;geometricWasteAreaM2:number};

function positive(v:number,n:string){if(!Number.isFinite(v)||v<=0)throw new Error(`${n} must be positive.`);return v}
type FreeRect={x:number;y:number;w:number;h:number};
type Expanded={ref:string;w:number;h:number;rotate:boolean;groupRef:string|null};

export function createSheetNestingPlan(pieces:SheetPiece[],profile:SheetProfile):SheetNestingPlan{
 const sw=positive(profile.sheetWidthMm,"sheetWidthMm"),sh=positive(profile.sheetHeightMm,"sheetHeightMm"),kerf=profile.kerfMm??3,trim=profile.edgeTrimMm??0;
 if(kerf<0||trim<0)throw new Error("kerfMm and edgeTrimMm must be zero or positive.");
 const usableW=sw-2*trim,usableH=sh-2*trim;if(usableW<=0||usableH<=0)throw new Error("Edge trim leaves no usable sheet.");
 const expanded:Expanded[]=[];
 for(const p of pieces){positive(p.widthMm,"piece.widthMm");positive(p.heightMm,"piece.heightMm");positive(p.quantity,"piece.quantity");if(!Number.isInteger(p.quantity))throw new Error("piece.quantity must be an integer.");for(let i=0;i<p.quantity;i++)expanded.push({ref:p.ref,w:p.widthMm,h:p.heightMm,rotate:(p.allowRotation??profile.allowRotation??true),groupRef:p.groupRef??null})}
 expanded.sort((a,b)=>Math.max(b.w,b.h)-Math.max(a.w,a.h)||b.w*b.h-a.w*a.h);
 const sheets:{free:FreeRect[];placements:SheetPlacement[]}[]=[];
 for(const p of expanded){
  let choice:{si:number;ri:number;w:number;h:number;rotated:boolean;score:number}|null=null;
  const orientations=[{w:p.w,h:p.h,rotated:false},...(p.rotate&&p.w!==p.h?[{w:p.h,h:p.w,rotated:true}]:[])];
  for(let si=0;si<sheets.length;si++)for(let ri=0;ri<sheets[si].free.length;ri++){const r=sheets[si].free[ri];for(const o of orientations){if(o.w<=r.w&&o.h<=r.h){const score=r.w*r.h-o.w*o.h;if(!choice||score<choice.score)choice={si,ri,...o,score}}}}
  if(!choice){sheets.push({free:[{x:trim,y:trim,w:usableW,h:usableH}],placements:[]});const si=sheets.length-1,r=sheets[si].free[0];const o=orientations.find(o=>o.w<=r.w&&o.h<=r.h);if(!o)throw new Error(`Piece ${p.ref} does not fit the sheet.`);choice={si,ri:0,...o,score:r.w*r.h-o.w*o.h}}
  const sheet=sheets[choice.si],r=sheet.free.splice(choice.ri,1)[0];
  sheet.placements.push({pieceRef:p.ref,groupRef:p.groupRef,xMm:r.x,yMm:r.y,widthMm:choice.w,heightMm:choice.h,rotated:choice.rotated});
  const rightW=r.w-choice.w-kerf,bottomH=r.h-choice.h-kerf;
  if(rightW>0)sheet.free.push({x:r.x+choice.w+kerf,y:r.y,w:rightW,h:choice.h});
  if(bottomH>0)sheet.free.push({x:r.x,y:r.y+choice.h+kerf,w:r.w,h:bottomH});
 }
 const sheetArea=sw*sh/1e6,layouts=sheets.map((s,i)=>{const used=s.placements.reduce((n,p)=>n+p.widthMm*p.heightMm/1e6,0);return{sheetNo:i+1,placements:s.placements,usedAreaM2:used,remainingAreaM2:sheetArea-used}});
 const usedAreaM2=layouts.reduce((n,l)=>n+l.usedAreaM2,0),purchasedAreaM2=layouts.length*sheetArea;
 return{sheetCount:layouts.length,layouts,purchasedAreaM2,usedAreaM2,geometricWasteAreaM2:purchasedAreaM2-usedAreaM2};
}
