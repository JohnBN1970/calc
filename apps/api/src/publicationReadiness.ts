export type PublicationReadinessInput={
  versionStatus:string;
  costLineCount:number;
  directCost:number;
  storedDirectCost:number;
  markupAmount:number;
  storedMarkupAmount:number;
  salesPrice:number;
  storedSalesPrice:number;
  vatTaxableBase:number;
};

export type PublicationReadiness={
  canPublish:boolean;
  reasons:string[];
};

const close=(a:number,b:number)=>Math.abs(a-b)<=0.01;

export function calculatePublicationReadiness(input:PublicationReadinessInput):PublicationReadiness{
  const reasons:string[]=[];
  if(input.versionStatus!=="draft")reasons.push("Alleen een conceptversie kan worden gepubliceerd.");
  if(!Number.isInteger(input.costLineCount)||input.costLineCount<=0)reasons.push("De calculatie bevat nog geen verkoopregels.");
  const calculationChanged=[
    [input.directCost,input.storedDirectCost],
    [input.markupAmount,input.storedMarkupAmount],
    [input.salesPrice,input.storedSalesPrice]
  ].some(([actual,stored])=>!Number.isFinite(actual)||!Number.isFinite(stored)||!close(actual,stored));
  if(calculationChanged){
    reasons.push("Er zijn wijzigingen in de calculatie die nog niet zijn opgeslagen. Sla de calculatie eerst op; daarna controleert Calc opnieuw of deze publiceerbaar is.");
  }
  if(!Number.isFinite(input.vatTaxableBase)||!Number.isFinite(input.salesPrice)||!close(input.vatTaxableBase,input.salesPrice)){
    reasons.push("BTW-regime ontbreekt op een of meer verkoopregels of staartkostenregels.");
  }
  return{canPublish:reasons.length===0,reasons:[...new Set(reasons)]};
}
