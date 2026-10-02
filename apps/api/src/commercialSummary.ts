export type VatBreakdownItem={
  code:string;
  label:string;
  rate:number|null;
  taxableBase:number;
  vatAmount:number;
  reverseCharged:boolean;
};

export type CommercialSummary={
  purchase:number;
  sales:number;
  margin:number;
  marginPct:number;
  vat:number;
  vatRate:number|null;
  vatBreakdown:VatBreakdownItem[];
};

function normalizedVatBreakdown(input:{
  sales:number;
  vatRate:number|null;
  vatBreakdown?:VatBreakdownItem[];
}):VatBreakdownItem[]{
  if(input.vatBreakdown&&input.vatBreakdown.length){
    const items=input.vatBreakdown.map((item,index)=>{
      const code=String(item.code??"").trim();
      const label=String(item.label??"").trim();
      const rate=item.rate==null?null:Number(item.rate);
      const taxableBase=Number(item.taxableBase);
      const reverseCharged=Boolean(item.reverseCharged);
      const vatAmount=Number(item.vatAmount);
      if(!code||!label) throw new Error(`Btw-regime ${index+1} mist code of omschrijving.`);
      if(rate!==null&&(!Number.isFinite(rate)||rate<0||rate>100)) throw new Error(`Ongeldig btw-tarief voor ${label}.`);
      if(!Number.isFinite(taxableBase)||taxableBase<0) throw new Error(`Ongeldige btw-grondslag voor ${label}.`);
      if(!Number.isFinite(vatAmount)||vatAmount<0) throw new Error(`Ongeldig btw-bedrag voor ${label}.`);
      const expected=reverseCharged?0:taxableBase*((rate??0)/100);
      if(Math.abs(vatAmount-expected)>0.01) throw new Error(`Btw-bedrag voor ${label} sluit niet aan op grondslag en tarief.`);
      return{code,label,rate,taxableBase,vatAmount,reverseCharged};
    });
    const baseTotal=items.reduce((sum,item)=>sum+item.taxableBase,0);
    if(Math.abs(baseTotal-input.sales)>0.01) throw new Error("Som van btw-grondslagen sluit niet aan op de verkoopprijs.");
    return items;
  }
  if(input.vatRate==null) return [];
  return [{
    code:`rate_${String(input.vatRate).replace(".","_")}`,
    label:`${input.vatRate}% btw`,
    rate:input.vatRate,
    taxableBase:input.sales,
    vatAmount:input.sales*(input.vatRate/100),
    reverseCharged:false
  }];
}

export function buildCommercialSummary(input:{
  purchase:number;
  sales:number;
  vatRate:number|null;
  vatBreakdown?:VatBreakdownItem[];
}):CommercialSummary{
  const purchase=Number(input.purchase);
  const sales=Number(input.sales);
  const vatRate=input.vatRate==null?null:Number(input.vatRate);
  if(!Number.isFinite(purchase)||!Number.isFinite(sales)||purchase<0||sales<0)throw new Error("Ongeldige commerciele bedragen.");
  if(vatRate!==null&&(!Number.isFinite(vatRate)||vatRate<0||vatRate>100))throw new Error("Ongeldig btw-tarief.");
  const margin=sales-purchase;
  const marginPct=sales!==0?(margin/sales)*100:0;
  const vatBreakdown=normalizedVatBreakdown({sales,vatRate,vatBreakdown:input.vatBreakdown});
  const vat=vatBreakdown.reduce((sum,item)=>sum+item.vatAmount,0);
  const effectiveVatRate=vatBreakdown.length===1&&!vatBreakdown[0].reverseCharged?vatBreakdown[0].rate:null;
  return {purchase,sales,margin,marginPct,vat,vatRate:effectiveVatRate,vatBreakdown};
}
