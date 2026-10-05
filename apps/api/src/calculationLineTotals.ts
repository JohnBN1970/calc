export type CalculationLineType="chapter"|"paragraph"|"item"|"allowance"|"adjustable"|"option"|"note";

const NON_TOTAL_LINE_TYPES=new Set<CalculationLineType>(["chapter","paragraph","note","option"]);

export function lineContributesToCalculationTotals(lineType:string):boolean{
  return !NON_TOTAL_LINE_TYPES.has(lineType as CalculationLineType);
}
