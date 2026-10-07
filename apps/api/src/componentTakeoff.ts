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
  parent_component_kind:ComponentKind|null;
  width_delta_to_parent_mm:number|null;
  height_delta_to_parent_mm:number|null;
  relation_status:"root"|"ok"|"missing_parent"|"self_parent"|"cycle";
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
    const positionMap=byPosition.get(component.position_ref)??new Map<string,TakeoffComponent>();
    let relation_status:EvaluatedTakeoffComponent["relation_status"]="root";
    let parent:TakeoffComponent|null=null;
    if(component.parent_component_ref){
      if(component.parent_component_ref===component.component_ref){
        relation_status="self_parent";
        warnings.push("Component verwijst naar zichzelf als parent.");
      }else{
        parent=positionMap.get(component.parent_component_ref)??null;
        if(!parent){
          relation_status="missing_parent";
          warnings.push("Bovenliggend component ontbreekt in dezelfde positie.");
        }else{
          const seen=new Set<string>([component.component_ref]);
          let cursor:TakeoffComponent|null=parent;
          let cycle=false;
          while(cursor?.parent_component_ref){
            if(seen.has(cursor.component_ref)||seen.has(cursor.parent_component_ref)){cycle=true;break;}
            seen.add(cursor.component_ref);
            cursor=positionMap.get(cursor.parent_component_ref)??null;
          }
          if(cycle){
            relation_status="cycle";
            warnings.push("Circulaire componentrelatie gedetecteerd.");
          }else relation_status="ok";
        }
      }
    }
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

    if(parent&&width&&height){
      const parentWidth=positive(parent.width_mm),parentHeight=positive(parent.height_mm);
      if(parentWidth&&width>parentWidth+0.001)warnings.push("Component is breder dan het bovenliggende onderdeel.");
      if(parentHeight&&height>parentHeight+0.001)warnings.push("Component is hoger dan het bovenliggende onderdeel.");
    }
    if(semantic.source==="unknown")warnings.push("Componenttype is nog niet eenduidig herkend.");
    if(!["reviewed","accepted","confirmed"].includes(String(component.review_status).toLowerCase())){
      warnings.push("Broncomponent wacht nog op review.");
    }

    const parentSemantic=parent?normalizeComponentKind(parent):null;
    const parentWidth=parent?positive(parent.width_mm):null;
    const parentHeight=parent?positive(parent.height_mm):null;
    const width_delta_to_parent_mm=parentWidth&&width?parentWidth-width:null;
    const height_delta_to_parent_mm=parentHeight&&height?parentHeight-height:null;

    return{
      ...component,
      component_kind:semantic.kind,
      component_kind_source:semantic.source,
      parent_component_kind:parentSemantic?.kind??null,
      width_delta_to_parent_mm,
      height_delta_to_parent_mm,
      relation_status,
      calculated_area_m2,
      calculated_perimeter_m,
      effective_area_m2:positive(component.area_m2)??calculated_area_m2,
      effective_perimeter_m:positive(component.perimeter_m)??calculated_perimeter_m,
      geometry_status,
      warnings
    };
  });
}


export type PositionTakeoffSummary={
  position_ref:string;
  component_count:number;
  glass_count:number;
  glass_area_m2:number;
  operable_count:number;
  door_count:number;
  panel_count:number;
  mullion_count:number;
  transom_count:number;
  review_count:number;
  relation_issue_count:number;
  geometry_issue_count:number;
  ready_for_glass_takeoff:boolean;
};

export function summarizeTakeoffByPosition(components:EvaluatedTakeoffComponent[]):PositionTakeoffSummary[]{
  const grouped=new Map<string,EvaluatedTakeoffComponent[]>();
  for(const component of components){
    const rows=grouped.get(component.position_ref)??[];
    rows.push(component);
    grouped.set(component.position_ref,rows);
  }
  return [...grouped.entries()].map(([position_ref,rows])=>{
    const review_count=rows.filter(row=>row.warnings.length>0||!["reviewed","accepted","confirmed"].includes(String(row.review_status).toLowerCase())).length;
    const relation_issue_count=rows.filter(row=>!["root","ok"].includes(row.relation_status)).length;
    const geometry_issue_count=rows.filter(row=>row.geometry_status!=="complete").length;
    const glassRows=rows.filter(row=>row.component_kind==="glass");
    const glassParentsValid=glassRows.every(row=>row.parent_component_kind!==null&&["field","operable","door"].includes(row.parent_component_kind));
    return{
      position_ref,
      component_count:rows.length,
      glass_count:glassRows.reduce((sum,row)=>sum+Number(row.quantity||0),0),
      glass_area_m2:glassRows.reduce((sum,row)=>sum+Number(row.effective_area_m2||0),0),
      operable_count:rows.filter(row=>row.component_kind==="operable").reduce((sum,row)=>sum+Number(row.quantity||0),0),
      door_count:rows.filter(row=>row.component_kind==="door").reduce((sum,row)=>sum+Number(row.quantity||0),0),
      panel_count:rows.filter(row=>row.component_kind==="panel").reduce((sum,row)=>sum+Number(row.quantity||0),0),
      mullion_count:rows.filter(row=>row.component_kind==="mullion").reduce((sum,row)=>sum+Number(row.quantity||0),0),
      transom_count:rows.filter(row=>row.component_kind==="transom").reduce((sum,row)=>sum+Number(row.quantity||0),0),
      review_count,
      relation_issue_count,
      geometry_issue_count,
      ready_for_glass_takeoff:glassRows.length>0&&glassParentsValid&&review_count===0&&relation_issue_count===0&&geometry_issue_count===0
    };
  }).sort((a,b)=>a.position_ref.localeCompare(b.position_ref,"nl"));
}


export type PrintableComponentTakeoffRow={
  position_ref:string;
  component_ref:string;
  parent_component_ref:string|null;
  depth:number;
  component_kind:ComponentKind;
  description:string|null;
  quantity:number;
  width_mm:number|null;
  height_mm:number|null;
  area_m2:number|null;
  perimeter_m:number|null;
  source_page:number|null;
  review_status:string;
  ready:boolean;
  warnings:string[];
};

export function buildPrintableComponentTakeoff(components:EvaluatedTakeoffComponent[]):PrintableComponentTakeoffRow[]{
  const byPosition=new Map<string,Map<string,EvaluatedTakeoffComponent>>();
  for(const component of components){
    const map=byPosition.get(component.position_ref)??new Map<string,EvaluatedTakeoffComponent>();
    map.set(component.component_ref,component);
    byPosition.set(component.position_ref,map);
  }
  return components.map(component=>{
    const map=byPosition.get(component.position_ref)!;
    let depth=0;
    let cursor=component.parent_component_ref;
    const seen=new Set<string>([component.component_ref]);
    while(cursor&&depth<12&&!seen.has(cursor)){
      seen.add(cursor);
      depth++;
      cursor=map.get(cursor)?.parent_component_ref??null;
    }
    const ready=component.geometry_status==="complete"
      &&["root","ok"].includes(component.relation_status)
      &&["reviewed","accepted","confirmed"].includes(String(component.review_status).toLowerCase())
      &&component.warnings.length===0;
    return{
      position_ref:component.position_ref,
      component_ref:component.component_ref,
      parent_component_ref:component.parent_component_ref,
      depth,
      component_kind:component.component_kind,
      description:component.description,
      quantity:component.quantity,
      width_mm:component.width_mm,
      height_mm:component.height_mm,
      area_m2:component.effective_area_m2,
      perimeter_m:component.effective_perimeter_m,
      source_page:component.source_page,
      review_status:component.review_status,
      ready,
      warnings:component.warnings
    };
  }).sort((a,b)=>a.position_ref.localeCompare(b.position_ref,"nl")||a.depth-b.depth||a.component_ref.localeCompare(b.component_ref,"nl"));
}
