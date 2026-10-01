import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "./db.js";

export type TailCostBasis="fixed"|"percentage"|"per_unit";
export type TailCostBaseScope="direct_cost"|"running_total"|"selected_lines"|"subcalculation"|"quantity";

export type TailCostComponent={
  id:number;versionId:number;componentKey:string;description:string;basis:TailCostBasis;value:number;
  baseScope:TailCostBaseScope;baseRef:string|null;quantity:number|null;sortOrder:number;active:boolean;
};

export async function listTailCostComponents(versionId:number):Promise<TailCostComponent[]>{
  const [rows]=await db.execute<RowDataPacket[]>(
    "SELECT * FROM calculation_tail_cost_components WHERE version_id=? AND active=1 ORDER BY sort_order,id",[versionId]
  );
  return rows.map(row=>({
    id:Number(row.id),versionId:Number(row.version_id),componentKey:String(row.component_key),
    description:String(row.description),basis:String(row.basis) as TailCostBasis,value:Number(row.value),
    baseScope:String(row.base_scope) as TailCostBaseScope,baseRef:row.base_ref==null?null:String(row.base_ref),
    quantity:row.quantity==null?null:Number(row.quantity),sortOrder:Number(row.sort_order),active:Boolean(row.active)
  }));
}

export async function createTailCostComponent(input:{
  versionId:number;componentKey:string;description:string;basis:TailCostBasis;value:number;
  baseScope:TailCostBaseScope;baseRef?:string|null;quantity?:number|null;sortOrder?:number;
}):Promise<number>{
  if(!Number.isInteger(input.versionId)||input.versionId<=0)throw new Error("Ongeldige calculatieversie.");
  if(!input.componentKey.trim()||!input.description.trim())throw new Error("Code en omschrijving zijn verplicht.");
  if(!Number.isFinite(input.value)||input.value<0)throw new Error("Waarde moet positief zijn.");
  const [result]=await db.execute<ResultSetHeader>(
    `INSERT INTO calculation_tail_cost_components
      (version_id,component_key,description,basis,value,base_scope,base_ref,quantity,sort_order)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [input.versionId,input.componentKey.trim(),input.description.trim(),input.basis,input.value,input.baseScope,
     input.baseRef?.trim()||null,input.quantity??null,input.sortOrder??0]
  );
  return result.insertId;
}

export function evaluateTailCosts(input:{
  directCost:number;
  components:TailCostComponent[];
  baseAmounts?:Record<string,number>;
}){
  let runningTotal=input.directCost;
  return input.components.map(component=>{
    let baseAmount:number;
    if(component.baseScope==="direct_cost")baseAmount=input.directCost;
    else if(component.baseScope==="running_total")baseAmount=runningTotal;
    else {
      const key=`${component.baseScope}:${component.baseRef??""}`;
      const resolved=input.baseAmounts?.[key];
      if(resolved==null||!Number.isFinite(resolved))throw new Error(`Rekenbasis ontbreekt voor ${component.description}.`);
      baseAmount=resolved;
    }
    let amount:number;
    if(component.basis==="fixed")amount=component.value;
    else if(component.basis==="percentage")amount=baseAmount*(component.value/100);
    else {
      const quantity=component.quantity ?? baseAmount;
      amount=component.value*quantity;
    }
    runningTotal+=amount;
    return {...component,baseAmount,amount,runningTotal};
  });
}
