export type SourceDecisionStatus="consistent"|"superseded"|"conflict"|"different_measurement_kind";

export type SourceDecision={
  positionRef:string;
  factType:string;
  measurementKind:string|null;
  status:SourceDecisionStatus;
  leadingDocumentId:number|null;
  involvedDocumentIds:number[];
  reason:string;
};

export function sourceDecisionReason(input:{
  positionRef:string;
  factType:string;
  measurementKind?:string|null;
  values:Array<{documentId:number;value:string}>;
  supersededBy?:Map<number,number|null>;
}):SourceDecision{
  const ids=[...new Set(input.values.map(value=>value.documentId))];
  const distinctValues=[...new Set(input.values.map(value=>value.value))];
  const supersededBy=input.supersededBy??new Map<number,number|null>();
  const activeIds=ids.filter(id=>!supersededBy.get(id));
  const leader=activeIds.length===1?activeIds[0]:null;

  if(distinctValues.length<=1){
    return{positionRef:input.positionRef,factType:input.factType,measurementKind:input.measurementKind??null,status:"consistent",leadingDocumentId:leader,involvedDocumentIds:ids,reason:"Bronnen geven dezelfde waarde."};
  }
  if(leader!==null&&ids.some(id=>supersededBy.get(id)===leader)){
    return{positionRef:input.positionRef,factType:input.factType,measurementKind:input.measurementKind??null,status:"superseded",leadingDocumentId:leader,involvedDocumentIds:ids,reason:"Afwijkende waarde komt uit een aantoonbaar vervangen revisie; actuele bron is leidend."};
  }
  return{positionRef:input.positionRef,factType:input.factType,measurementKind:input.measurementKind??null,status:"conflict",leadingDocumentId:null,involvedDocumentIds:ids,reason:"Actuele bronnen geven verschillende waarden; menselijke review vereist."};
}

export function differentMeasurementKindDecision(input:{positionRef:string;factType:string;kinds:string[];documentIds:number[]}):SourceDecision{
  return{positionRef:input.positionRef,factType:input.factType,measurementKind:null,status:"different_measurement_kind",leadingDocumentId:null,involvedDocumentIds:[...new Set(input.documentIds)],reason:"Waarden horen bij verschillende maatsoorten ("+[...new Set(input.kinds)].join(", ")+") en mogen niet als onderling conflict of als één maat worden samengevoegd."};
}
