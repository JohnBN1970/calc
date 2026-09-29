import { calculateAssemblyTakeoff, type AssemblyJoint, type AssemblyPart, type GeometryInput } from "./takeoff.js";
import { generateCalculationLines, type RecipeCalculationLineDefinition } from "./generatedCalculationLines.js";
import { calculateMaterialCostPipeline, type MaterialCostPipelineResult } from "./materialCostPipeline.js";
import type { MaterialConsumptionRule } from "./materialConsumption.js";
import type { PackagePrice } from "./materialCosting.js";
import { attachMaterialCosts } from "./costedCalculationLines.js";
import { attachLabourCosts, type LabourNorm, type LabourRate } from "./labourCostPipeline.js";
import { attachDirectCostComponents, type DirectCostComponent } from "./directCostComponents.js";
import { buildCalculationStructure, type CalculationStructureNode, type StructuredCalculationLine } from "./calculationStructure.js";
import { buildSalesPrice, type SalesPriceComponent, type SalesPriceBuildUp } from "./salesPriceBuildUp.js";
import { createCalculationVersionSnapshotV2 } from "./calculationVersionSnapshotV2.js";
import { establishCalculation, type EstablishedCalculation } from "./calculationEstablishmentGate.js";

export type CalculationPipelinePosition = {
  positionRef: string;
  structureRef: string;
  outer: GeometryInput;
  parts?: AssemblyPart[];
  joints?: AssemblyJoint[];
  recipeLines: RecipeCalculationLineDefinition[];
};

export type MaterialPlan = {
  positionRef: string;
  recipeRef: string;
  recipeLineRef: string;
  consumptionRule: MaterialConsumptionRule;
  packagePrice: PackagePrice;
};

export type CalculationPipelineInput = {
  calculationId: string;
  versionNo: number;
  establishedAt: string;
  positions: CalculationPipelinePosition[];
  materialPlans: MaterialPlan[];
  labourNorms: LabourNorm[];
  labourRates: LabourRate[];
  directCostComponents: DirectCostComponent[];
  structure: CalculationStructureNode[];
  salesPriceComponents: SalesPriceComponent[];
};

export type CalculationPipelineResult = {
  materialCosts: MaterialCostPipelineResult[];
  structuredLines: StructuredCalculationLine[];
  pricing: SalesPriceBuildUp;
  established: EstablishedCalculation;
};

function identity(recipeRef:string, recipeLineRef:string, positionRef:string):string {
  return `${recipeRef}\u0000${recipeLineRef}\u0000${positionRef}`;
}

export function runCalculationPipeline(input:CalculationPipelineInput):CalculationPipelineResult {
  if(!input.positions.length) throw new Error("Calculation pipeline requires at least one position.");

  const structureRefs=new Set(input.structure.map(node=>node.ref));
  const generated=[];
  const structureByPosition=new Map<string,string>();

  for(const position of input.positions){
    if(!position.positionRef.trim()||!position.structureRef.trim()) throw new Error("Position identity is incomplete.");
    if(structureByPosition.has(position.positionRef)) throw new Error(`Duplicate positionRef ${position.positionRef}.`);
    if(!structureRefs.has(position.structureRef)) throw new Error(`Unknown structureRef ${position.structureRef} for position ${position.positionRef}.`);
    structureByPosition.set(position.positionRef,position.structureRef);

    const takeoff=calculateAssemblyTakeoff(position.outer,position.parts??[],position.joints??[]);
    generated.push(...generateCalculationLines(position.positionRef,takeoff,position.recipeLines));
  }

  const lineByIdentity=new Map(generated.map(line=>[identity(line.recipeRef,line.recipeLineRef,line.positionRef),line]));
  if(lineByIdentity.size!==generated.length) throw new Error("Generated calculation lines are not uniquely identifiable per position.");

  const planKeys=new Set<string>();
  const materialCosts=input.materialPlans.flatMap(plan=>{
    const key=identity(plan.recipeRef,plan.recipeLineRef,plan.positionRef);
    if(planKeys.has(key)) throw new Error(`Duplicate material plan for ${plan.recipeRef}/${plan.recipeLineRef} at position ${plan.positionRef}.`);
    planKeys.add(key);
    const line=lineByIdentity.get(key);
    if(!line) throw new Error(`Material plan has no generated calculation line for ${plan.recipeRef}/${plan.recipeLineRef} at position ${plan.positionRef}.`);
    if(line.quantity===0) return [];
    return [calculateMaterialCostPipeline({
      recipeRef:line.recipeRef,
      recipeLineRef:line.recipeLineRef,
      positionRef:line.positionRef,
      description:line.description,
      grossRecipeQuantity:line.quantity,
      recipeUnit:line.unit,
      consumptionRule:plan.consumptionRule,
      packagePrice:plan.packagePrice
    })];
  });

  for(const line of generated){
    const key=identity(line.recipeRef,line.recipeLineRef,line.positionRef);
    if(!planKeys.has(key)) throw new Error(`Missing material plan for ${line.recipeRef}/${line.recipeLineRef} at position ${line.positionRef}.`);
  }

  const zeroDemand=generated.filter(line=>line.quantity===0).map(line=>({
    recipeRef:line.recipeRef,recipeLineRef:line.recipeLineRef,positionRef:line.positionRef,
    description:line.description,grossRecipeQuantity:0,recipeUnit:line.unit,physicalConsumption:0,
    contentUnit:line.unit,purchasedQuantity:0,packageCount:0,orderUnitCount:0,packagingRemainder:0,
    totalMaterialCost:0,effectiveCostPerRecipeUnit:0
  }));
  materialCosts.push(...zeroDemand);

  const generatedKeys=new Set(lineByIdentity.keys());
  for(const component of input.directCostComponents){
    const key=identity(component.recipeRef,component.recipeLineRef,component.positionRef);
    if(!generatedKeys.has(key)) throw new Error(`Direct cost component has no generated calculation line for ${component.recipeRef}/${component.recipeLineRef} at position ${component.positionRef}.`);
  }

  const materialCosted=attachMaterialCosts(generated,materialCosts);
  const labourCosted=attachLabourCosts(materialCosted,input.labourNorms,input.labourRates);
  const fullyCosted=attachDirectCostComponents(labourCosted,input.directCostComponents);

  const structuredLines:StructuredCalculationLine[]=fullyCosted.map(line=>{
    const structureRef=structureByPosition.get(line.positionRef);
    if(!structureRef) throw new Error(`Missing structure assignment for position ${line.positionRef}.`);
    return {structureRef,line};
  });

  const tree=buildCalculationStructure(input.structure,structuredLines);
  const reachedNodes=new Set<string>();
  const visit=(nodes:typeof tree):void=>{for(const item of nodes){reachedNodes.add(item.node.ref);visit(item.children);}};
  visit(tree);
  if(reachedNodes.size!==input.structure.length){
    const omitted=input.structure.filter(node=>!reachedNodes.has(node.ref)).map(node=>node.ref);
    throw new Error(`Calculation structure contains unreachable or cyclic nodes: ${omitted.join(", ")}.`);
  }
  const reachedLineCount=tree.reduce((sum,node)=>sum+node.totals.lineCount,0);
  if(reachedLineCount!==structuredLines.length) throw new Error("Not every calculation line was included in the structure roll-up.");
  const directCost=tree.reduce((sum,node)=>sum+node.totals.totalDirectCost,0);
  const pricing=buildSalesPrice(directCost,input.salesPriceComponents);

  const snapshot=createCalculationVersionSnapshotV2({
    calculationId:input.calculationId,
    versionNo:input.versionNo,
    establishedAt:input.establishedAt,
    structure:input.structure,
    structuredLines,
    pricing
  });

  return {
    materialCosts,
    structuredLines,
    pricing,
    established:establishCalculation(snapshot)
  };
}
