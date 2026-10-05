export type PublicationFreshnessStatus=
  |"never_published"
  |"current"
  |"draft_pending"
  |"office_changed"
  |"version_mismatch";

export type PublicationFreshness={
  status:PublicationFreshnessStatus;
  message:string;
  latestVersionId:number;
  latestVersionNo:number;
  latestVersionStatus:string;
  latestEstablishedVersionId:number|null;
  officeCalcVersion:string|null;
  officeVersion:string|null;
  currentForOfficeVersion:boolean|null;
};

export function calculatePublicationFreshness(input:{
  latest:{id:number;versionNo:number;status:string};
  latestEstablished:{id:number;versionNo:number}|null;
  officeResult:null|{
    calcVersion:string;
    officeVersion:string;
    currentForOfficeVersion?:boolean;
  };
}):PublicationFreshness{
  const base={
    latestVersionId:input.latest.id,
    latestVersionNo:input.latest.versionNo,
    latestVersionStatus:input.latest.status,
    latestEstablishedVersionId:input.latestEstablished?.id??null,
    officeCalcVersion:input.officeResult?.calcVersion??null,
    officeVersion:input.officeResult?.officeVersion??null,
    currentForOfficeVersion:input.officeResult?.currentForOfficeVersion??null
  };

  if(!input.officeResult||!input.latestEstablished){
    return{...base,status:"never_published",message:"Deze calculatie is nog niet gepubliceerd naar Office."};
  }

  if(String(input.officeResult.calcVersion)!==String(input.latestEstablished.id)){
    return{...base,status:"version_mismatch",message:"Office verwijst niet naar de laatst vastgestelde Calc-versie."};
  }

  if(input.officeResult.currentForOfficeVersion===false){
    return{...base,status:"office_changed",message:"Office is gewijzigd sinds deze Calc-versie is gepubliceerd."};
  }

  if(input.latest.status==="draft"&&input.latest.id!==input.latestEstablished.id){
    return{...base,status:"draft_pending",message:"Er staat een nieuw Calc-concept klaar; Office bevat nog de laatst vastgestelde versie."};
  }

  return{...base,status:"current",message:"De gepubliceerde Calc-versie is actueel in Office."};
}
