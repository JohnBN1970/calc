import type { PoolConnection } from "mysql2/promise";

export type AuditLine = {structureKey:string;description:string;[key:string]:unknown};
export type LineChange = {
  structureKey:string;description:string;kind:"added"|"removed"|"changed";
  fields:Array<{field:string;before:unknown;after:unknown}>;
};
const numericFields=new Set(["quantity","labourNorm","labourTotalHours","labourUnitCost","materialUnitCost","equipmentUnitCost","subcontractingUnitCost","otherUnitCost","sourceUnitPrice"]);
const fields=["parentStructureKey","sortOrder","lineType","code","description","unit","quantity","labourNorm","labourTotalHours","labourHoursInputMode","labourUnitCost","materialUnitCost","equipmentUnitCost","subcontractingUnitCost","otherUnitCost","vatRegimeId","priceSourceType","sourceReference","sourceSupplier","sourceUnitPrice","sourcePriceDate","sourceDocumentId","sourceDetails","sourceVisualPage","sourcePositionBounds","sourceVisualCrop","sourceVisualSearchRegion","sourceTextRegions","sourceOfferSummary"];
function value(field:string,input:unknown):unknown{
  if(input==null||input==="")return null;
  if(numericFields.has(field))return Number(Number(input).toFixed(4));
  if(input instanceof Date)return input.toISOString().slice(0,10);
  return input;
}
export function calculationLineChanges(before:AuditLine[],after:AuditLine[]):LineChange[]{
  const oldByKey=new Map(before.map(line=>[line.structureKey,line]));
  const newByKey=new Map(after.map(line=>[line.structureKey,line]));
  if(oldByKey.size!==before.length||newByKey.size!==after.length)throw new Error("Dubbele structuursleutel in wijzigingscontrole.");
  const changes:LineChange[]=[];
  for(const key of new Set([...oldByKey.keys(),...newByKey.keys()])){
    const old=oldByKey.get(key);const next=newByKey.get(key);
    const changed=fields.flatMap(field=>{
      const a=value(field,old?.[field]);const b=value(field,next?.[field]);
      return JSON.stringify(a)!==JSON.stringify(b)?[{field,before:a,after:b}]:[];
    });
    if(!old||!next||changed.length)changes.push({structureKey:key,description:String(next?.description??old?.description??""),kind:!old?"added":!next?"removed":"changed",fields:changed});
  }
  return changes;
}
export function auditLinesFromDatabase(rows:Array<Record<string,unknown>>):AuditLine[]{
  const keys=new Map(rows.map(row=>[Number(row.id),String(row.structure_key)]));
  return rows.map(row=>{
    const line:AuditLine={structureKey:String(row.structure_key),description:String(row.description??""),parentStructureKey:row.parent_id==null?null:keys.get(Number(row.parent_id))??null};
    for(const field of fields){
      if(field==="parentStructureKey")continue;
      const column=field.replace(/[A-Z]/g,letter=>"_"+letter.toLowerCase());
      line[field]=row[column]??null;
    }
    return line;
  });
}
export function revisionReason(raw:unknown,required=false):string{
  if(raw==null&&!required)return "Calculatie opgeslagen";
  if(typeof raw!=="string"||!raw.trim()||raw.trim().length>1000)throw new Error("Geef een wijzigingsreden van maximaal 1000 tekens op.");
  return raw.trim();
}
export function assertEditRevision(expected:unknown,current:unknown):void{
  if(!Number.isSafeInteger(expected)||Number(expected)<0||Number(expected)!==Number(current))throw new Error("Een andere bevoegde gebruiker heeft deze calculatie gewijzigd. Laad de actuele versie; eigen invoer blijft in dit scherm staan.");
}
export async function appendCalculationChange(connection:PoolConnection,input:{calculationId:number;versionId:number;actorId:number;kind:"draft_saved"|"version_started"|"version_established";editRevision:number;reason:string;changes:unknown}):Promise<void>{
  if(!Number.isSafeInteger(input.actorId)||input.actorId<=0)throw new Error("Een geverifieerde Office-gebruiker is vereist voor de wijzigingshistorie.");
  await connection.execute(
    `INSERT INTO calculation_change_events(calculation_id,version_id,actor_id,event_kind,edit_revision,reason,changes_json) VALUES(?,?,?,?,?,?,?)`,
    [input.calculationId,input.versionId,input.actorId,input.kind,input.editRevision,input.reason,JSON.stringify(input.changes)]
  );
}
