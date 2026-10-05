import type { OfficeCalculationContextSnapshot } from "./officeClient.js";

type Document=OfficeCalculationContextSnapshot["context"]["documents"][number];

export type SourceRevisionAssessment={
  documentId:number;
  documentNumber:string|null;
  revision:string|null;
  revisionDate:string|null;
  documentStatus:string|null;
  priority:number;
  reasons:string[];
  supersededByDocumentId:number|null;
};

function statusWeight(value:string|null|undefined):number{
  const status=String(value??"").trim().toLocaleLowerCase("nl-NL");
  if(/uitvoering|definitief|definitive|issued for construction|ifc|goedgekeurd|approved/.test(status))return 40;
  if(/voorlopig|preliminary|ter review|review/.test(status))return 15;
  if(/concept|draft|vervallen|obsolete|superseded/.test(status))return -25;
  return 0;
}

function revisionParts(value:string|null|undefined):(number|string)[]{
  return String(value??"").trim().toLocaleUpperCase("nl-NL").split(/[^A-Z0-9]+/).filter(Boolean).map(part=>/^\d+$/.test(part)?Number(part):part);
}

function compareRevision(a:string|null|undefined,b:string|null|undefined):number{
  const aa=revisionParts(a),bb=revisionParts(b),length=Math.max(aa.length,bb.length);
  for(let i=0;i<length;i++){
    const av=aa[i],bv=bb[i];
    if(av===undefined)return-1;if(bv===undefined)return 1;if(av===bv)continue;
    if(typeof av==="number"&&typeof bv==="number")return av-bv;
    return String(av).localeCompare(String(bv),"nl",{numeric:true});
  }
  return 0;
}

function dateValue(document:Document):number{
  const raw=document.revision_date??document.issued_at??"";
  const parsed=Date.parse(raw);
  return Number.isFinite(parsed)?parsed:0;
}

export function assessDocumentRevisions(snapshot:OfficeCalculationContextSnapshot):SourceRevisionAssessment[]{
  const groups=new Map<string,Document[]>();
  for(const document of snapshot.context.documents){
    const number=String(document.document_number??"").trim();
    if(!number)continue;
    const rows=groups.get(number)??[];rows.push(document);groups.set(number,rows);
  }
  const result:SourceRevisionAssessment[]=[];
  for(const [number,documents] of groups){
    const ranked=[...documents].sort((a,b)=>{
      const status=statusWeight(b.document_status)-statusWeight(a.document_status);
      if(status)return status;
      const revision=compareRevision(b.revision,a.revision);
      if(revision)return revision;
      return dateValue(b)-dateValue(a);
    });
    const leader=ranked[0];
    for(const document of ranked){
      const reasons:string[]=[];
      const sw=statusWeight(document.document_status);
      if(document.document_status)reasons.push("status "+document.document_status);
      if(document.revision)reasons.push("revisie "+document.revision);
      if(document.revision_date??document.issued_at)reasons.push("datum "+(document.revision_date??document.issued_at));
      result.push({
        documentId:Number(document.document_id),documentNumber:number,revision:document.revision??null,
        revisionDate:document.revision_date??document.issued_at??null,documentStatus:document.document_status??null,
        priority:sw+(document===leader?20:0),reasons,
        supersededByDocumentId:document===leader?null:Number(leader.document_id)
      });
    }
  }
  return result.sort((a,b)=>a.documentNumber!.localeCompare(b.documentNumber!,"nl")||b.priority-a.priority);
}
