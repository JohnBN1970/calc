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
  const pairs:Array<[number,number,string]>=[
    [input.directCost,input.storedDirectCost,"De directe kost wijkt af van de laatst opgeslagen Calc-doorrekening."],
    [input.markupAmount,input.storedMarkupAmount,"De staartkosten wijken af van de laatst opgeslagen Calc-doorrekening."],
    [input.salesPrice,input.storedSalesPrice,"De verkoopprijs wijkt af van de laatst opgeslagen Calc-doorrekening."]
  ];
  for(const [actual,stored,message] of pairs){
    if(!Number.isFinite(actual)||!Number.isFinite(stored)||!close(actual,stored))reasons.push(message);
  }
  if(!Number.isFinite(input.vatTaxableBase)||!Number.isFinite(input.salesPrice)||!close(input.vatTaxableBase,input.salesPrice)){
    reasons.push("BTW-regime ontbreekt op een of meer verkoopregels of staartkostenregels.");
  }
  return{canPublish:reasons.length===0,reasons:[...new Set(reasons)]};
}
