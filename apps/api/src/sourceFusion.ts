import type { OfficeCalculationContextSnapshot } from "./officeClient.js";
import { measurementKindForFact } from "./measurementSemantics.js";
import { assessDocumentRevisions } from "./sourceRevision.js";
import { evaluateSourceDecisions } from "./sourceDecisionEvaluation.js";

type Fact=OfficeCalculationContextSnapshot["context"]["facts"][number];

export type FusedSourceFact={
  factType:string;
  measurementKind:string|null;
  valueText:string|null;
  valueNumber:number|null;
  unit:string|null;
  documentId:number;
  sourcePage:number|null;
  sourceFragment:string|null;
  confidence:number;
  reviewStatus:string;
};

export type PositionSourceFusion={
  positionRef:string;
  facts:FusedSourceFact[];
  sourceDocumentIds:number[];
  sourcePages:number[];
  blocked:boolean;
  reasons:string[];
};

function key(fact:Fact):string{
  const kind=["width_mm","height_mm"].includes(fact.fact_type)?measurementKindForFact(fact):"";
  return fact.fact_type+"\u0000"+kind;
}
function normalizedValue(fact:Fact):string{
  return fact.value_number!==null?String(Number(fact.value_number)):String(fact.value_text??"").trim();
}
function score(fact:Fact):number{
  const reviewed=["reviewed","accepted","confirmed"].includes(fact.review_status)?100:0;
  return reviewed+Number(fact.confidence??0)*10+(fact.source_page!==null?1:0);
}

export function fusePositionSources(snapshot:OfficeCalculationContextSnapshot,acceptedDocumentIds:Set<number>):PositionSourceFusion[]{
  const superseded=new Set(assessDocumentRevisions(snapshot).filter(item=>item.supersededByDocumentId!==null).map(item=>item.documentId));
  const decisions=evaluateSourceDecisions(snapshot);
  const byPosition=new Map<string,Fact[]>();
  for(const fact of snapshot.context.facts){
    const ref=fact.position_ref?.trim();
    if(!ref||!acceptedDocumentIds.has(Number(fact.document_id))||superseded.has(Number(fact.document_id)))continue;
    const rows=byPosition.get(ref)??[];rows.push(fact);byPosition.set(ref,rows);
  }
  return [...byPosition.entries()].map(([positionRef,facts])=>{
    const positionDecisions=decisions.filter(item=>item.positionRef===positionRef);
    const conflicts=new Set(positionDecisions.filter(item=>item.status==="conflict").map(item=>item.factType+"\u0000"+String(item.measurementKind??"")));
    const grouped=new Map<string,Fact[]>();
    for(const fact of facts){const k=key(fact);const rows=grouped.get(k)??[];rows.push(fact);grouped.set(k,rows);}
    const selected:FusedSourceFact[]=[];
    const reasons:string[]=[];
    for(const [k,rows] of grouped){
      if(conflicts.has(k)){reasons.push("Actueel bronconflict voor "+rows[0].fact_type+".");continue;}
      const values=new Set(rows.map(normalizedValue).filter(Boolean));
      if(values.size>1){
        reasons.push("Meerdere actuele waarden voor "+rows[0].fact_type+" vereisen review.");
        continue;
      }
      const chosen=[...rows].sort((a,b)=>score(b)-score(a))[0];
      if(!chosen||!normalizedValue(chosen))continue;
      selected.push({
        factType:chosen.fact_type,
        measurementKind:["width_mm","height_mm"].includes(chosen.fact_type)?measurementKindForFact(chosen):null,
        valueText:chosen.value_text,valueNumber:chosen.value_number,unit:chosen.unit,
        documentId:Number(chosen.document_id),sourcePage:chosen.source_page,sourceFragment:chosen.source_fragment,
        confidence:Number(chosen.confidence??0),reviewStatus:chosen.review_status
      });
    }
    return{
      positionRef,facts:selected,
      sourceDocumentIds:[...new Set(selected.map(item=>item.documentId))].sort((a,b)=>a-b),
      sourcePages:[...new Set(selected.flatMap(item=>item.sourcePage===null?[]:[item.sourcePage]))].sort((a,b)=>a-b),
      blocked:positionDecisions.some(item=>item.status==="conflict")||reasons.length>0,
      reasons
    };
  }).sort((a,b)=>a.positionRef.localeCompare(b.positionRef,"nl"));
}
