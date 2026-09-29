import type { FullyCostedGeneratedCalculationLine } from "./directCostComponents.js";

export type CalculationStructureLevel="subcalculation"|"chapter"|"paragraph";

export type CalculationStructureNode={
  ref:string;
  level:CalculationStructureLevel;
  description:string;
  parentRef:string|null;
  sortOrder:number;
};

export type StructuredCalculationLine={
  structureRef:string;
  line:FullyCostedGeneratedCalculationLine;
};

export type CostRollup={
  lineCount:number;
  totalMaterialCost:number;
  totalLabourHours:number;
  totalLabourCost:number;
  totalEquipmentCost:number;
  totalSubcontractCost:number;
  totalOtherDirectCost:number;
  totalDirectCost:number;
};

export type CalculationStructureResult={
  node:CalculationStructureNode;
  totals:CostRollup;
  children:CalculationStructureResult[];
};

const emptyTotals=():CostRollup=>({lineCount:0,totalMaterialCost:0,totalLabourHours:0,totalLabourCost:0,totalEquipmentCost:0,totalSubcontractCost:0,totalOtherDirectCost:0,totalDirectCost:0});

function addLine(t:CostRollup,l:FullyCostedGeneratedCalculationLine):void{
  t.lineCount+=1;t.totalMaterialCost+=l.materialCost.totalMaterialCost;t.totalLabourHours+=l.labourCost.totalHours;t.totalLabourCost+=l.labourCost.totalLabourCost;t.totalEquipmentCost+=l.directCost.equipmentCost;t.totalSubcontractCost+=l.directCost.subcontractCost;t.totalOtherDirectCost+=l.directCost.otherDirectCost;t.totalDirectCost+=l.directCost.totalDirectCost;
}
function addTotals(a:CostRollup,b:CostRollup):void{a.lineCount+=b.lineCount;a.totalMaterialCost+=b.totalMaterialCost;a.totalLabourHours+=b.totalLabourHours;a.totalLabourCost+=b.totalLabourCost;a.totalEquipmentCost+=b.totalEquipmentCost;a.totalSubcontractCost+=b.totalSubcontractCost;a.totalOtherDirectCost+=b.totalOtherDirectCost;a.totalDirectCost+=b.totalDirectCost;}

export function buildCalculationStructure(nodes:CalculationStructureNode[],lines:StructuredCalculationLine[]):CalculationStructureResult[]{
  const byRef=new Map<string,CalculationStructureNode>();
  for(const n of nodes){if(!n.ref.trim()||!n.description.trim())throw new Error("Calculation structure node is incomplete.");if(byRef.has(n.ref))throw new Error(`Duplicate calculation structure ref ${n.ref}.`);byRef.set(n.ref,n);}
  for(const n of nodes){if(n.parentRef&&!byRef.has(n.parentRef))throw new Error(`Missing parent structure ${n.parentRef}.`);}
  for(const l of lines){if(!byRef.has(l.structureRef))throw new Error(`Missing calculation structure ${l.structureRef} for calculation line.`);}

  const children=new Map<string|null,CalculationStructureNode[]>();
  for(const n of nodes){children.set(n.parentRef,[...(children.get(n.parentRef)??[]),n]);}
  for(const list of children.values())list.sort((a,b)=>a.sortOrder-b.sortOrder||a.ref.localeCompare(b.ref));
  const linesByNode=new Map<string,FullyCostedGeneratedCalculationLine[]>();
  for(const l of lines)linesByNode.set(l.structureRef,[...(linesByNode.get(l.structureRef)??[]),l.line]);

  const visiting=new Set<string>();
  const build=(node:CalculationStructureNode):CalculationStructureResult=>{
    if(visiting.has(node.ref))throw new Error(`Calculation structure cycle detected at ${node.ref}.`);
    visiting.add(node.ref);
    const totals=emptyTotals();
    for(const line of linesByNode.get(node.ref)??[])addLine(totals,line);
    const nested=(children.get(node.ref)??[]).map(build);
    for(const child of nested)addTotals(totals,child.totals);
    visiting.delete(node.ref);
    return{node,totals,children:nested};
  };
  return(children.get(null)??[]).map(build);
}
