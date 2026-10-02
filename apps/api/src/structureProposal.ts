import type { CalculationConcept } from "./calculationConcept.js";
import type { RecipeProposal } from "./recipeProposal.js";

export type CalcStructureProposalGroup={
  key:string;
  label:string;
  recipeRef:string|null;
  positionRefs:string[];
  reviewRequired:boolean;
};

export type CalcStructureProposal={
  contract:"brebo-calc-structure-proposal-v1";
  chapter:{key:string;label:string};
  groups:CalcStructureProposalGroup[];
  unresolvedPositionRefs:string[];
  ready:boolean;
};

export function buildCalcStructureProposal(input:{
  concept:CalculationConcept;
  recipeProposals:RecipeProposal[];
}):CalcStructureProposal{
  const proposalsByPosition=new Map<string,RecipeProposal[]>();
  for(const proposal of input.recipeProposals){
    const rows=proposalsByPosition.get(proposal.positionRef)??[];
    rows.push(proposal);
    proposalsByPosition.set(proposal.positionRef,rows);
  }

  const groupsByRecipe=new Map<string,CalcStructureProposalGroup>();
  const unresolved:string[]=[];

  for(const position of input.concept.positions){
    const proposals=proposalsByPosition.get(position.positionRef)??[];
    if(proposals.length!==1){
      unresolved.push(position.positionRef);
      continue;
    }
    const proposal=proposals[0];
    const key="recipe-"+proposal.recipeRef;
    const existing=groupsByRecipe.get(key);
    if(existing){
      existing.positionRefs.push(position.positionRef);
      existing.reviewRequired=existing.reviewRequired||proposal.reviewRequired;
    }else{
      groupsByRecipe.set(key,{
        key,
        label:proposal.label,
        recipeRef:proposal.recipeRef,
        positionRefs:[position.positionRef],
        reviewRequired:proposal.reviewRequired
      });
    }
  }

  const groups=[...groupsByRecipe.values()]
    .map(group=>({...group,positionRefs:[...group.positionRefs].sort((a,b)=>a.localeCompare(b,"nl"))}))
    .sort((a,b)=>a.label.localeCompare(b.label,"nl"));

  if(unresolved.length){
    groups.push({
      key:"unresolved",
      label:"Nog te bepalen",
      recipeRef:null,
      positionRefs:[...unresolved].sort((a,b)=>a.localeCompare(b,"nl")),
      reviewRequired:true
    });
  }

  return{
    contract:"brebo-calc-structure-proposal-v1",
    chapter:{key:"concept",label:"Calculatie"},
    groups,
    unresolvedPositionRefs:[...unresolved].sort((a,b)=>a.localeCompare(b,"nl")),
    ready:groups.length>0
  };
}
