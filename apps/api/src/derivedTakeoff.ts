import type { OfficeCalculationContextSnapshot } from "./officeClient.js";
import { calculateTakeoff } from "./takeoff.js";
import { measurementKindForFact } from "./measurementSemantics.js";

type Context=OfficeCalculationContextSnapshot["context"];
type TakeoffRow=Context["takeoff"][number];

export type DerivedTakeoff={
  rows:TakeoffRow[];
  derivedPositionRefs:string[];
  unresolved:string[];
};

function reviewed(status:string):boolean{
  return ["reviewed","accepted","confirmed"].includes(String(status).toLowerCase());
}

export function deriveTakeoffFromOfficeFacts(snapshot:OfficeCalculationContextSnapshot):DerivedTakeoff{
  const context=snapshot.context;
  const existing=new Set(context.takeoff.map(row=>row.position_ref.trim()).filter(Boolean));
  const byPosition=new Map<string,Context["facts"]>();
  for(const fact of context.facts){
    const ref=fact.position_ref?.trim();
    if(!ref||existing.has(ref)||!reviewed(fact.review_status))continue;
    const rows=byPosition.get(ref)??[];
    rows.push(fact);
    byPosition.set(ref,rows);
  }

  const rows:TakeoffRow[]=[];
  const unresolved:string[]=[];
  let nextId=-1;
  for(const [positionRef,facts] of byPosition){
    const quantities=facts.filter(f=>f.fact_type==="quantity"&&Number(f.value_number)>0);
    const kinds=[...new Set(facts.filter(f=>f.fact_type==="width_mm"||f.fact_type==="height_mm").map(measurementKindForFact))];
    const complete=kinds.filter(kind=>
      facts.some(f=>f.fact_type==="width_mm"&&measurementKindForFact(f)===kind&&Number(f.value_number)>0)&&
      facts.some(f=>f.fact_type==="height_mm"&&measurementKindForFact(f)===kind&&Number(f.value_number)>0)
    );
    if(quantities.length!==1||complete.length!==1){
      if(quantities.length||complete.length)unresolved.push(`Positie ${positionRef}: uittrekken uit bronfeiten vereist review (hoeveelheden ${quantities.length}, complete maatsoorten ${complete.length}).`);
      continue;
    }
    const kind=complete[0];
    const widths=[...new Set(facts.filter(f=>f.fact_type==="width_mm"&&measurementKindForFact(f)===kind&&Number(f.value_number)>0).map(f=>Number(f.value_number)))];
    const heights=[...new Set(facts.filter(f=>f.fact_type==="height_mm"&&measurementKindForFact(f)===kind&&Number(f.value_number)>0).map(f=>Number(f.value_number)))];
    if(widths.length!==1||heights.length!==1){
      unresolved.push(`Positie ${positionRef}: meerdere actuele B×H-waarden binnen dezelfde maatsoort; review vereist.`);
      continue;
    }
    const quantity=Number(quantities[0].value_number),width=widths[0],height=heights[0];
    const calc=calculateTakeoff({widthMm:width,heightMm:height,quantity});
    rows.push({
      id:nextId--,position_ref:positionRef,quantity,width_mm:width,height_mm:height,
      area_m2:calc.areaM2,perimeter_m:calc.perimeterM,top_m:calc.widthTotalM,
      bottom_m:calc.widthTotalM,left_m:calc.heightTotalM,right_m:calc.heightTotalM,
      measurement_kind:kind,measurement_reference:"derived-from-reviewed-office-facts"
    });
  }
  return{rows,derivedPositionRefs:rows.map(row=>row.position_ref),unresolved};
}

export function withDerivedTakeoff(snapshot:OfficeCalculationContextSnapshot):{snapshot:OfficeCalculationContextSnapshot;derived:DerivedTakeoff}{
  const derived=deriveTakeoffFromOfficeFacts(snapshot);
  if(!derived.rows.length)return{snapshot,derived};
  return{snapshot:{...snapshot,context:{...snapshot.context,takeoff:[...snapshot.context.takeoff,...derived.rows]}},derived};
}
