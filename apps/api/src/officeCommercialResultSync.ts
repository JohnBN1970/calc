export type CommercialSummary = {
  purchase:number;
  sales:number;
  margin:number;
  margin_pct:number;
  vat:number;
  vat_rate:number|null;
};

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
  }
}
