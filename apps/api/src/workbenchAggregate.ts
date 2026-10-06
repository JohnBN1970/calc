import type { OfficeCalculationContextSnapshot, OfficeWorkspaceState } from "./officeClient.js";
import type { CalcRecipeVersion } from "./calcRecipeRepository.js";
import { buildConceptFromOfficeContext } from "./calculationConcept.js";
import { proposalRulesFromCalcRecipes, proposeRecipesForConcept } from "./recipeProposal.js";
import type { CalcDocumentTriageItem } from "./documentTriage.js";
import { buildCalcStructureProposal } from "./structureProposal.js";
import type { StoredRecipeProposalDecision } from "./recipeProposalDecisionRepository.js";
import type { RecipeProposal } from "./recipeProposal.js";


export function applyRecipeProposalDecisions(input:{
  proposals:RecipeProposal[];
  decisions:StoredRecipeProposalDecision[];
  sourceSelectionVersion:string|null;
}):RecipeProposal[]{
  const current=input.decisions.filter(item=>item.sourceSelectionVersion===input.sourceSelectionVersion);
  const byPosition=new Map<string,StoredRecipeProposalDecision[]>();
  for(const decision of current){
    const rows=byPosition.get(decision.positionRef)??[];
    rows.push(decision);
    byPosition.set(decision.positionRef,rows);
  }
  return input.proposals.filter(proposal=>{
    const decisions=byPosition.get(proposal.positionRef)??[];
    const accepted=new Set(decisions.filter(item=>item.decision==="accepted").map(item=>String(item.recipeVersionId)));
    const rejected=new Set(decisions.filter(item=>item.decision==="rejected").map(item=>String(item.recipeVersionId)));
    if(accepted.size>0)return accepted.has(String(proposal.recipeRef));
    return !rejected.has(String(proposal.recipeRef));
  });
}


export type RecipeSelectionIssue={
  positionRef:string;
  code:"no_match"|"all_rejected"|"multiple_candidates"|"multiple_accepted";
  message:string;
  candidateRecipeRefs:string[];
};

export function explainRecipeSelectionIssues(input:{
  positions:Array<{positionRef:string}>;
  rawProposals:RecipeProposal[];
  effectiveProposals:RecipeProposal[];
  decisions:StoredRecipeProposalDecision[];
  sourceSelectionVersion:string|null;
}):RecipeSelectionIssue[]{
  const current=input.decisions.filter(item=>item.sourceSelectionVersion===input.sourceSelectionVersion);
  const issues:RecipeSelectionIssue[]=[];
  for(const position of input.positions){
    const raw=input.rawProposals.filter(item=>item.positionRef===position.positionRef);
    const effective=input.effectiveProposals.filter(item=>item.positionRef===position.positionRef);
    const accepted=current.filter(item=>item.positionRef===position.positionRef&&item.decision==="accepted");
    const rejected=current.filter(item=>item.positionRef===position.positionRef&&item.decision==="rejected");
    if(accepted.length>1){issues.push({positionRef:position.positionRef,code:"multiple_accepted",message:"Meerdere recepten zijn expliciet geaccepteerd; kies één recept.",candidateRecipeRefs:accepted.map(item=>String(item.recipeVersionId)).sort()});continue;}
    if(raw.length===0){issues.push({positionRef:position.positionRef,code:"no_match",message:"Geen recept sluit voldoende aan op de actuele broninhoud.",candidateRecipeRefs:[]});continue;}
    if(effective.length===0&&rejected.length>0){issues.push({positionRef:position.positionRef,code:"all_rejected",message:"Alle actuele receptvoorstellen zijn afgewezen.",candidateRecipeRefs:raw.map(item=>item.recipeRef).sort()});continue;}
    if(effective.length>1){issues.push({positionRef:position.positionRef,code:"multiple_candidates",message:"Meerdere actuele recepten passen; menselijke keuze nodig.",candidateRecipeRefs:effective.map(item=>item.recipeRef).sort()});continue;}
  }
  return issues;
}

export type CalcScopeCoverageItem={
  scopeType:"building"|"facade"|"dwelling"|"dwelling_type"|"building_part";
  covered:number;
  total:number;
  missingPositionRefs:string[];
};

export function calculateScopeCoverage(positions:Array<{
  positionRef:string;
  scopes:Array<{type:"building"|"facade"|"dwelling"|"dwelling_type"|"building_part";ref:string}>;
}>):CalcScopeCoverageItem[]{
  const types:CalcScopeCoverageItem["scopeType"][]=["building","facade","dwelling","dwelling_type","building_part"];
  return types.map(scopeType=>{
    const present=positions.filter(position=>position.scopes.some(scope=>scope.type===scopeType&&scope.ref.trim()));
    const missing=positions.filter(position=>!position.scopes.some(scope=>scope.type===scopeType&&scope.ref.trim())).map(position=>position.positionRef).sort((a,b)=>a.localeCompare(b,"nl"));
    return{scopeType,covered:present.length,total:positions.length,missingPositionRefs:missing};
  }).filter(item=>item.covered>0);
}

export type CalcAutomationReadiness={
  canAutoSaveConcept:boolean;
  reasons:string[];
};

export function calculateAutomationReadiness(input:{
  concept:{
    unresolved:string[];
    positions:Array<{positionRef:string;reviewStatus:"reviewed"|"proposed";warnings:string[]}>;
  };
  structureProposal:{unresolvedPositionRefs:string[]};
}):CalcAutomationReadiness{
  const reasons:string[]=[];
  if(input.concept.unresolved.length)reasons.push(...input.concept.unresolved.map(item=>"Concept: "+item));
  if(input.structureProposal.unresolvedPositionRefs.length){
    reasons.push("Receptkeuze niet eenduidig voor: "+input.structureProposal.unresolvedPositionRefs.join(", "));
  }
  for(const position of input.concept.positions){
    if(position.reviewStatus!=="reviewed")reasons.push(`Positie ${position.positionRef} wacht nog op menselijke bronreview.`);
    for(const warning of position.warnings)reasons.push(`Positie ${position.positionRef}: ${warning}`);
  }
  return{canAutoSaveConcept:reasons.length===0,reasons:[...new Set(reasons)]};
}

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
  documentTriage: CalcDocumentTriageItem[];
  recipeProposalDecisions?:StoredRecipeProposalDecision[];
}) {
  const documentTriage=input.documentTriage;
  const concept=buildConceptFromOfficeContext(input.context,documentTriage);
  const rawProposals=proposeRecipesForConcept(concept,proposalRulesFromCalcRecipes(input.recipes));
  const proposals=applyRecipeProposalDecisions({
    proposals:rawProposals,
    decisions:input.recipeProposalDecisions??[],
    sourceSelectionVersion:concept.sourceSelectionVersion
  });
  const recipeSelectionIssues=explainRecipeSelectionIssues({
    positions:concept.positions,rawProposals,effectiveProposals:proposals,
    decisions:input.recipeProposalDecisions??[],sourceSelectionVersion:concept.sourceSelectionVersion
  });
  const structureProposal=buildCalcStructureProposal({concept,recipeProposals:proposals});
  const scopeCoverage=calculateScopeCoverage(concept.positions);
  const automationReadiness=calculateAutomationReadiness({concept,structureProposal});
  return {
    contract:"brebo-calc-workbench-aggregate-v1",
    officeVersion:String(input.workspace.version.version),
    editable:input.workspace.editable,
    concept,
    documentTriage,
    takeoffs: input.context.context.takeoff,
    recipeProposals:proposals,
    recipeSelectionIssues,
    structureProposal,
    scopeCoverage,
    automationReadiness,
    structure:input.structure,
    readiness:{
      source:"calc",
      unresolved:concept.unresolved
    }
  };
}
