import { createHash, createHmac, randomUUID } from "node:crypto";
import { config } from "./config.js";

export function signedOfficeHeaders(method:string,path:string,body:string|Buffer=""):Record<string,string>{
  const timestamp=Math.floor(Date.now()/1000).toString();
  const requestId=randomUUID();
  const bodyHash=createHash("sha256").update(body).digest("hex");
  const canonical=[method.toUpperCase(),path,bodyHash,timestamp,requestId].join("\n");
  const signature=createHmac("sha256",config.office.sharedSecret).update(canonical).digest("hex");
  return{
    Accept:"application/json",
    "X-BREBO-Timestamp":timestamp,
    "X-BREBO-Request-Id":requestId,
    "X-BREBO-Signature":`v1=${signature}`
  };
}
