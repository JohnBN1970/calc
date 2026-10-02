import type { OfficeCalculationContextSnapshot } from "./officeClient.js";

export type CalcDocumentTriageStatus="primary"|"supporting"|"review"|"excluded";

export type CalcDocumentTriageItem={
  documentId:number;
  title:string;
  documentType:string|null;
  documentFamily:string|null;
  mimeType:string|null;
  status:CalcDocumentTriageStatus;
  score:number;
  factCount:number;
  reviewedFactCount:number;
  positionRefs:string[];
  signals:string[];
  reviewStatus:string;
  automaticStatus:"primary"|"supporting"|"review";
  overridden:boolean;
  overrideReason:string|null;
};

const geometryFacts=new Set(["quantity","width_mm","height_mm"]);
const commercialFacts=new Set(["description","supplier_unit_price"]);

export function triageCalculationDocuments(snapshot:OfficeCalculationContextSnapshot,overrides:Array<{officeDocumentId:number;decision:CalcDocumentTriageStatus;reason:string|null}>=[]):CalcDocumentTriageItem[]{
  const overrideByDocument=new Map(overrides.map(item=>[item.officeDocumentId,item]));
  const factsByDocument=new Map<number,typeof snapshot.context.facts>();
  for(const fact of snapshot.context.facts){
    const rows=factsByDocument.get(Number(fact.document_id))??[];
    rows.push(fact);
    factsByDocument.set(Number(fact.document_id),rows);
  }

  return snapshot.context.documents.map(document=>{
    const facts=factsByDocument.get(Number(document.document_id))??[];
    const relevant=facts.filter(fact=>geometryFacts.has(fact.fact_type)||commercialFacts.has(fact.fact_type));
    const reviewed=relevant.filter(fact=>["reviewed","accepted","confirmed"].includes(fact.review_status));
    const byPosition=new Map<string,Set<string>>();
    for(const fact of relevant){
      const ref=fact.position_ref?.trim();
      if(!ref)continue;
      const types=byPosition.get(ref)??new Set<string>();
      types.add(fact.fact_type);
      byPosition.set(ref,types);
    }

    const completeGeometry=[...byPosition.entries()]
      .filter(([,types])=>[...geometryFacts].every(type=>types.has(type)))
      .map(([ref])=>ref);

    const positionRefs=[...byPosition.keys()].sort((a,b)=>a.localeCompare(b,"nl"));
    const signals:string[]=[];
    let score=0;

    if(completeGeometry.length){
      score+=60+Math.min(20,(completeGeometry.length-1)*5);
      signals.push(completeGeometry.length+" positie(s) met complete hoeveelheid + B×H");
    }
    const geometryCount=relevant.filter(fact=>geometryFacts.has(fact.fact_type)).length;
    if(geometryCount&&!completeGeometry.length){
      score+=20;
      signals.push(geometryCount+" geometrisch(e) bronfeit(en), maar nog niet compleet per positie");
    }
    const descriptions=relevant.filter(fact=>fact.fact_type==="description").length;
    if(descriptions){
      score+=Math.min(10,descriptions*2);
      signals.push(descriptions+" omschrijving(en)");
    }
    const prices=relevant.filter(fact=>fact.fact_type==="supplier_unit_price").length;
    if(prices){
      score+=Math.min(10,prices*2);
      signals.push(prices+" leveranciersprijs/-prijzen");
    }
    if(relevant.length&&reviewed.length===relevant.length){
      score+=5;
      signals.push("relevante bronfeiten gereviewd");
    }else if(relevant.length){
      signals.push((relevant.length-reviewed.length)+" relevante bronfeit(en) wachten op review");
    }
    if(document.exclusion_reason){
      score=0;
      signals.push("Office-bron gemarkeerd met uitsluitreden: "+document.exclusion_reason);
    }
    score=Math.min(100,Math.round(score));

    const automaticStatus:"primary"|"supporting"|"review"=
      document.exclusion_reason?"review":
      completeGeometry.length?"primary":
      relevant.length?"supporting":
      "review";
    const override=overrideByDocument.get(Number(document.document_id));
    const status:CalcDocumentTriageStatus=override?.decision??automaticStatus;

    if(!signals.length)signals.push("Nog geen calculatiefeiten uit dit document beschikbaar.");

    return{
      documentId:Number(document.document_id),
      title:document.title,
      documentType:document.document_type,
      documentFamily:document.document_family,
      mimeType:document.mime_type,
      status,
      score,
      factCount:relevant.length,
      reviewedFactCount:reviewed.length,
      positionRefs,
      signals,
      reviewStatus:document.review_status,
      automaticStatus,
      overridden:Boolean(override),
      overrideReason:override?.reason??null
    };
  }).sort((a,b)=>{
    const order:Record<CalcDocumentTriageStatus,number>={primary:0,supporting:1,review:2,excluded:3};
    return order[a.status]-order[b.status]||b.score-a.score||a.title.localeCompare(b.title,"nl");
  });
}
