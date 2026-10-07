import type { RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";
import { db } from "./db.js";
import { listCalcSubcalculations } from "./calcSubcalculationRepository.js";
import { calculateLineCostBreakdown } from "./calculationLineAmount.js";
import { lineContributesToCalculationTotals } from "./calculationLineTotals.js";
import { applyCostAllocations, totalCost, type CostBreakdown } from "./costAllocation.js";

export type SubcalculationResult={
  id:number;ref:string;description:string;
  lineIds:number[];
  directCost:number;
  costs:{labour:number;material:number;equipment:number;subcontracting:number;other:number};
};

function lineAmounts(row:RowDataPacket){
  return calculateLineCostBreakdown({
    quantity:Number(row.quantity??0),
    labourTotalHours:row.labour_total_hours==null?null:Number(row.labour_total_hours),
    labourUnitCost:Number(row.labour_unit_cost??0),
    materialUnitCost:Number(row.material_unit_cost??0),
    equipmentUnitCost:Number(row.equipment_unit_cost??0),
    subcontractingUnitCost:Number(row.subcontracting_unit_cost??0),
    otherUnitCost:Number(row.other_unit_cost??0)
  });
}

export async function evaluateSubcalculations(versionId:number, executor:Pick<Pool|PoolConnection,"execute"> = db):Promise<SubcalculationResult[]>{
  const [lineRows]=await executor.execute<RowDataPacket[]>(`
    SELECT id,line_type,quantity,labour_total_hours,labour_unit_cost,material_unit_cost,
           equipment_unit_cost,subcontracting_unit_cost,other_unit_cost
      FROM calculation_lines
     WHERE version_id=?
  `,[versionId]);
  const lines=lineRows.filter(row=>lineContributesToCalculationTotals(String(row.line_type)));
  const lineById=new Map(lines.map(row=>[Number(row.id),row]));
  const baseCostsByLine=new Map<number,CostBreakdown>(lines.map(row=>[Number(row.id),lineAmounts(row)]));
  const [allocationRows]=await executor.execute<RowDataPacket[]>(
    `SELECT source_line_id,target_line_id,amount
       FROM calculation_line_allocations
      WHERE version_id=?
      ORDER BY id`,
    [versionId]
  );
  const effectiveCostsByLine=applyCostAllocations({
    costsByLine:baseCostsByLine,
    allocations:allocationRows.map(row=>({
      sourceLineId:Number(row.source_line_id),
      targetLineId:Number(row.target_line_id),
      amount:Number(row.amount??0)
    }))
  });

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
      const amounts=effectiveCostsByLine.get(id); if(!amounts)continue;
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


export async function evaluateCalculationPartitions(
  versionId:number,
  executor:Pick<Pool|PoolConnection,"execute"> = db
):Promise<{
  totalDirectCost:number;
  mainDirectCost:number;
  assignedLineIds:number[];
  subcalculations:SubcalculationResult[];
}>{
  const subcalculations=await evaluateSubcalculations(versionId,executor);
  const assigned=new Set<number>();
  for(const sub of subcalculations) for(const id of sub.lineIds) assigned.add(id);

  const [lineRows]=await executor.execute<RowDataPacket[]>(`
    SELECT id,line_type,quantity,labour_total_hours,labour_unit_cost,material_unit_cost,
           equipment_unit_cost,subcontracting_unit_cost,other_unit_cost
      FROM calculation_lines
     WHERE version_id=?
  `,[versionId]);
  const lines=lineRows.filter(row=>lineContributesToCalculationTotals(String(row.line_type)));
  const baseCostsByLine=new Map<number,CostBreakdown>(lines.map(row=>[Number(row.id),lineAmounts(row)]));
  const [allocationRows]=await executor.execute<RowDataPacket[]>(
    `SELECT source_line_id,target_line_id,amount
       FROM calculation_line_allocations
      WHERE version_id=?
      ORDER BY id`,
    [versionId]
  );
  const effectiveCostsByLine=applyCostAllocations({
    costsByLine:baseCostsByLine,
    allocations:allocationRows.map(row=>({
      sourceLineId:Number(row.source_line_id),
      targetLineId:Number(row.target_line_id),
      amount:Number(row.amount??0)
    }))
  });

  let totalDirectCost=0;
  let mainDirectCost=0;
  for(const row of lines){
    const amounts=effectiveCostsByLine.get(Number(row.id));
    if(!amounts)continue;
    const lineTotal=totalCost(amounts);
    totalDirectCost+=lineTotal;
    if(!assigned.has(Number(row.id))) mainDirectCost+=lineTotal;
  }

  return {
    totalDirectCost,
    mainDirectCost,
    assignedLineIds:[...assigned],
    subcalculations
  };
}
