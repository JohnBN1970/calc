import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {GuidedCalculation,type GuidedBasisLine} from "../apps/web/src/GuidedCalculation";
import {CalculationHistory} from "../apps/web/src/CalculationHistory";
const w=window as any;
const request=async(input:string,init?:RequestInit)=>new Response(JSON.stringify(await w.guidanceApi(input,init?.body?JSON.parse(String(init.body)):null)),{status:200,headers:{"Content-Type":"application/json"}});
function Harness(){
 const [lines,setLines]=useState<GuidedBasisLine[]>([{structureKey:"ordinary",lineType:"item",description:"Kozijn",quantity:2,unit:"st",materialUnitCost:450,vatRegimeId:1,priceSourceType:"article"}]);
 return <GuidedCalculation request={request} versionNo={1} locked={w.qaLocked??false} lines={lines} paragraphs={[{id:2,label:"31 · Kozijnen"}]} vatRegimes={[{id:1,label:"21%",active:true}]} onClose={()=>{}} onApply={async(proposals)=>{await w.savedGuidance(proposals);setLines(current=>[...current.filter(line=>!line.structureKey?.startsWith("guided:")),...proposals]);}}/>;
}
createRoot(document.getElementById("root")!).render(w.qaHistory?<CalculationHistory request={request} refreshKey="1:1" onClose={()=>{}}/>:<Harness/>);
