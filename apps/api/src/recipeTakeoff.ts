import type { AssemblyTakeoffResult, TakeoffBasis } from "./takeoff.js";

export type RecipeTakeoffBasis = TakeoffBasis | "part_area" | "internal_joint";
export type RecipeTakeoffRule = { basis:RecipeTakeoffBasis; factor?:number; wastePct?:number; roundingStep?:number|null; minimumQuantity?:number|null };
export type RecipeQuantityResult = { baseQuantity:number; netQuantity:number; wasteQuantity:number; grossQuantity:number };

function nonNegative(v:number,n:string){if(!Number.isFinite(v)||v<0)throw new Error(`${n} must be zero or positive.`);return v}
function basisValue(r:AssemblyTakeoffResult,b:RecipeTakeoffBasis){switch(b){case"area":return r.areaM2;case"perimeter":return r.perimeterM;case"two_sides_plus_head":return r.twoSidesPlusHeadM;case"width":return r.widthTotalM;case"height":return r.heightTotalM;case"part_area":return r.partAreaM2;case"internal_joint":return r.internalJointM}}

export function calculateRecipeQuantityDetails(takeoff:AssemblyTakeoffResult,rule:RecipeTakeoffRule):RecipeQuantityResult{
 const factor=nonNegative(rule.factor??1,"factor"),wastePct=nonNegative(rule.wastePct??0,"wastePct");
 const baseQuantity=basisValue(takeoff,rule.basis),netQuantity=baseQuantity*factor,wasteQuantity=netQuantity*(wastePct/100);
 let grossQuantity=netQuantity+wasteQuantity;
 if(rule.roundingStep!=null){const step=nonNegative(rule.roundingStep,"roundingStep");if(step===0)throw new Error("roundingStep must be greater than zero.");grossQuantity=Math.ceil(grossQuantity/step)*step}
 if(rule.minimumQuantity!=null)grossQuantity=Math.max(grossQuantity,nonNegative(rule.minimumQuantity,"minimumQuantity"));
 return{baseQuantity,netQuantity,wasteQuantity,grossQuantity};
}
export function calculateRecipeQuantity(takeoff:AssemblyTakeoffResult,rule:RecipeTakeoffRule):number{return calculateRecipeQuantityDetails(takeoff,rule).grossQuantity}
