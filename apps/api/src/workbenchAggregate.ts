import type { OfficeCalculationContextSnapshot, OfficeWorkspaceState } from "./officeClient.js";
import type { CalcRecipeVersion } from "./calcRecipeRepository.js";
import { buildConceptFromOfficeContext } from "./calculationConcept.js";
import { proposalRulesFromCalcRecipes, proposeRecipesForConcept } from "./recipeProposal.js";
import { triageCalculationDocuments } from "./documentTriage.js";

export type CalcWorkbenchStructureNode={
  node_key:string;
  parent_key:string|null;
  node_type:"chapter"|"paragraph";
  depth:number;
  code:string|null;
  label:string;
};

export function calcWorkbenchStructureFromLines(lines:Array<{
  id:number;
  parent_id:number|null;
  structure_key:string;
  line_type:string;
  code:string|null;
  description:string;
}>):CalcWorkbenchStructureNode[]{
  const structural=lines.filter(line=>line.line_type==="chapter"||line.line_type==="paragraph");
  const byId=new Map(structural.map(line=>[Number(line.id),line]));
  return structural.map(line=>{
    const parent=line.parent_id==null?null:byId.get(Number(line.parent_id))??null;
    return{
      node_key:line.structure_key,
      parent_key:parent?.structure_key??null,
      node_type:line.line_type as "chapter"|"paragraph",
      depth:line.line_type==="chapter"?0:1,
      code:line.code??null,
      label:line.description
    };
  });
}

export function buildWorkbenchAggregate(input:{
  context: OfficeCalculationContextSnapshot;
  recipes: CalcRecipeVersion[];
  workspace: OfficeWorkspaceState;
  structure: CalcWorkbenchStructureNode[];
}) {
  const concept=buildConceptFromOfficeContext(input.context);
  const proposals=proposeRecipesForConcept(concept,proposalRulesFromCalcRecipes(input.recipes));
  const documentTriage=triageCalculationDocuments(input.context);
  return {
    contract:"brebo-calc-workbench-aggregate-v1",
    officeVersion:String(input.workspace.version.version),
    editable:input.workspace.editable,
    concept,
    documentTriage,
    takeoffs: input.context.context.takeoff,
    recipeProposals:proposals,
    structure:input.structure,
    readiness:{
      source:"calc",
      unresolved:concept.unresolved
    }
  };
}
