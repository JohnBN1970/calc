import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "./db.js";

export type { TailCostBasis, TailCostBaseScope, TailCostOwnerType, TailCostComponent } from "./tailCostEngine.js";
import type { TailCostBasis, TailCostBaseScope, TailCostOwnerType, TailCostComponent } from "./tailCostEngine.js";

export async function listTailCostComponents(versionId:number):Promise<TailCostComponent[]>{
  const [rows]=await db.execute<RowDataPacket[]>(
    "SELECT * FROM calculation_tail_cost_components WHERE version_id=? AND active=1 ORDER BY sort_order,id",[versionId]
  );
  return rows.map(row=>({
    id:Number(row.id),versionId:Number(row.version_id),ownerType:String(row.owner_type??"calculation") as TailCostOwnerType,
    ownerRef:row.owner_ref==null?null:String(row.owner_ref),componentKey:String(row.component_key),
    description:String(row.description),basis:String(row.basis) as TailCostBasis,value:Number(row.value),
    baseScope:String(row.base_scope) as TailCostBaseScope,baseRef:row.base_ref==null?null:String(row.base_ref),
    quantity:row.quantity==null?null:Number(row.quantity),sortOrder:Number(row.sort_order),active:Boolean(row.active)
  }));
}

export async function createTailCostComponent(input:{
  versionId:number;ownerType?:TailCostOwnerType;ownerRef?:string|null;componentKey:string;description:string;basis:TailCostBasis;value:number;
  baseScope:TailCostBaseScope;baseRef?:string|null;quantity?:number|null;sortOrder?:number;
}):Promise<number>{
  if(!Number.isInteger(input.versionId)||input.versionId<=0)throw new Error("Ongeldige calculatieversie.");
  if(!input.componentKey.trim()||!input.description.trim())throw new Error("Code en omschrijving zijn verplicht.");
  if(!Number.isFinite(input.value)||input.value<0)throw new Error("Waarde moet positief zijn.");
  const [result]=await db.execute<ResultSetHeader>(
    `INSERT INTO calculation_tail_cost_components
      (version_id,owner_type,owner_ref,component_key,description,basis,value,base_scope,base_ref,quantity,sort_order)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [input.versionId,input.ownerType??"calculation",(input.ownerType??"calculation")==="subcalculation"?(input.ownerRef?.trim()||null):null,
     input.componentKey.trim(),input.description.trim(),input.basis,input.value,input.baseScope,
     input.baseRef?.trim()||null,input.quantity??null,input.sortOrder??0]
  );
  return result.insertId;
}

