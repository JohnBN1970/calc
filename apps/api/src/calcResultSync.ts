export type OfficeCalcResultReadModel = {
  snapshot_id: number;
  content_hash: string;
  published_by: number;
  published_at: number;
  calculation_id: number;
  office_version: string;
  calc_version: string;
  current_for_office_version?: boolean;
  lines: unknown[];
  totals: {
    direct_cost: number;
    markup_amount: number;
    sales_price: number;
  };
  source?: Record<string,unknown>;
};

export function verifyOfficeCalcResultSync(input:{
  publishedContentHash:string;
  expectedOfficeVersion:string;
  expectedTotals:{direct_cost:number;markup_amount:number;sales_price:number};
  expectedLineCount:number;
  calcResult:OfficeCalcResultReadModel|null|undefined;
}): void {
  const result=input.calcResult;
  if(!result) throw new Error("Office heeft geen Calc-resultaat teruggegeven.");
  if(result.content_hash!==input.publishedContentHash) throw new Error("Office heeft een andere Calc content_hash teruggegeven.");
  if(result.current_for_office_version!==true) throw new Error("Office bevestigt het Calc-resultaat niet als actuele Office-versie.");
  if(result.office_version!==input.expectedOfficeVersion) throw new Error("Office-versie van het Calc-resultaat wijkt af.");
  if(result.lines.length!==input.expectedLineCount) throw new Error("Aantal Calc-regels in Office wijkt af.");

  const keys=["direct_cost","markup_amount","sales_price"] as const;
  for(const key of keys){
    const actual=Number(result.totals[key]);
    const expected=Number(input.expectedTotals[key]);
    if(!Number.isFinite(actual)||Math.abs(actual-expected)>0.0001){
      throw new Error(`Office totaal ${key} wijkt af van Calc.`);
    }
  }
}
