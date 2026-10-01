import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { db } from "./db.js";

export type CalcRecipeLine = {
  id:number;
  lineRef:string;
  sortOrder:number;
  costKind:"material"|"labour"|"equipment"|"subcontracting"|"other";
  description:string;
  unit:string|null;
  officeSourceType:string|null;
  officeSourceRef:string|null;
  takeoffBasis:"area"|"perimeter"|"two_sides_plus_head"|"width"|"height"|"part_area"|"internal_joint"|"fixed";
  factor:number;
  wastePct:number;
  fixedQuantity:number|null;
  roundingStep:number|null;
  minimumQuantity:number|null;
  metadata:Record<string,unknown>|null;
};

export type CalcRecipeVersion = {
  id:number;
  recipeId:number;
  recipeKey:string;
  name:string;
  description:string|null;
  versionNo:number;
  status:"draft"|"published"|"archived";
  applicability:Record<string,unknown>|null;
  lines:CalcRecipeLine[];
};

function parseJson(value:unknown):Record<string,unknown>|null {
  if(value==null||value==="") return null;
  try {
    const parsed=typeof value==="string"?JSON.parse(value):value;
    return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:null;
  } catch { return null; }
}

export async function listCalcRecipes():Promise<CalcRecipeVersion[]> {
  const [rows]=await db.query<RowDataPacket[]>(`
    SELECT r.id recipe_id,r.recipe_key,r.name,r.description,
           v.id version_id,v.version_no,v.status,v.applicability_json
    FROM recipes r
    JOIN recipe_versions v ON v.recipe_id=r.id
    WHERE r.active=1 AND v.status IN ('draft','published')
    ORDER BY r.name,v.version_no DESC
  `);
  const result:CalcRecipeVersion[]=[];
  for(const row of rows){
    const [lineRows]=await db.query<RowDataPacket[]>(`
      SELECT * FROM recipe_lines WHERE recipe_version_id=? ORDER BY sort_order,id
    `,[row.version_id]);
    result.push({
      id:Number(row.version_id),
      recipeId:Number(row.recipe_id),
      recipeKey:String(row.recipe_key),
      name:String(row.name),
      description:row.description==null?null:String(row.description),
      versionNo:Number(row.version_no),
      status:String(row.status) as CalcRecipeVersion["status"],
      applicability:parseJson(row.applicability_json),
      lines:lineRows.map(line=>({
        id:Number(line.id),
        lineRef:String(line.line_ref),
        sortOrder:Number(line.sort_order),
        costKind:String(line.cost_kind) as CalcRecipeLine["costKind"],
        description:String(line.description),
        unit:line.unit==null?null:String(line.unit),
        officeSourceType:line.office_source_type==null?null:String(line.office_source_type),
        officeSourceRef:line.office_source_ref==null?null:String(line.office_source_ref),
        takeoffBasis:String(line.takeoff_basis) as CalcRecipeLine["takeoffBasis"],
        factor:Number(line.factor),
        wastePct:Number(line.waste_pct),
        fixedQuantity:line.fixed_quantity==null?null:Number(line.fixed_quantity),
        roundingStep:line.rounding_step==null?null:Number(line.rounding_step),
        minimumQuantity:line.minimum_quantity==null?null:Number(line.minimum_quantity),
        metadata:parseJson(line.metadata_json)
      }))
    });
  }
  return result;
}

export async function createCalcRecipe(input:{recipeKey:string;name:string;description?:string|null}):Promise<number> {
  const key=input.recipeKey.trim(),name=input.name.trim();
  if(!key||!name) throw new Error("Receptcode en naam zijn verplicht.");
  const connection=await db.getConnection();
  try {
    await connection.beginTransaction();
    const [insert]=await connection.execute<ResultSetHeader>(
      "INSERT INTO recipes (recipe_key,name,description) VALUES (?,?,?)",
      [key,name,input.description?.trim()||null]
    );
    await connection.execute(
      "INSERT INTO recipe_versions (recipe_id,version_no,status) VALUES (?,1,'draft')",
      [insert.insertId]
    );
    await connection.commit();
    return insert.insertId;
  } catch(error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

export async function addCalcRecipeLine(input:{
  recipeVersionId:number;lineRef:string;sortOrder:number;costKind:CalcRecipeLine["costKind"];
  description:string;unit?:string|null;officeSourceType?:string|null;officeSourceRef?:string|null;
  takeoffBasis:CalcRecipeLine["takeoffBasis"];factor?:number;wastePct?:number;fixedQuantity?:number|null;
  roundingStep?:number|null;minimumQuantity?:number|null;metadata?:Record<string,unknown>|null;
}):Promise<number> {
  if(!Number.isInteger(input.recipeVersionId)||input.recipeVersionId<=0) throw new Error("Ongeldige receptversie.");
  if(!input.lineRef.trim()||!input.description.trim()) throw new Error("Receptregel mist identiteit of omschrijving.");
  const [insert]=await db.execute<ResultSetHeader>(`
    INSERT INTO recipe_lines
      (recipe_version_id,line_ref,sort_order,cost_kind,description,unit,office_source_type,office_source_ref,
       takeoff_basis,factor,waste_pct,fixed_quantity,rounding_step,minimum_quantity,metadata_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `,[
    input.recipeVersionId,input.lineRef.trim(),input.sortOrder,input.costKind,input.description.trim(),input.unit??null,
    input.officeSourceType?.trim()||null,input.officeSourceRef?.trim()||null,input.takeoffBasis,input.factor??1,input.wastePct??0,
    input.fixedQuantity??null,input.roundingStep??null,input.minimumQuantity??null,input.metadata?JSON.stringify(input.metadata):null
  ]);
  return insert.insertId;
}
