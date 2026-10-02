import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "./db.js";

export type DocumentTriageDecision="primary"|"supporting"|"review"|"excluded";

export type DocumentTriageOverride={
  officeDocumentId:number;
  decision:DocumentTriageDecision;
  reason:string|null;
  decidedBy:number;
};

export async function listDocumentTriageOverrides(calculationId:number):Promise<DocumentTriageOverride[]>{
  const [rows]=await db.execute<RowDataPacket[]>(
    `SELECT office_document_id,decision,reason,decided_by
       FROM calc_document_triage_decisions
      WHERE calculation_id=?
      ORDER BY office_document_id`,
    [calculationId]
  );
  return rows.map(row=>({
    officeDocumentId:Number(row.office_document_id),
    decision:String(row.decision) as DocumentTriageDecision,
    reason:row.reason==null?null:String(row.reason),
    decidedBy:Number(row.decided_by)
  }));
}

export async function setDocumentTriageOverride(input:{
  calculationId:number;
  officeDocumentId:number;
  decision:DocumentTriageDecision;
  reason:string|null;
  decidedBy:number;
}):Promise<void>{
  await db.execute<ResultSetHeader>(
    `INSERT INTO calc_document_triage_decisions
      (calculation_id,office_document_id,decision,reason,decided_by)
     VALUES(?,?,?,?,?)
     ON DUPLICATE KEY UPDATE decision=VALUES(decision),reason=VALUES(reason),decided_by=VALUES(decided_by),updated_at=CURRENT_TIMESTAMP(6)`,
    [input.calculationId,input.officeDocumentId,input.decision,input.reason,input.decidedBy]
  );
}

export async function clearDocumentTriageOverride(calculationId:number,officeDocumentId:number):Promise<void>{
  await db.execute("DELETE FROM calc_document_triage_decisions WHERE calculation_id=? AND office_document_id=?",[calculationId,officeDocumentId]);
}
