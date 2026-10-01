import type { OfficeCalculationContextSnapshot, OfficeWorkspaceState } from "./officeClient.js";
import type { CalcRecipeVersion } from "./calcRecipeRepository.js";
import { buildConceptFromOfficeContext } from "./calculationConcept.js";
import { proposalRulesFromCalcRecipes, proposeRecipesForConcept } from "./recipeProposal.js";

export function buildWorkbenchAggregate(input:{
  context: OfficeCalculationContextSnapshot;
  recipes: CalcRecipeVersion[];
  workspace: OfficeWorkspaceState;
}) {
  const concept=buildConceptFromOfficeContext(input.context);
  const proposals=proposeRecipesForConcept(concept,proposalRulesFromCalcRecipes(input.recipes));
  return {
    contract:"brebo-calc-workbench-aggregate-v1",
    officeVersion:String(input.workspace.version.version),
    editable:input.workspace.editable,
    concept,
    takeoffs: input.context.context.takeoff,
    recipeProposals:proposals,
    structure: Array.isArray((input.workspace as any).structure) ? (input.workspace as any).structure : [],
    readiness:(input.workspace as any).readiness??null
  };
}
