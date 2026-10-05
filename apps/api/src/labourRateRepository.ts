import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "./db.js";

export type LabourRateRecord={
  id:number;
  roleRef:string;
  label:string;
  hourlyCostRate:number;
  sourceRef:string|null;
  active:boolean;
  isDefault:boolean;
  validFrom:string|null;
  validTo:string|null;
};

function dateValue(value:unknown):string|null{
  if(value==null||value==="")return null;
  if(value instanceof Date)return value.toISOString().slice(0,10);
  return String(value).slice(0,10);
}

function mapRow(row:RowDataPacket):LabourRateRecord{
  return{
    id:Number(row.id),
    roleRef:String(row.role_ref),
    label:String(row.label??row.role_ref),
    hourlyCostRate:Number(row.hourly_cost_rate),
    sourceRef:row.source_ref==null?null:String(row.source_ref),
    active:Boolean(row.active),
    isDefault:Boolean(row.is_default),
    validFrom:dateValue(row.valid_from),
    validTo:dateValue(row.valid_to)
  };
}

function normalized(input:{roleRef:string;label:string;hourlyCostRate:number;sourceRef:string|null;active:boolean;isDefault:boolean;validFrom:string|null;validTo:string|null}){
  const roleRef=input.roleRef.trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"_").replace(/^_+|_+$/g,"");
  const label=input.label.trim();
  const hourlyCostRate=Number(input.hourlyCostRate);
  if(!roleRef||!label)throw new Error("Uurtarief mist rol of naam.");
  if(!Number.isFinite(hourlyCostRate)||hourlyCostRate<0)throw new Error("Uurtarief moet een geldig positief bedrag zijn.");
  if(input.validFrom&&input.validTo&&input.validFrom>input.validTo)throw new Error("Geldig vanaf kan niet na geldig tot liggen.");
  return{...input,roleRef,label,hourlyCostRate,sourceRef:input.sourceRef?.trim()||null};
}

export async function listLabourRates(includeInactive=true):Promise<LabourRateRecord[]>{
  const [rows]=await db.execute<RowDataPacket[]>(
    `SELECT id,role_ref,label,hourly_cost_rate,source_ref,active,is_default,valid_from,valid_to
       FROM labour_cost_rates
      ${includeInactive?"":"WHERE active=1"}
      ORDER BY role_ref,is_default DESC,active DESC,COALESCE(valid_from,'1000-01-01') DESC,id DESC`
  );
  return rows.map(mapRow);
}

export async function createLabourRate(input:{
  roleRef:string;label:string;hourlyCostRate:number;sourceRef:string|null;active:boolean;isDefault:boolean;validFrom:string|null;validTo:string|null;
}):Promise<LabourRateRecord>{
  const value=normalized(input);
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    if(value.isDefault){
      await connection.execute("UPDATE labour_cost_rates SET is_default=0 WHERE role_ref=?",[value.roleRef]);
    }
    const [result]=await connection.execute<ResultSetHeader>(
      `INSERT INTO labour_cost_rates(role_ref,label,hourly_cost_rate,source_ref,active,is_default,valid_from,valid_to)
       VALUES(?,?,?,?,?,?,?,?)`,
      [value.roleRef,value.label,value.hourlyCostRate,value.sourceRef,value.active?1:0,value.isDefault?1:0,value.validFrom,value.validTo]
    );
    const [rows]=await connection.execute<RowDataPacket[]>(
      "SELECT id,role_ref,label,hourly_cost_rate,source_ref,active,is_default,valid_from,valid_to FROM labour_cost_rates WHERE id=?",
      [result.insertId]
    );
    await connection.commit();
    return mapRow(rows[0]);
  }catch(error){
    await connection.rollback();
    throw error;
  }finally{
    connection.release();
  }
}

export async function updateLabourRate(id:number,input:Partial<{
  roleRef:string;label:string;hourlyCostRate:number;sourceRef:string|null;active:boolean;isDefault:boolean;validFrom:string|null;validTo:string|null;
}>):Promise<LabourRateRecord>{
  const [rows]=await db.execute<RowDataPacket[]>(
    "SELECT id,role_ref,label,hourly_cost_rate,source_ref,active,is_default,valid_from,valid_to FROM labour_cost_rates WHERE id=?",
    [id]
  );
  if(!rows[0])throw new Error("Uurtarief niet gevonden.");
  const current=mapRow(rows[0]);
  const value=normalized({
    roleRef:input.roleRef??current.roleRef,
    label:input.label??current.label,
    hourlyCostRate:input.hourlyCostRate??current.hourlyCostRate,
    sourceRef:input.sourceRef===undefined?current.sourceRef:input.sourceRef,
    active:input.active??current.active,
    isDefault:input.isDefault??current.isDefault,
    validFrom:input.validFrom===undefined?current.validFrom:input.validFrom,
    validTo:input.validTo===undefined?current.validTo:input.validTo
  });
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    if(value.isDefault){
      await connection.execute("UPDATE labour_cost_rates SET is_default=0 WHERE role_ref=? AND id<>?",[value.roleRef,id]);
    }
    await connection.execute(
      `UPDATE labour_cost_rates
          SET role_ref=?,label=?,hourly_cost_rate=?,source_ref=?,active=?,is_default=?,valid_from=?,valid_to=?
        WHERE id=?`,
      [value.roleRef,value.label,value.hourlyCostRate,value.sourceRef,value.active?1:0,value.isDefault?1:0,value.validFrom,value.validTo,id]
    );
    const [updated]=await connection.execute<RowDataPacket[]>(
      "SELECT id,role_ref,label,hourly_cost_rate,source_ref,active,is_default,valid_from,valid_to FROM labour_cost_rates WHERE id=?",
      [id]
    );
    await connection.commit();
    return mapRow(updated[0]);
  }catch(error){
    await connection.rollback();
    throw error;
  }finally{
    connection.release();
  }
}
