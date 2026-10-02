export type CommercialSummary={
  purchase:number;
  sales:number;
  margin:number;
  marginPct:number;
  vat:number;
  vatRate:number|null;
};

export function buildCommercialSummary(input:{purchase:number;sales:number;vatRate:number|null}):CommercialSummary{
  const purchase=Number(input.purchase);
  const sales=Number(input.sales);
  const vatRate=input.vatRate==null?null:Number(input.vatRate);
  if(!Number.isFinite(purchase)||!Number.isFinite(sales)||purchase<0||sales<0)throw new Error("Ongeldige commerciele bedragen.");
  if(vatRate!==null&&(!Number.isFinite(vatRate)||vatRate<0||vatRate>100))throw new Error("Ongeldig btw-tarief.");
  const margin=sales-purchase;
  const marginPct=sales!==0?(margin/sales)*100:0;
  const vat=vatRate==null?0:sales*(vatRate/100);
  return {purchase,sales,margin,marginPct,vat,vatRate};
}
