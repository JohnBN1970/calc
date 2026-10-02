import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "./db.js";

export type CalcSubcalculationScopeType =
  | "building" | "facade" | "dwelling" | "dwelling_type" | "building_part"
  | "position" | "structure" | "recipe" | "custom";

export type CalcSubcalculation = {
  id:number;
  versionId:number;
  ref:string;
  description:string;
  dimensionType:string;
  dimensionRef:string|null;
  sortOrder:number;
  scopes:Array<{
    id:number;
    scopeType:CalcSubcalculationScopeType;
    scopeRef:string;
    includeDescendants:boolean;
    sortOrder:number;
  }>;
};

export async function listCalcSubcalculations(versionId:number):Promise<CalcSubcalculation[]> {
  const [rows]=await db.execute<RowDataPacket[]>(
    "SELECT id,version_id,ref,description,dimension_type,dimension_ref,sort_order FROM calculation_subcalculations WHERE version_id=? ORDER BY sort_order,id",
    [versionId]
  );
  const result:CalcSubcalculation[]=[];
  for(const row of rows){
    const [scopes]=await db.execute<RowDataPacket[]>(
      "SELECT id,scope_type,scope_ref,include_descendants,sort_order FROM calculation_subcalculation_scopes WHERE subcalculation_id=? ORDER BY sort_order,id",
      [row.id]
    );
    result.push({
      id:Number(row.id),
      versionId:Number(row.version_id),
      ref:String(row.ref),
      description:String(row.description),
      dimensionType:String(row.dimension_type),
      dimensionRef:row.dimension_ref==null?null:String(row.dimension_ref),
      sortOrder:Number(row.sort_order),
      scopes:scopes.map(scope=>({
        id:Number(scope.id),
        scopeType:String(scope.scope_type) as CalcSubcalculationScopeType,
        scopeRef:String(scope.scope_ref),
        includeDescendants:Boolean(scope.include_descendants),
        sortOrder:Number(scope.sort_order)
      }))
    });
  }
  return result;
}

export async function createCalcSubcalculation(input:{
  versionId:number;ref:string;description:string;sortOrder?:number;
}):Promise<number> {
  if(!Number.isInteger(input.versionId)||input.versionId<=0) throw new Error("Ongeldige calculatieversie.");
  const ref=input.ref.trim(),description=input.description.trim();
  if(!ref||!description) throw new Error("Referentie en omschrijving zijn verplicht.");
  const [insert]=await db.execute<ResultSetHeader>(
    "INSERT INTO calculation_subcalculations(version_id,ref,description,dimension_type,dimension_ref,sort_order) VALUES(?,?,?,'custom',NULL,?)",
    [input.versionId,ref,description,input.sortOrder??0]
  );
  return insert.insertId;
}

export async function addCalcSubcalculationScope(input:{
  subcalculationId:number;scopeType:CalcSubcalculationScopeType;scopeRef:string;includeDescendants?:boolean;sortOrder?:number;
}):Promise<number> {
  const ref=input.scopeRef.trim();
  if(!Number.isInteger(input.subcalculationId)||input.subcalculationId<=0||!ref) throw new Error("Ongeldige deelcalculatiescope.");
  const [insert]=await db.execute<ResultSetHeader>(
    "INSERT INTO calculation_subcalculation_scopes(subcalculation_id,scope_type,scope_ref,include_descendants,sort_order) VALUES(?,?,?,?,?)",
    [input.subcalculationId,input.scopeType,ref,input.includeDescendants?1:0,input.sortOrder??0]
  );
  return insert.insertId;
}

export async function setManualLineMembership(input:{
  subcalculationId:number;lineId:number;included:boolean;
}):Promise<void> {
  if(input.included){
    await db.execute(
      "INSERT INTO calculation_subcalculation_line_memberships(subcalculation_id,calculation_line_id,membership_source) VALUES(?,?,'manual') ON DUPLICATE KEY UPDATE membership_source='manual'",
      [input.subcalculationId,input.lineId]
    );
  } else {
    await db.execute(
      "DELETE FROM calculation_subcalculation_line_memberships WHERE subcalculation_id=? AND calculation_line_id=?",
      [input.subcalculationId,input.lineId]
    );
  }
}


export async function createScopedCalcSubcalculation(input:{
  versionId:number;
  ref:string;
  description:string;
  scopeType:CalcSubcalculationScopeType;
  scopeRef:string;
  includeDescendants?:boolean;
  sortOrder?:number;
}):Promise<number>{
  if(!Number.isInteger(input.versionId)||input.versionId<=0)throw new Error("Ongeldige calculatieversie.");
  const ref=input.ref.trim();
  const description=input.description.trim();
  const scopeRef=input.scopeRef.trim();
  if(!ref||!description||!scopeRef)throw new Error("Referentie, omschrijving en scope zijn verplicht.");
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    const [insert]=await connection.execute<ResultSetHeader>(
      "INSERT INTO calculation_subcalculations(version_id,ref,description,dimension_type,dimension_ref,sort_order) VALUES(?,?,?,?,?,?)",
      [input.versionId,ref,description,input.scopeType,scopeRef,input.sortOrder??0]
    );
    const id=Number(insert.insertId);
    await connection.execute(
      "INSERT INTO calculation_subcalculation_scopes(subcalculation_id,scope_type,scope_ref,include_descendants,sort_order) VALUES(?,?,?,?,?)",
      [id,input.scopeType,scopeRef,input.includeDescendants?1:0,0]
    );
    await connection.commit();
    return id;
  }catch(error){
    await connection.rollback();
    throw error;
  }finally{
    connection.release();
  }
}
