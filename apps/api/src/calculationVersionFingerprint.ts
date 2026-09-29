import { createHash } from "node:crypto";
import { canonicalCalculationSnapshot, type CalculationVersionSnapshot } from "./calculationVersionSnapshot.js";

export function calculationVersionFingerprint(snapshot:CalculationVersionSnapshot):string{
  return createHash("sha256").update(canonicalCalculationSnapshot(snapshot),"utf8").digest("hex");
}

export function verifyCalculationVersionFingerprint(snapshot:CalculationVersionSnapshot,expected:string):boolean{
  return calculationVersionFingerprint(snapshot)===expected;
}
