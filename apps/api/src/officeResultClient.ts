import { config } from "./config.js";
import { signedOfficeHeaders } from "./officeTransport.js";

export type OfficeCommercialSummary={
  purchase:number;
  sales:number;
  margin:number;
  margin_pct:number;
  vat:number;
  total_incl_vat:number;
  vat_rate:number|null;
  vat_breakdown:Array<{
    code:string;
    label:string;
    rate:number|null;
    taxable_base:number;
    vat_amount:number;
    reverse_charged:boolean;
  }>;
};

export async function publishCalcResult(input:{
  calculationId:number;
  officeVersion:string;
  calcVersion:string;
  actorId:number;
  commercialSummary:OfficeCommercialSummary;
}): Promise<{ok:true;snapshot_id:number;content_hash:string;created:boolean}> {
  const path = `/api/workbench/v2/calculations/${input.calculationId}/calc-results`;
  const body = JSON.stringify({
    office_version: input.officeVersion,
    calc_version: input.calcVersion,
    actor_id: input.actorId,
    commercial_summary: input.commercialSummary
  });
  const headers = signedOfficeHeaders("POST", path, body);
  headers["Content-Type"] = "application/json";
  const response = await fetch(config.office.baseUrl + path, {
    method: "POST",
    headers,
    body,
    redirect: "error",
    signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  let payload:any={};
  try { payload=text?JSON.parse(text):{}; } catch {}
  if(!response.ok) throw new Error(payload?.message || `Office Calc-result publication failed with status ${response.status}.`);
  return payload;
}
