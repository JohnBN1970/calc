import type { OfficeCalculationContextSnapshot, OfficeRecipeCatalog, OfficeWorkspaceState } from "./officeClient.js";
import { buildConceptFromOfficeContext } from "./calculationConcept.js";
import { proposalRulesFromOfficeCatalog, proposeRecipesForConcept } from "./recipeProposal.js";
import { officeAuthoritativeRecipeLines } from "./officeRecipeLines.js";
import { buildOfficeCostRollup } from "./officeCostRollup.js";

export function buildWorkbenchAggregate(input:{
  context: OfficeCalculationContextSnapshot;
  catalog: OfficeRecipeCatalog;
  workspace: OfficeWorkspaceState;
}) {
  const concept=buildConceptFromOfficeContext(input.context);
  const proposals=proposeRecipesForConcept(concept,proposalRulesFromOfficeCatalog(input.catalog));
  const generatedLines=officeAuthoritativeRecipeLines(input.workspace);
  const costRollup=buildOfficeCostRollup(input.workspace);
  return {
    contract:"brebo-calc-workbench-aggregate-v1",
    officeVersion:String(input.workspace.version.version),
    catalogVersion:input.catalog.catalog.catalog_version,
    editable:input.workspace.editable,
    concept,
    takeoffs: input.context.context.takeoff,
    components: input.context.context.components,
    recipeProposals:proposals,
    structure: Array.isArray((input.workspace as any).structure) ? (input.workspace as any).structure : [],
    placedRecipes:input.workspace.recipes??[],
    generatedLines,
    costRollup,
    salesPriceResult:input.workspace.result??null,
    readiness:(input.workspace as any).readiness??null
  };
}
