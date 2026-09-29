import { createHash, createHmac, randomUUID } from "node:crypto";
import { config } from "./config.js";
import type { OfficeEstablishedCalculationHandoff } from "./officeEstablishedCalculationHandoff.js";

function headers(path:string,body:string):Record<string,string>{
  const timestamp=Math.floor(Date.now()/1000).toString();
  const requestId=randomUUID();
  const bodyHash=createHash("sha256").update(body).digest("hex");
  const canonical=["POST",path,bodyHash,timestamp,requestId].join("\n");
  const signature=createHmac("sha256",config.office.sharedSecret).update(canonical).digest("hex");
  return{"Content-Type":"application/json",Accept:"application/json","X-BREBO-Timestamp":timestamp,"X-BREBO-Request-Id":requestId,"X-BREBO-Signature":`v1=${signature}`};
}

export async function handoffEstablishedCalculationToOffice(payload:OfficeEstablishedCalculationHandoff):Promise<{accepted:boolean;contentHash:string}>{
  const path=`/api/workbench/v1/calculations/${encodeURIComponent(payload.calculationId)}/established`;
  const body=JSON.stringify(payload);
  const response=await fetch(config.office.baseUrl+path,{method:"POST",headers:headers(path,body),body,redirect:"error",signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`Office established calculation handoff failed with status ${response.status}.`);
  const result=await response.json() as {contract?:string;accepted?:boolean;contentHash?:string};
  if(result.contract!=="brebo-office-established-calculation-ack-v1"||result.accepted!==true||result.contentHash!==payload.contentHash)throw new Error("Office returned an invalid established calculation acknowledgement.");
  return{accepted:true,contentHash:result.contentHash};
}
