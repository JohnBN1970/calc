import type { RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";
import { db } from "./db.js";
import { listCalcSubcalculations } from "./calcSubcalculationRepository.js";

export type SubcalculationResult={
  id:number;ref:string;description:string;
  lineIds:number[];
  directCost:number;
  costs:{labour:number;material:number;equipment:number;subcontracting:number;other:number};
};

function lineAmounts(row:RowDataPacket){
  const quantity=Number(row.quantity??0);
  const labourHours=Number(row.labour_total_hours??0);
  return {
    labour:labourHours*Number(row.labour_unit_cost??0),
    material:quantity*Number(row.material_unit_cost??0),
    equipment:quantity*Number(row.equipment_unit_cost??0),
    subcontracting:quantity*Number(row.subcontracting_unit_cost??0),
    other:quantity*Number(row.other_unit_cost??0)
  };
}

export async function evaluateSubcalculations(versionId:number, executor:Pick<Pool|PoolConnection,"execute"> = db):Promise<SubcalculationResult[]>{
  const [lines]=await executor.execute<RowDataPacket[]>(`
    SELECT id,line_type,quantity,labour_total_hours,labour_unit_cost,material_unit_cost,
           equipment_unit_cost,subcontracting_unit_cost,other_unit_cost
      FROM calculation_lines
     WHERE version_id=?
       AND line_type NOT IN ('chapter','paragraph','note','option')
  `,[versionId]);
  const lineById=new Map(lines.map(row=>[Number(row.id),row]));

  const [tags]=await executor.execute<RowDataPacket[]>(`
    SELECT t.line_id,t.scope_type,t.scope_ref
      FROM calculation_line_scope_tags t
      JOIN calculation_lines l ON l.id=t.line_id
     WHERE l.version_id=?
  `,[versionId]);
  const tagsByLine=new Map<number,Map<string,Set<string>>>();
  for(const row of tags){
    const lineId=Number(row.line_id);
    let byType=tagsByLine.get(lineId);
    if(!byType){byType=new Map();tagsByLine.set(lineId,byType);}
    const type=String(row.scope_type),ref=String(row.scope_ref);
    let refs=byType.get(type);
    if(!refs){refs=new Set();byType.set(type,refs);}
    refs.add(ref);
  }

  const subcalculations=await listCalcSubcalculations(versionId);
  const results:SubcalculationResult[]=[];
  for(const sub of subcalculations){
    const [manualRows]=await executor.execute<RowDataPacket[]>(
      "SELECT calculation_line_id FROM calculation_subcalculation_line_memberships WHERE subcalculation_id=?",
      [sub.id]
    );
    const included=new Set<number>(manualRows.map(row=>Number(row.calculation_line_id)).filter(id=>lineById.has(id)));

    const grouped=new Map<string,Set<string>>();
    for(const scope of sub.scopes){
      let refs=grouped.get(scope.scopeType);
      if(!refs){refs=new Set();grouped.set(scope.scopeType,refs);}
      refs.add(scope.scopeRef);
    }

    if(grouped.size){
      for(const line of lines){
        const lineId=Number(line.id);
        const lineTags=tagsByLine.get(lineId);
        if(!lineTags)continue;
        let matches=true;
        for(const [type,refs] of grouped){
          const have=lineTags.get(type);
          if(!have||![...refs].some(ref=>have.has(ref))){matches=false;break;}
        }
        if(matches)included.add(lineId);
      }
    }

    const costs={labour:0,material:0,equipment:0,subcontracting:0,other:0};
    for(const id of included){
      const row=lineById.get(id); if(!row)continue;
      const amounts=lineAmounts(row);
      costs.labour+=amounts.labour;
      costs.material+=amounts.material;
      costs.equipment+=amounts.equipment;
      costs.subcontracting+=amounts.subcontracting;
      costs.other+=amounts.other;
    }
    const directCost=costs.labour+costs.material+costs.equipment+costs.subcontracting+costs.other;
    results.push({id:sub.id,ref:sub.ref,description:sub.description,lineIds:[...included],directCost,costs});
  }
  return results;
}
