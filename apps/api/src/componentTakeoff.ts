export type TakeoffComponent={
  id:number;
  document_id:number|null;
  position_ref:string;
  component_ref:string;
  parent_component_ref:string|null;
  component_type:string|null;
  classification_ref:string|null;
  description:string|null;
  quantity:number;
  width_mm:number|null;
  height_mm:number|null;
  area_m2:number|null;
  perimeter_m:number|null;
  source_page:number|null;
  source_fragment:string|null;
  extraction_method:string|null;
  confidence:number;
  review_status:string;
};

export type ComponentKind="frame"|"field"|"glass"|"operable"|"door"|"panel"|"mullion"|"transom"|"unknown";

export type EvaluatedTakeoffComponent=TakeoffComponent&{
  component_kind:ComponentKind;
  component_kind_source:"explicit"|"inferred"|"unknown";
  calculated_area_m2:number|null;
  calculated_perimeter_m:number|null;
  effective_area_m2:number|null;
  effective_perimeter_m:number|null;
  geometry_status:"complete"|"incomplete"|"invalid";
  warnings:string[];
};

function normalizeComponentKind(component:TakeoffComponent):{kind:ComponentKind;source:"explicit"|"inferred"|"unknown"}{
  const explicit=String(component.component_type??"").trim().toLocaleLowerCase("nl-NL");
  const explicitAliases:Record<string,ComponentKind>={
    frame:"frame",kozijn:"frame",window_frame:"frame",
    field:"field",vak:"field",opening:"field",
    glass:"glass",glas:"glass",glazing:"glass",ruit:"glass",
    operable:"operable",draai:"operable",draaikiep:"operable",draai_kiep:"operable",tilt_turn:"operable",
    door:"door",deur:"door",
    panel:"panel",paneel:"panel",infill:"panel",
    mullion:"mullion",stijl:"mullion",
    transom:"transom",kalf:"transom"
  };
  if(explicit){
    const direct=explicitAliases[explicit];
    if(direct)return{kind:direct,source:"explicit"};
  }
  const text=[component.description??"",component.classification_ref??"",component.component_ref??""].join(" ").toLocaleLowerCase("nl-NL");
  const patterns:Array<[ComponentKind,RegExp]>=[
    ["glass",/\b(glas|ruit|glazing)\b/],
    ["operable",/\b(draai.?kiep|draaikiep|tilt.?turn|draaiend|openslaand)\b/],
    ["door",/\b(deur|door)\b/],
    ["panel",/\b(paneel|panel|vulling|infill)\b/],
    ["mullion",/\b(stijl|mullion|tussenstijl)\b/],
    ["transom",/\b(kalf|transom|tussenregel)\b/],
    ["field",/\b(vak|field)\b/],
    ["frame",/\b(kozijn|frame)\b/]
  ];
  for(const [kind,pattern] of patterns)if(pattern.test(text))return{kind,source:"inferred"};
  return{kind:"unknown",source:"unknown"};
}

function positive(value:number|null):number|null{
  if(value==null||!Number.isFinite(Number(value))||Number(value)<=0)return null;
  return Number(value);
}

export function evaluateTakeoffComponents(components:TakeoffComponent[]):EvaluatedTakeoffComponent[]{
  const byPosition=new Map<string,Map<string,TakeoffComponent>>();
  for(const component of components){
    const map=byPosition.get(component.position_ref)??new Map<string,TakeoffComponent>();
    map.set(component.component_ref,component);
    byPosition.set(component.position_ref,map);
  }

  return components.map(component=>{
    const warnings:string[]=[];
    const semantic=normalizeComponentKind(component);
    const quantity=positive(component.quantity);
    const width=positive(component.width_mm);
    const height=positive(component.height_mm);
    let geometry_status:EvaluatedTakeoffComponent["geometry_status"]="complete";
    if(quantity==null||width==null||height==null){
      geometry_status=(component.quantity<=0||component.width_mm===0||component.height_mm===0)?"invalid":"incomplete";
      if(quantity==null)warnings.push("Aantal ontbreekt of is ongeldig.");
      if(width==null)warnings.push("Breedte ontbreekt of is ongeldig.");
      if(height==null)warnings.push("Hoogte ontbreekt of is ongeldig.");
    }
    const calculated_area_m2=quantity&&width&&height?(width/1000)*(height/1000)*quantity:null;
    const calculated_perimeter_m=quantity&&width&&height?2*((width/1000)+(height/1000))*quantity:null;

    const parent=component.parent_component_ref
      ? byPosition.get(component.position_ref)?.get(component.parent_component_ref)??null
      : null;
    if(parent&&width&&height){
      const parentWidth=positive(parent.width_mm),parentHeight=positive(parent.height_mm);
      if(parentWidth&&width>parentWidth+0.001)warnings.push("Component is breder dan het bovenliggende onderdeel.");
      if(parentHeight&&height>parentHeight+0.001)warnings.push("Component is hoger dan het bovenliggende onderdeel.");
    }
    if(semantic.source==="unknown")warnings.push("Componenttype is nog niet eenduidig herkend.");
    if(!["reviewed","accepted","confirmed"].includes(String(component.review_status).toLowerCase())){
      warnings.push("Broncomponent wacht nog op review.");
    }

    return{
      ...component,
      component_kind:semantic.kind,
      component_kind_source:semantic.source,
      calculated_area_m2,
      calculated_perimeter_m,
      effective_area_m2:positive(component.area_m2)??calculated_area_m2,
      effective_perimeter_m:positive(component.perimeter_m)??calculated_perimeter_m,
      geometry_status,
      warnings
    };
  });
}
