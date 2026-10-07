import type { CalcRecipeVersion } from "./calcRecipeRepository.js";
import type { OfficeCalcSourceResolution } from "./officeClient.js";
import type { EvaluatedTakeoffComponent } from "./componentTakeoff.js";
import { calculateAssemblyTakeoff } from "./takeoff.js";
import { calculateRecipeQuantityDetails } from "./recipeTakeoff.js";

export type CalcOwnedGeneratedLine = {
  code:string;
  description:string;
  unit:string;
  quantity:number;
  labourNorm:number|null;
  labourTotalHours:number|null;
  labourHoursInputMode:"norm"|"total_hours"|null;
  labour:number;
  material:number;
  equipment:number;
  subcontracting:number;
  other:number;
  priceSourceType:"recipe";
  officeSourceId:string|null;
  sourceReference:string;
  sourceUnitPrice:number|null;
  sourceDetails:string;
  resolutionStatus:"resolved"|"unresolved";
  resolutionReason:string|null;
};

export function calcRecipeSourceRequests(recipe:CalcRecipeVersion):Array<{type:string;ref:string;context?:Record<string,unknown>}> {
  const requests:Array<{type:string;ref:string;context?:Record<string,unknown>}>=[];
  for(const line of recipe.lines){
    if(line.quantitySourceType&&line.quantitySourceRef){
      requests.push({type:line.quantitySourceType,ref:line.quantitySourceRef,context:line.metadata??undefined});
    }
    if(line.costSourceType&&line.costSourceRef){
      requests.push({type:line.costSourceType,ref:line.costSourceRef,context:line.metadata??undefined});
    }
  }
  return requests;
}

function resolvedMap(resolution:OfficeCalcSourceResolution):Map<string,OfficeCalcSourceResolution["results"][number]> {
  const map=new Map<string,OfficeCalcSourceResolution["results"][number]>();
  for(const row of resolution.results) map.set(`${row.type}\u0000${row.ref}`,row);
  return map;
}

function selectedComponents(line:CalcRecipeVersion["lines"][number],components:EvaluatedTakeoffComponent[]):EvaluatedTakeoffComponent[]{
  const kind=String(line.metadata?.componentKind??"").trim().toLocaleLowerCase("nl-NL");
  const ref=String(line.metadata?.componentRef??"").trim();
  if(!kind&&!ref)return[];
  return components.filter(component=>
    (!kind||component.component_kind===kind)&&
    (!ref||component.component_ref===ref)
  );
}

function componentBasisQuantity(
  line:CalcRecipeVersion["lines"][number],
  components:EvaluatedTakeoffComponent[]
):number|null{
  const selected=selectedComponents(line,components);
  const requested=String(line.metadata?.componentKind??"").trim()||String(line.metadata?.componentRef??"").trim();
  if(!requested)return null;
  if(!selected.length)throw new Error(`Geen vak/component gevonden voor receptregel ${line.description}.`);
  if(line.takeoffBasis==="fixed")return null;
  if(line.takeoffBasis==="internal_joint")throw new Error(`Interne koppeling ondersteunt geen vakselectie voor receptregel ${line.description}.`);
  const sum=(selector:(component:EvaluatedTakeoffComponent)=>number|null)=>selected.reduce((total,component)=>{
    const value=selector(component);
    if(value==null||!Number.isFinite(value)||value<0)throw new Error(`Onvolledige vakgeometrie voor receptregel ${line.description} (${component.component_ref}).`);
    return total+value;
  },0);
  if(line.takeoffBasis==="area"||line.takeoffBasis==="part_area")return sum(component=>component.effective_area_m2);
  if(line.takeoffBasis==="perimeter")return sum(component=>component.effective_perimeter_m);
  if(line.takeoffBasis==="width")return sum(component=>component.width_mm==null?null:(component.width_mm/1000)*component.quantity);
  if(line.takeoffBasis==="height")return sum(component=>component.height_mm==null?null:(component.height_mm/1000)*component.quantity);
  if(line.takeoffBasis==="two_sides_plus_head")return sum(component=>
    component.width_mm==null||component.height_mm==null?null:
      ((component.width_mm+2*component.height_mm)/1000)*component.quantity
  );
  return null;
}

export function generateCalcOwnedRecipeLines(input:{
  recipe:CalcRecipeVersion;
  takeoff:{
    id:number;
    position_ref:string;
    quantity:number;
    width_mm:number|null;
    height_mm:number|null;
  };
  resolution:OfficeCalcSourceResolution;
  evidence?:{
    documentIds:number[];
    pages:number[];
    components?:Array<{
      componentRef:string;
      componentKind:string;
      componentType:string|null;
      documentId:number|null;
      sourcePage:number|null;
      sourceFragment:string|null;
    }>;
  };
  scopes?:Array<{type:"building"|"facade"|"dwelling"|"dwelling_type"|"building_part";ref:string}>;
  contextBinding?:{officeVersion:string;selectionVersion:string|null};
  components?:EvaluatedTakeoffComponent[];
}):CalcOwnedGeneratedLine[] {
  const widthMm=Number(input.takeoff.width_mm??0);
  const heightMm=Number(input.takeoff.height_mm??0);
  const quantity=Number(input.takeoff.quantity??0);
  if(widthMm<=0||heightMm<=0||quantity<=0) throw new Error("Recept vereist positieve B×H en hoeveelheid.");

  const geometry=calculateAssemblyTakeoff({widthMm,heightMm,quantity});
  const sources=resolvedMap(input.resolution);

  return [...input.recipe.lines].sort((a,b)=>a.sortOrder-b.sortOrder).map(line=>{
    const quantitySource=line.quantitySourceType&&line.quantitySourceRef
      ? sources.get(`${line.quantitySourceType}\u0000${line.quantitySourceRef}`)??null
      : null;
    const costSource=line.costSourceType&&line.costSourceRef
      ? sources.get(`${line.costSourceType}\u0000${line.costSourceRef}`)??null
      : null;
    const unresolved:string[]=[];
    if(line.quantitySourceType&&line.quantitySourceRef){
      if(!quantitySource) unresolved.push(`Normbron ${line.quantitySourceType}:${line.quantitySourceRef} ontbreekt in Office-response.`);
      else if(quantitySource.status==="unresolved") unresolved.push(quantitySource.reason||`Normbron ${line.quantitySourceType}:${line.quantitySourceRef} is niet beschikbaar.`);
    }
    if(line.costSourceType&&line.costSourceRef){
      if(!costSource) unresolved.push(`Kostprijsbron ${line.costSourceType}:${line.costSourceRef} ontbreekt in Office-response.`);
      else if(costSource.status==="unresolved") unresolved.push(costSource.reason||`Kostprijsbron ${line.costSourceType}:${line.costSourceRef} is niet beschikbaar.`);
    }

    let grossQuantity:number;
    if(line.takeoffBasis==="fixed"){
      grossQuantity=Number(line.fixedQuantity??0)*line.factor;
      if(line.wastePct) grossQuantity*=1+(line.wastePct/100);
      if(line.roundingStep) grossQuantity=Math.ceil(grossQuantity/line.roundingStep)*line.roundingStep;
      if(line.minimumQuantity!=null) grossQuantity=Math.max(grossQuantity,line.minimumQuantity);
    } else {
      const normFactor=quantitySource?.status==="resolved"?Number(quantitySource.value):1;
      if(!Number.isFinite(normFactor)||normFactor<0) throw new Error(`Ongeldige normbron voor receptregel ${line.description}.`);
      const componentBase=componentBasisQuantity(line,input.components??[]);
      if(componentBase!==null){
        grossQuantity=componentBase*line.factor*normFactor;
        if(line.wastePct)grossQuantity*=1+(line.wastePct/100);
        if(line.roundingStep)grossQuantity=Math.ceil(grossQuantity/line.roundingStep)*line.roundingStep;
        if(line.minimumQuantity!=null)grossQuantity=Math.max(grossQuantity,line.minimumQuantity);
      }else{
        grossQuantity=calculateRecipeQuantityDetails(geometry,{
          basis:line.takeoffBasis,
          factor:line.factor*normFactor,
          wastePct:line.wastePct,
          roundingStep:line.roundingStep,
          minimumQuantity:line.minimumQuantity
        }).grossQuantity;
      }
    }

    const unitCost=costSource?.status==="resolved"?Number(costSource.value):0;
    if(costSource?.status==="resolved"&&(!Number.isFinite(unitCost)||unitCost<0)) throw new Error(`Ongeldige kostprijsbron voor receptregel ${line.description}.`);

    const costs={labour:0,material:0,equipment:0,subcontracting:0,other:0};
    let labourNorm:number|null=null;
    let labourTotalHours:number|null=null;
    let labourHoursInputMode:null|"norm"|"total_hours"=null;
    let calcQuantity=grossQuantity;

    if(line.costKind==="labour"){
      labourTotalHours=grossQuantity;
      labourHoursInputMode="total_hours";
      labourNorm=quantitySource?.status==="resolved"?Number(quantitySource.value):null;
      costs.labour=unitCost;
      calcQuantity=1;
    } else if(line.costKind==="material") costs.material=unitCost;
    else if(line.costKind==="equipment") costs.equipment=unitCost;
    else if(line.costKind==="subcontracting") costs.subcontracting=unitCost;
    else costs.other=unitCost;

    return {
      code:line.lineRef,
      description:line.description,
      unit:line.unit??(line.costKind==="labour"?"uur":costSource?.status==="resolved"?costSource.unit??"":""),

      quantity:calcQuantity,
      labourNorm,
      labourTotalHours,
      labourHoursInputMode,
      ...costs,
      priceSourceType:"recipe" as const,
      officeSourceId:costSource?.status==="resolved"?String((costSource.source as any).price_id??(costSource.source as any).budget_line_id??""):null,
      resolutionStatus:unresolved.length?"unresolved":"resolved",
      resolutionReason:unresolved.length?unresolved.join(" "):null,
      sourceReference:`${input.recipe.recipeKey}@${input.recipe.versionNo}/${line.lineRef}`,
      sourceUnitPrice:costSource?.status==="resolved"?unitCost:null,
      sourceDetails:JSON.stringify({
        recipe:{id:input.recipe.recipeId,version_id:input.recipe.id,key:input.recipe.recipeKey,version:input.recipe.versionNo},
        takeoff_id:input.takeoff.id,
        position_ref:input.takeoff.position_ref,
        evidence:{
          document_ids:input.evidence?.documentIds??[],
          pages:input.evidence?.pages??[],
          components:input.evidence?.components??[]
        },
        context_scopes:input.scopes??[],
        context_binding:input.contextBinding??null,
        quantity_rule:{
          basis:line.takeoffBasis,
          component_kind:line.metadata?.componentKind??null,
          component_ref:line.metadata?.componentRef??null,
          factor:line.factor,
          waste_pct:line.wastePct,
          fixed_quantity:line.fixedQuantity,
          rounding_step:line.roundingStep,
          minimum_quantity:line.minimumQuantity
        },
        quantity_source:quantitySource,
        cost_source:costSource
      })
    };
  });
}
