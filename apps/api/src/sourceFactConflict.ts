import type { OfficeCalculationContextSnapshot } from "./officeClient.js";

export type SourceFactConflict={
  positionRef:string;
  factType:string;
  values:Array<{
    documentId:number;
    value:string;
    unit:string|null;
    confidence:number;
    reviewStatus:string;
  }>;
};

const comparableFactTypes=new Set(["quantity","width_mm","height_mm","supplier_unit_price"]);

function factValue(fact:OfficeCalculationContextSnapshot["context"]["facts"][number]):string|null{
  if(fact.value_number!==null&&Number.isFinite(Number(fact.value_number)))return String(Number(fact.value_number));
  const value=fact.value_text?.trim();
  return value||null;
}

export function detectSourceFactConflicts(snapshot:OfficeCalculationContextSnapshot):SourceFactConflict[]{
  const groups=new Map<string,OfficeCalculationContextSnapshot["context"]["facts"]>();
  for(const fact of snapshot.context.facts){
    const positionRef=fact.position_ref?.trim();
    if(!positionRef||!comparableFactTypes.has(fact.fact_type))continue;
    const key=positionRef+"\u0000"+fact.fact_type;
    const rows=groups.get(key)??[];
    rows.push(fact);
    groups.set(key,rows);
  }

  const conflicts:SourceFactConflict[]=[];
  for(const rows of groups.values()){
    const normalized=new Map<string,typeof rows>();
    for(const fact of rows){
      const value=factValue(fact);
      if(value===null)continue;
      const key=value+"\u0000"+String(fact.unit??"").trim().toLocaleLowerCase("nl-NL");
      const bucket=normalized.get(key)??[];
      bucket.push(fact);
      normalized.set(key,bucket);
    }
    if(normalized.size<=1)continue;
    const first=rows[0];
    conflicts.push({
      positionRef:first.position_ref!.trim(),
      factType:first.fact_type,
      values:[...normalized.values()].map(bucket=>({
        documentId:Number(bucket[0].document_id),
        value:factValue(bucket[0])!,
        unit:bucket[0].unit,
        confidence:Number(bucket[0].confidence??0),
        reviewStatus:bucket[0].review_status
      }))
    });
  }
  return conflicts.sort((a,b)=>a.positionRef.localeCompare(b.positionRef,"nl")||a.factType.localeCompare(b.factType,"nl"));
}
