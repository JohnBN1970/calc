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


export type CalculationVatComponent={
  id:number;
  versionId:number;
  vatRegimeId:number|null;
  regimeCode:string;
  label:string;
  treatment:VatTreatment;
  rate:number|null;
  taxableBase:number;
  vatAmount:number;
  sortOrder:number;
};

function mapComponent(row:RowDataPacket):CalculationVatComponent{
  return{
    id:Number(row.id),
    versionId:Number(row.version_id),
    vatRegimeId:row.vat_regime_id==null?null:Number(row.vat_regime_id),
    regimeCode:String(row.regime_code),
    label:String(row.label),
    treatment:String(row.treatment) as VatTreatment,
    rate:row.rate==null?null:Number(row.rate),
    taxableBase:Number(row.taxable_base??0),
    vatAmount:Number(row.vat_amount??0),
    sortOrder:Number(row.sort_order??0)
  };
}

export async function listCalculationVatComponents(versionId:number):Promise<CalculationVatComponent[]>{
  const [rows]=await db.execute<RowDataPacket[]>(
    `SELECT id,version_id,vat_regime_id,regime_code,label,treatment,rate,taxable_base,vat_amount,sort_order
       FROM calculation_vat_components
      WHERE version_id=?
      ORDER BY sort_order,id`,
    [versionId]
  );
  return rows.map(mapComponent);
}

export async function replaceCalculationVatComponents(versionId:number,input:Array<{
  vatRegimeId:number;
  taxableBase:number;
}>):Promise<CalculationVatComponent[]>{
  const [regimeRows]=await db.execute<RowDataPacket[]>(
    `SELECT id,code,label,treatment,rate,active,sort_order
       FROM calc_vat_regimes
      WHERE id IN (${input.length?input.map(()=>"?").join(","):"0"})`,
    input.map(item=>item.vatRegimeId)
  );
  const regimes=new Map(regimeRows.map(row=>[Number(row.id),mapRow(row)]));
  const unique=new Set<number>();
  let baseTotal=0;
  for(const item of input){
    if(unique.has(item.vatRegimeId))throw new Error("Btw-regime komt dubbel voor in de calculatie.");
    unique.add(item.vatRegimeId);
    const regime=regimes.get(item.vatRegimeId);
    if(!regime||!regime.active)throw new Error("Gekozen btw-regime is niet actief.");
    const taxableBase=Number(item.taxableBase);
    if(!Number.isFinite(taxableBase)||taxableBase<0)throw new Error("Ongeldige btw-grondslag.");
    baseTotal+=taxableBase;
  }
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    await connection.execute("DELETE FROM calculation_vat_components WHERE version_id=?",[versionId]);
    for(const item of input){
      const regime=regimes.get(item.vatRegimeId)!;
      const vatAmount=regime.treatment==="normal"?Number(item.taxableBase)*((regime.rate??0)/100):0;
      await connection.execute(
        `INSERT INTO calculation_vat_components
          (version_id,vat_regime_id,regime_code,label,treatment,rate,taxable_base,vat_amount,sort_order)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        [versionId,regime.id,regime.code,regime.label,regime.treatment,regime.rate,Number(item.taxableBase),vatAmount,regime.sortOrder]
      );
    }
    await connection.commit();
  }catch(error){
    await connection.rollback();
    throw error;
  }finally{
    connection.release();
  }
  return listCalculationVatComponents(versionId);
}
