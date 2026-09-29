export type ArticlePriceCandidate={
  articleRef:string;
  supplierRef?:string|null;
  packageDescription:string;
  contentPerPackage:number;
  contentUnit:string;
  packagePrice:number;
  packagesPerOrderUnit?:number;
  validFrom?:string|null;
  validTo?:string|null;
  sourceRef?:string|null;
};

export type SelectedArticlePrice=ArticlePriceCandidate&{selectedForDate:string};

function dateOnly(value:string,name:string):string{
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if(!match)throw new Error(`${name} must be YYYY-MM-DD.`);
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const parsed=new Date(Date.UTC(year,month-1,day));
  if(
    parsed.getUTCFullYear()!==year||
    parsed.getUTCMonth()!==month-1||
    parsed.getUTCDate()!==day
  )throw new Error(`${name} must be a valid calendar date.`);
  return value;
}
function positive(v:number,n:string){if(!Number.isFinite(v)||v<=0)throw new Error(`${n} must be positive.`);return v}

export function selectArticlePrice(candidates:ArticlePriceCandidate[],calculationDate:string):SelectedArticlePrice{
 const date=dateOnly(calculationDate,"calculationDate");
 const eligible=candidates.filter(c=>{
   if(!c.articleRef.trim()||!c.contentUnit.trim())return false;
   positive(c.contentPerPackage,"contentPerPackage");positive(c.packagePrice,"packagePrice");
   if(c.validFrom&&dateOnly(c.validFrom,"validFrom")>date)return false;
   if(c.validTo&&dateOnly(c.validTo,"validTo")<date)return false;
   return true;
 });
 if(!eligible.length)throw new Error("No valid article price is available for the calculation date.");
 eligible.sort((a,b)=>{
   const af=a.validFrom??"0000-00-00",bf=b.validFrom??"0000-00-00";
   if(af!==bf)return bf.localeCompare(af);
   if(a.articleRef!==b.articleRef)return a.articleRef.localeCompare(b.articleRef);
   return (a.supplierRef??"").localeCompare(b.supplierRef??"");
 });
 const top=eligible[0],samePriority=eligible.filter(c=>(c.validFrom??"0000-00-00")===(top.validFrom??"0000-00-00"));
 if(samePriority.length>1)throw new Error("Multiple equally current article prices are valid; explicit article/supplier selection is required.");
 return{...top,selectedForDate:date};
}
