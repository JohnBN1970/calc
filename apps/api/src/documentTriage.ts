import type { OfficeCalculationContextSnapshot } from "./officeClient.js";
import { measurementKindForFact, measurementKindLabel } from "./measurementSemantics.js";

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

type SourceProfile="geometry"|"specification"|"commercial"|"photo"|"email"|"generic";
function sourceProfile(document:{title:string;document_type:string|null;document_family:string|null;mime_type?:string|null}):SourceProfile{
  const haystack=[document.title,document.document_type??"",document.document_family??""].join(" ").toLocaleLowerCase("nl-NL");
  const mime=String(document.mime_type??"").toLocaleLowerCase("nl-NL");
  if(mime.startsWith("image/")||/foto|photo|afbeelding|image/.test(haystack))return"photo";
  if(/message\/rfc822|email|e-mail|mailbericht|correspondentie/.test(mime+" "+haystack))return"email";
  if(/tekening|kozijn|gevel|plattegrond|detail|maat|meetstaat|uittrek|staat/.test(haystack))return"geometry";
  if(/bestek|stabu|nlsfb|werkomschrijving|technische omschrijving|specificatie/.test(haystack))return"specification";
  if(/offerte|prijs|begroting|leverancier|aanbieding/.test(haystack))return"commercial";
  return"generic";
}

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
    const geometryByPositionKind=new Map<string,Set<string>>();
    for(const fact of relevant){
      const ref=fact.position_ref?.trim();
      if(!ref)continue;
      const types=byPosition.get(ref)??new Set<string>();
      types.add(fact.fact_type);
      byPosition.set(ref,types);
      if(geometryFacts.has(fact.fact_type)){
        const kind=fact.fact_type==="quantity"?"quantity":measurementKindForFact(fact);
        const key=ref+"\u0000"+kind;
        const geometryTypes=geometryByPositionKind.get(key)??new Set<string>();
        geometryTypes.add(fact.fact_type);
        geometryByPositionKind.set(key,geometryTypes);
      }
    }

    const completeGeometryKeys=[...geometryByPositionKind.entries()]
      .filter(([key,types])=>{
        const [ref,kind]=key.split("\u0000");
        if(kind==="quantity")return false;
        const quantityTypes=geometryByPositionKind.get(ref+"\u0000quantity");
        return Boolean(quantityTypes?.has("quantity")&&types.has("width_mm")&&types.has("height_mm"));
      });
    const completeGeometry=[...new Set(completeGeometryKeys.map(([key])=>key.split("\u0000")[0]))];

    const positionRefs=[...byPosition.keys()].sort((a,b)=>a.localeCompare(b,"nl"));
    const signals:string[]=[];
    const profile=sourceProfile(document);
    let score=0;

    if(profile==="geometry")signals.push("bronprofiel: geometrie/maatvoering");
    else if(profile==="specification")signals.push("bronprofiel: bestek/specificatie");
    else if(profile==="commercial")signals.push("bronprofiel: commercieel/prijs");
    else if(profile==="photo")signals.push("bronprofiel: foto/visueel bewijs");
    else if(profile==="email")signals.push("bronprofiel: e-mail/scope");

    if(completeGeometry.length){
      score+=(profile==="geometry"?68:60)+Math.min(20,(completeGeometry.length-1)*5);
      signals.push(completeGeometry.length+" positie(s) met complete hoeveelheid + B×H van dezelfde maatsoort");
    }
    const geometryCount=relevant.filter(fact=>geometryFacts.has(fact.fact_type)).length;
    for(const [key] of completeGeometryKeys){const kind=key.split("\u0000")[1];if(kind)signals.push("complete geometrie: "+measurementKindLabel(kind as any));}
    const exactGeometryFromPhoto=profile==="photo"&&relevant.some(fact=>
      geometryFacts.has(fact.fact_type)&&
      !["reviewed","accepted","confirmed"].includes(fact.review_status)
    );
    if(exactGeometryFromPhoto){
      signals.push("exacte maatvoering uit foto vereist bevestiging of aantoonbare schaal");
    }
    if(geometryCount&&!completeGeometry.length){
      score+=profile==="geometry"?28:20;
      signals.push(geometryCount+" geometrisch(e) bronfeit(en), maar nog niet compleet per positie");
    }
    const descriptions=relevant.filter(fact=>fact.fact_type==="description").length;
    if(descriptions){
      score+=Math.min(profile==="specification"?18:10,descriptions*2);
      signals.push(descriptions+" omschrijving(en)");
    }
    const prices=relevant.filter(fact=>fact.fact_type==="supplier_unit_price").length;
    if(prices){
      score+=Math.min(profile==="commercial"?25:10,prices*3);
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
      completeGeometry.length&&profile!=="photo"?"primary":
      completeGeometry.length&&profile==="photo"&&reviewed.length===relevant.length?"primary":
      profile==="commercial"&&prices>0?"supporting":
      profile==="specification"&&descriptions>0?"supporting":
      profile==="email"&&descriptions>0?"supporting":
      profile==="photo"&&relevant.length>0?"supporting":
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
