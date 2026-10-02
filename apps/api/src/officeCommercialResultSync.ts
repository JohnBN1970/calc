export type CommercialSummary = {
  purchase:number;
  sales:number;
  margin:number;
  margin_pct:number;
  vat:number;
  vat_rate:number|null;
  vat_breakdown:Array<{
    code:string;
    label:string;
    rate:number|null;
    taxable_base:number;
    vat_amount:number;
    reverse_charged:boolean;
  }>;
};

function verifyBreakdown(actual:CommercialSummary["vat_breakdown"],expected:CommercialSummary["vat_breakdown"],tolerance:number):void{
  if(!Array.isArray(actual)) throw new Error("Office bevestigde geen btw-specificatie.");
  if(actual.length!==expected.length) throw new Error("Office bevestigde een afwijkend aantal btw-regimes.");
  const byCode=new Map(actual.map(item=>[item.code,item]));
  for(const expectedItem of expected){
    const actualItem=byCode.get(expectedItem.code);
    if(!actualItem) throw new Error(`Office mist btw-regime ${expectedItem.code}.`);
    if(Boolean(actualItem.reverse_charged)!==Boolean(expectedItem.reverse_charged)) throw new Error(`Office bevestigde een afwijkende btw-behandeling voor ${expectedItem.code}.`);
    const numericChecks:[number|null,number|null,string][]=[
      [actualItem.rate,expectedItem.rate,"tarief"],
      [actualItem.taxable_base,expectedItem.taxable_base,"grondslag"],
      [actualItem.vat_amount,expectedItem.vat_amount,"btw-bedrag"]
    ];
    for(const [receivedRaw,wantedRaw,label] of numericChecks){
      if(receivedRaw===null||wantedRaw===null){
        if(receivedRaw!==wantedRaw) throw new Error(`Office bevestigde een afwijkend ${label} voor ${expectedItem.code}.`);
        continue;
      }
      const received=Number(receivedRaw);
      const wanted=Number(wantedRaw);
      if(!Number.isFinite(received)||Math.abs(received-wanted)>tolerance) throw new Error(`Office bevestigde een afwijkend ${label} voor ${expectedItem.code}.`);
    }
  }
}

export function verifyOfficeCommercialSummary(
  actual: CommercialSummary | null | undefined,
  expected: CommercialSummary,
  tolerance = 0.005
): void {
  if (!actual) throw new Error("Office bevestigde geen commerciele Calc-samenvatting.");
  const checks:[number,number,string][] = [
    [Number(actual.purchase), expected.purchase, "inkoop"],
    [Number(actual.sales), expected.sales, "verkoop"],
    [Number(actual.margin), expected.margin, "marge"],
    [Number(actual.margin_pct), expected.margin_pct, "margepercentage"],
    [Number(actual.vat), expected.vat, "btw"]
  ];
  for (const [received, wanted, label] of checks) {
    if (!Number.isFinite(received) || Math.abs(received - wanted) > tolerance) {
      throw new Error(`Office bevestigde een afwijkende ${label}.`);
    }
  }
  if (expected.vat_rate !== null && actual.vat_rate !== null) {
    const actualRate=Number(actual.vat_rate);
    if (!Number.isFinite(actualRate) || Math.abs(actualRate-expected.vat_rate)>tolerance) {
      throw new Error("Office bevestigde een afwijkend btw-tarief.");
    }
  } else if(actual.vat_rate!==expected.vat_rate) {
    throw new Error("Office bevestigde een afwijkend enkelvoudig btw-tarief.");
  }
  verifyBreakdown(actual.vat_breakdown,expected.vat_breakdown,tolerance);
}
