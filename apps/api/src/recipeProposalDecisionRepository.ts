import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "./db.js";

export type RecipeProposalDecision="accepted"|"rejected";
export type StoredRecipeProposalDecision={
  positionRef:string; recipeVersionId:number; decision:RecipeProposalDecision;
  reason:string|null; sourceSelectionVersion:string|null; decidedBy:number;
};

export async function listRecipeProposalDecisions(calculationId:number):Promise<StoredRecipeProposalDecision[]>{
  const [rows]=await db.execute<RowDataPacket[]>(
    `SELECT position_ref,recipe_version_id,decision,reason,source_selection_version,decided_by
       FROM calc_recipe_proposal_decisions WHERE calculation_id=? ORDER BY position_ref,recipe_version_id`,
    [calculationId]
  );
  return rows.map(row=>({
    positionRef:String(row.position_ref),recipeVersionId:Number(row.recipe_version_id),
    decision:String(row.decision) as RecipeProposalDecision,reason:row.reason==null?null:String(row.reason),
    sourceSelectionVersion:row.source_selection_version==null?null:String(row.source_selection_version),
    decidedBy:Number(row.decided_by)
  }));
}

export async function setRecipeProposalDecision(input:{
  calculationId:number;positionRef:string;recipeVersionId:number;decision:RecipeProposalDecision;
  reason:string|null;sourceSelectionVersion:string|null;decidedBy:number;
}):Promise<void>{
  await db.execute<ResultSetHeader>(
    `INSERT INTO calc_recipe_proposal_decisions
      (calculation_id,position_ref,recipe_version_id,decision,reason,source_selection_version,decided_by)
     VALUES(?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE decision=VALUES(decision),reason=VALUES(reason),
       source_selection_version=VALUES(source_selection_version),decided_by=VALUES(decided_by),updated_at=CURRENT_TIMESTAMP(6)`,
    [input.calculationId,input.positionRef,input.recipeVersionId,input.decision,input.reason,input.sourceSelectionVersion,input.decidedBy]
  );
}
