export type SourceContextBinding={
  officeVersion:string;
  selectionVersion:string|null;
};

export type DerivedSourceContextBinding={
  sourceLineCount:number;
  status:"not_required"|"bound"|"unbound"|"mixed";
  binding:SourceContextBinding|null;
};

export function deriveSourceContextBinding(lines:Array<{
  priceSourceType?:string|null;
  sourceDetails?:string|null;
}>):DerivedSourceContextBinding{
  const sourceLines=lines.filter(line=>line.priceSourceType==="recipe");
  if(!sourceLines.length)return{sourceLineCount:0,status:"not_required",binding:null};

  const bindings:SourceContextBinding[]=[];
  let missing=0;
  for(const line of sourceLines){
    try{
      const details=line.sourceDetails?JSON.parse(line.sourceDetails):null;
      const officeVersion=String(details?.context_binding?.officeVersion??"").trim();
      const selectionRaw=details?.context_binding?.selectionVersion;
      const selectionVersion=selectionRaw==null||String(selectionRaw).trim()===""?null:String(selectionRaw).trim();
      if(!officeVersion){missing++;continue;}
      bindings.push({officeVersion,selectionVersion});
    }catch{missing++;}
  }
  if(missing||!bindings.length)return{sourceLineCount:sourceLines.length,status:"unbound",binding:null};
  const keys=new Set(bindings.map(item=>item.officeVersion+"\u0000"+(item.selectionVersion??"")));
  if(keys.size!==1)return{sourceLineCount:sourceLines.length,status:"mixed",binding:null};
  return{sourceLineCount:sourceLines.length,status:"bound",binding:bindings[0]};
}

export function sourceContextIsCurrent(input:{
  binding:SourceContextBinding|null;
  officeVersion:string;
  selectionVersion:string|null;
}):boolean{
  if(!input.binding)return false;
  return input.binding.officeVersion===input.officeVersion&&
    (input.binding.selectionVersion??null)===(input.selectionVersion??null);
}


export type GeneratedRecipeIdentity={
  positionRef:string;
  recipeVersionId:number;
  officeVersion:string|null;
  selectionVersion:string|null;
};

export function generatedRecipeIdentity(sourceDetails:string|null|undefined):GeneratedRecipeIdentity|null{
  try{
    const details=sourceDetails?JSON.parse(sourceDetails):null;
    const positionRef=String(details?.position_ref??"").trim();
    const recipeVersionId=Number(details?.recipe?.version_id??0);
    if(!positionRef||!Number.isInteger(recipeVersionId)||recipeVersionId<=0)return null;
    const officeRaw=details?.context_binding?.officeVersion;
    const selectionRaw=details?.context_binding?.selectionVersion;
    return{
      positionRef,
      recipeVersionId,
      officeVersion:officeRaw==null||String(officeRaw).trim()===""?null:String(officeRaw).trim(),
      selectionVersion:selectionRaw==null||String(selectionRaw).trim()===""?null:String(selectionRaw).trim()
    };
  }catch{return null;}
}

export function generatedRecipeIdentityIsCurrent(input:{
  identity:GeneratedRecipeIdentity|null;
  positionRef:string;
  recipeVersionId:number;
  officeVersion:string;
  selectionVersion:string|null;
}):boolean{
  const identity=input.identity;
  return Boolean(identity&&
    identity.positionRef===input.positionRef&&
    identity.recipeVersionId===input.recipeVersionId&&
    identity.officeVersion===input.officeVersion&&
    (identity.selectionVersion??null)===(input.selectionVersion??null)
  );
}
