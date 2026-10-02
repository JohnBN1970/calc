import type { VatRegime } from "./vatSettingsRepository.js";
import type { TailCostEvaluationRow } from "./tailCostEvaluation.js";

export type VatSource={
  vatRegimeId:number|null;
  salesAmount:number;
};

export type AggregatedVat={
  code:string;
  label:string;
  rate:number|null;
  taxableBase:number;
  vatAmount:number;
  reverseCharged:boolean;
};

export function aggregateVat(input:{
  regimes:VatRegime[];
  lineSales:VatSource[];
  tailCosts:TailCostEvaluationRow[];
}):AggregatedVat[]{
  const regimes=new Map(input.regimes.map(regime=>[regime.id,regime]));
  const totals=new Map<number,number>();
  const add=(vatRegimeId:number|null,amount:number)=>{
    if(vatRegimeId==null||!Number.isFinite(amount)||Math.abs(amount)<0.000001)return;
    if(!regimes.has(vatRegimeId))throw new Error("Btw-regime van calculatieregel bestaat niet meer.");
    totals.set(vatRegimeId,(totals.get(vatRegimeId)??0)+amount);
  };
  for(const line of input.lineSales)add(line.vatRegimeId,line.salesAmount);
  for(const tail of input.tailCosts)add(tail.vatRegimeId??null,tail.amount);
  return [...totals.entries()].map(([id,taxableBase])=>{
    const regime=regimes.get(id)!;
    return{
      code:regime.code,
      label:regime.label,
      rate:regime.rate,
      taxableBase,
      vatAmount:regime.treatment==="normal"?taxableBase*((regime.rate??0)/100):0,
      reverseCharged:regime.treatment==="reverse_charge"
    };
  }).sort((a,b)=>a.label.localeCompare(b.label,"nl"));
}
