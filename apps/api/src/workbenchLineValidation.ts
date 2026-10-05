export type LabourCompletenessLine={
  lineType:string;
  labourUnitCost?:number|null;
  labourTotalHours?:number|null;
  code?:string|null;
  description?:string|null;
};

const costLineTypes=new Set(["item","allowance","adjustable"]);

export function findIncompleteLabourLines<T extends LabourCompletenessLine>(lines:T[]):T[]{
  return lines.filter(line=>
    costLineTypes.has(String(line.lineType)) &&
    Number(line.labourUnitCost??0)>0 &&
    line.labourTotalHours==null
  );
}
