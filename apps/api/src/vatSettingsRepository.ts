import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "./db.js";

export type VatTreatment="normal"|"reverse_charge"|"exempt";

export type VatRegime={
  id:number;
  code:string;
  label:string;
  treatment:VatTreatment;
  rate:number|null;
  active:boolean;
  sortOrder:number;
};

function mapRow(row:RowDataPacket):VatRegime{
  return{
    id:Number(row.id),
    code:String(row.code),
    label:String(row.label),
    treatment:String(row.treatment) as VatTreatment,
    rate:row.rate==null?null:Number(row.rate),
    active:Boolean(row.active),
    sortOrder:Number(row.sort_order??0)
  };
}

export async function listVatRegimes(includeInactive=false):Promise<VatRegime[]>{
  const [rows]=await db.execute<RowDataPacket[]>(
    `SELECT id,code,label,treatment,rate,active,sort_order
       FROM calc_vat_regimes
      ${includeInactive?"":"WHERE active=1"}
      ORDER BY sort_order,label,id`
  );
  return rows.map(mapRow);
}

export async function createVatRegime(input:{
  code:string;label:string;treatment:VatTreatment;rate:number|null;active:boolean;sortOrder:number;
}):Promise<VatRegime>{
  const code=input.code.trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"_").replace(/^_+|_+$/g,"");
  const label=input.label.trim();
  const rate=input.rate==null?null:Number(input.rate);
  if(!code||!label) throw new Error("Btw-regime mist code of omschrijving.");
  if(!["normal","reverse_charge","exempt"].includes(input.treatment)) throw new Error("Ongeldige btw-behandeling.");
  if(input.treatment==="normal"&&(rate==null||!Number.isFinite(rate)||rate<0||rate>100)) throw new Error("Normaal btw-regime vereist een geldig tarief.");
  const storedRate=input.treatment==="normal"?rate:null;
  const [result]=await db.execute<ResultSetHeader>(
    `INSERT INTO calc_vat_regimes(code,label,treatment,rate,active,sort_order)
     VALUES(?,?,?,?,?,?)`,
    [code,label,input.treatment,storedRate,input.active?1:0,input.sortOrder]
  );
  const [rows]=await db.execute<RowDataPacket[]>(
    "SELECT id,code,label,treatment,rate,active,sort_order FROM calc_vat_regimes WHERE id=?",
    [result.insertId]
  );
  return mapRow(rows[0]);
}

export async function updateVatRegime(id:number,input:Partial<{
  code:string;label:string;treatment:VatTreatment;rate:number|null;active:boolean;sortOrder:number;
}>):Promise<VatRegime>{
  const [rows]=await db.execute<RowDataPacket[]>(
    "SELECT id,code,label,treatment,rate,active,sort_order FROM calc_vat_regimes WHERE id=?",
    [id]
  );
  if(!rows[0]) throw new Error("Btw-regime niet gevonden.");
  const current=mapRow(rows[0]);
  const nextTreatment=input.treatment??current.treatment;
  const nextRate=input.rate===undefined?current.rate:input.rate;
  const normalizedRate=nextTreatment==="normal"?(nextRate==null?null:Number(nextRate)):null;
  if(!["normal","reverse_charge","exempt"].includes(nextTreatment)) throw new Error("Ongeldige btw-behandeling.");
  if(nextTreatment==="normal"&&(normalizedRate==null||!Number.isFinite(normalizedRate)||normalizedRate<0||normalizedRate>100)) throw new Error("Normaal btw-regime vereist een geldig tarief.");
  const nextCode=(input.code??current.code).trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"_").replace(/^_+|_+$/g,"");
  const nextLabel=(input.label??current.label).trim();
  if(!nextCode||!nextLabel) throw new Error("Btw-regime mist code of omschrijving.");
  await db.execute(
    `UPDATE calc_vat_regimes
        SET code=?,label=?,treatment=?,rate=?,active=?,sort_order=?
      WHERE id=?`,
    [nextCode,nextLabel,nextTreatment,normalizedRate,input.active??current.active?1:0,input.sortOrder??current.sortOrder,id]
  );
  const [updated]=await db.execute<RowDataPacket[]>(
    "SELECT id,code,label,treatment,rate,active,sort_order FROM calc_vat_regimes WHERE id=?",
    [id]
  );
  return mapRow(updated[0]);
}
