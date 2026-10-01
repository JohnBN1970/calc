import type { OfficeRecipeCatalog } from "./officeClient.js";
import { evaluateRecipeFormula } from "./recipeFormulaEvaluator.js";

export type CalcGeneratedRecipeLine = {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  labourNorm: number | null;
  labourTotalHours: number | null;
  labourHoursInputMode: "norm" | "total_hours" | null;
  labour: number;
  material: number;
  equipment: number;
  subcontracting: number;
  other: number;
  priceSourceType: "recipe";
  officeSourceId: string;
  sourceReference: string;
  sourceUnitPrice: number | null;
  sourceDetails: string;
};

export function generateCalcLinesFromOfficeRecipe(input:{
  catalog: OfficeRecipeCatalog;
  recipeVersionId: number;
  takeoff: {
    id:number;
    quantity:number;
    width_mm:number|null;
    height_mm:number|null;
    area_m2:number|null;
    perimeter_m:number|null;
    top_m:number|null;
    bottom_m:number|null;
    left_m:number|null;
    right_m:number|null;
  };
  passes:number;
  parameterValues:Record<string,string|number>;
}): { recipeName:string; lines:CalcGeneratedRecipeLine[] } {
  const recipe=input.catalog.catalog.recipes.find(item=>item.version_id===input.recipeVersionId);
  if(!recipe) throw new Error("Receptversie staat niet in de actuele Office-catalogus.");

  const base:Record<string,number>={
    takeoff_id: input.takeoff.id,
    top_m: Number(input.takeoff.top_m??0),
    bottom_m: Number(input.takeoff.bottom_m??0),
    left_m: Number(input.takeoff.left_m??0),
    right_m: Number(input.takeoff.right_m??0),
    perimeter_m: Number(input.takeoff.perimeter_m??0),
    area_m2: Number(input.takeoff.area_m2??0),
    width_mm: Number(input.takeoff.width_mm??0),
    height_mm: Number(input.takeoff.height_mm??0),
    passes: input.passes,
    quantity: Number(input.takeoff.quantity??1),
    element_quantity: Number(input.takeoff.quantity??1)
  };

  const parameters:Record<string,number>={};
  for(const parameter of [...recipe.parameters].sort((a,b)=>a.sort_order-b.sort_order)){
    const supplied=input.parameterValues[parameter.key];
    if(supplied!==undefined&&supplied!==""&&Number.isFinite(Number(supplied))){
      parameters[parameter.key]=Number(supplied);
      continue;
    }
    if(parameter.formula?.trim()){
      parameters[parameter.key]=evaluateRecipeFormula(parameter.formula,{...base,...parameters});
      continue;
    }
    if(parameter.default_value!==null&&parameter.default_value!==""&&Number.isFinite(Number(parameter.default_value))){
      parameters[parameter.key]=Number(parameter.default_value);
      continue;
    }
    if(parameter.required) throw new Error(`Verplichte receptparameter ontbreekt: ${parameter.label||parameter.key}`);
    parameters[parameter.key]=0;
  }

  const variables={...base,...parameters};
  const lines:CalcGeneratedRecipeLine[]=[...recipe.lines].sort((a,b)=>a.sort_order-b.sort_order).map(line=>{
    const calculated=evaluateRecipeFormula(line.quantity_formula,variables);
    const quantity=calculated*(1+Number(line.waste_pct??0)/100);
    if(!Number.isFinite(quantity)||quantity<0) throw new Error(`Ongeldige hoeveelheid voor receptregel ${line.description}.`);
    const unitCost=line.unit_cost==null?null:Number(line.unit_cost);
    if(unitCost!==null&&(!Number.isFinite(unitCost)||unitCost<0)) throw new Error(`Ongeldige kostprijs voor receptregel ${line.description}.`);

    const costs={labour:0,material:0,equipment:0,subcontracting:0,other:0};
    let labourTotalHours:number|null=null;
    let labourHoursInputMode:null|"norm"|"total_hours"=null;
    const type=String(line.type??"").toLowerCase();
    if(type==="labour"){
      labourTotalHours=quantity;
      labourHoursInputMode="total_hours";
      costs.labour=unitCost??0;
    } else if(type==="material") costs.material=unitCost??0;
    else if(type==="equipment") costs.equipment=unitCost??0;
    else if(type==="subcontracting") costs.subcontracting=unitCost??0;
    else if(type==="other") costs.other=unitCost??0;
    else throw new Error(`Niet-ondersteunde Office kostensoort: ${line.type}`);

    return {
      code: line.key,
      description: line.description,
      unit: line.unit??"",
      quantity: type==="labour"?1:quantity,
      labourNorm:null,
      labourTotalHours,
      labourHoursInputMode,
      ...costs,
      priceSourceType:"recipe" as const,
      officeSourceId:String(line.id),
      sourceReference:`${recipe.recipe_key}@${recipe.version}/${line.key}`,
      sourceUnitPrice:unitCost,
      sourceDetails:JSON.stringify({
        recipe_id:recipe.recipe_id,
        recipe_version_id:recipe.version_id,
        recipe_name:recipe.name,
        formula:line.quantity_formula,
        calculated_quantity:calculated,
        waste_pct:Number(line.waste_pct??0),
        gross_quantity:quantity,
        material_ref:line.material_ref,
        price_source_ref:line.price_source_ref,
        parameters
      })
    };
  });

  return {recipeName:recipe.name,lines};
}
