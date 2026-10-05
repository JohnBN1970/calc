export type VersionDiffLine={
  structureKey:string;
  lineType:string;
  code:string|null;
  description:string;
  unit:string|null;
  quantity:number|null;
  labourNorm:number|null;
  labourTotalHours:number|null;
  labourHoursInputMode:string|null;
  labourUnitCost:number;
  materialUnitCost:number;
  equipmentUnitCost:number;
  subcontractingUnitCost:number;
  otherUnitCost:number;
  vatRegimeId:number|null;
  priceSourceType:string;
  sourceReference:string|null;
};

export type VersionDiffChange={
  structureKey:string;
  kind:"added"|"removed"|"changed";
  description:string;
  changedFields:string[];
};

const tracked:(keyof VersionDiffLine)[]=[
  "lineType","code","description","unit","quantity","labourNorm","labourTotalHours",
  "labourHoursInputMode","labourUnitCost","materialUnitCost","equipmentUnitCost",
  "subcontractingUnitCost","otherUnitCost","vatRegimeId","priceSourceType","sourceReference"
];

function same(a:unknown,b:unknown):boolean{
  if(typeof a==="number"||typeof b==="number"){
    const na=a==null?null:Number(a);
    const nb=b==null?null:Number(b);
    if(na===null||nb===null)return na===nb;
    return Number.isFinite(na)&&Number.isFinite(nb)&&Math.abs(na-nb)<=0.000001;
  }
  return (a??null)===(b??null);
}

export function diffVersionLines(input:{
  before:VersionDiffLine[];
  after:VersionDiffLine[];
}):VersionDiffChange[]{
  const before=new Map(input.before.map(line=>[line.structureKey,line]));
  const after=new Map(input.after.map(line=>[line.structureKey,line]));
  const keys=[...new Set([...before.keys(),...after.keys()])].sort((a,b)=>a.localeCompare(b));
  const changes:VersionDiffChange[]=[];
  for(const key of keys){
    const oldLine=before.get(key);
    const newLine=after.get(key);
    if(!oldLine&&newLine){
      changes.push({structureKey:key,kind:"added",description:newLine.description,changedFields:[]});
      continue;
    }
    if(oldLine&&!newLine){
      changes.push({structureKey:key,kind:"removed",description:oldLine.description,changedFields:[]});
      continue;
    }
    if(!oldLine||!newLine)continue;
    const changedFields=tracked.filter(field=>!same(oldLine[field],newLine[field])).map(String);
    if(changedFields.length){
      changes.push({structureKey:key,kind:"changed",description:newLine.description,changedFields});
    }
  }
  return changes;
}

export function diffCommercialTotals(input:{
  before:{directCost:number;markupAmount:number;salesPrice:number};
  after:{directCost:number;markupAmount:number;salesPrice:number};
}){
  return{
    directCost:input.after.directCost-input.before.directCost,
    markupAmount:input.after.markupAmount-input.before.markupAmount,
    salesPrice:input.after.salesPrice-input.before.salesPrice
  };
}
