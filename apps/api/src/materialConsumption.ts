function positive(value:number,name:string){if(!Number.isFinite(value)||value<=0)throw new Error(`${name} must be positive.`);return value}

export type PaintConsumptionInput={areaM2:number;coats:number;coverageM2PerLiter:number};
export type LinearRollConsumptionInput={lengthM:number};
export type SheetConsumptionInput={areaM2:number;sheetWidthMm:number;sheetHeightMm:number};
export type PieceConsumptionInput={quantity:number};

export function paintLiters(input:PaintConsumptionInput):number{
  return positive(input.areaM2,"areaM2")*positive(input.coats,"coats")/positive(input.coverageM2PerLiter,"coverageM2PerLiter");
}
export function linearRollMeters(input:LinearRollConsumptionInput):number{
  return positive(input.lengthM,"lengthM");
}
export function sheetCountByArea(input:SheetConsumptionInput):number{
  const sheetArea=(positive(input.sheetWidthMm,"sheetWidthMm")/1000)*(positive(input.sheetHeightMm,"sheetHeightMm")/1000);
  return input.areaM2<=0?0:Math.ceil(input.areaM2/sheetArea);
}
export function pieceCount(input:PieceConsumptionInput):number{
  const q=positive(input.quantity,"quantity");
  return Math.ceil(q);
}

export type MaterialConsumptionKind="direct"|"paint_liter"|"linear_roll"|"sheet_by_area"|"piece";

export type MaterialConsumptionRule={
  kind:MaterialConsumptionKind;
  coats?:number;
  coverageM2PerLiter?:number;
  sheetWidthMm?:number;
  sheetHeightMm?:number;
};

export function convertMaterialConsumption(requiredQuantity:number,rule:MaterialConsumptionRule):number{
  positive(requiredQuantity,"requiredQuantity");
  switch(rule.kind){
    case "direct": return requiredQuantity;
    case "paint_liter": return paintLiters({areaM2:requiredQuantity,coats:rule.coats??1,coverageM2PerLiter:positive(rule.coverageM2PerLiter??0,"coverageM2PerLiter")});
    case "linear_roll": return linearRollMeters({lengthM:requiredQuantity});
    case "sheet_by_area": return sheetCountByArea({areaM2:requiredQuantity,sheetWidthMm:positive(rule.sheetWidthMm??0,"sheetWidthMm"),sheetHeightMm:positive(rule.sheetHeightMm??0,"sheetHeightMm")});
    case "piece": return pieceCount({quantity:requiredQuantity});
  }
}
