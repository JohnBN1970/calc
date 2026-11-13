import React, { useEffect, useState } from "react";

export type GuidedBasisLine = {
  structureKey?:string|null; lineType:string; code?:string|null; description?:string|null;
  quantity?:number|null; unit?:string|null; labourTotalHours?:number|null;
  labourUnitCost?:number; materialUnitCost?:number; equipmentUnitCost?:number;
  subcontractingUnitCost?:number; otherUnitCost?:number; vatRegimeId?:number|null;
  priceSourceType?:string|null; sourceReference?:string|null; sourceDetails?:string|null;
};
type Answer = {
  decision:"pending"|"yes"|"no"|"confirmed"; quantity:number|null; unit:string; unitPrice:number|null;
  carrier:"equipment"|"subcontracting"|"other"; vatRegimeId:number|null; explanation:string;
};
type Question = {id:string;group:string;label:string;kind:"cost"|"review";unit:string;carrier:Answer["carrier"]};
type Proposal = {lines:GuidedBasisLine[];complete:boolean;reasons:string[]};
type Props = {
  request:(input:string,init?:RequestInit)=>Promise<Response>;
  versionNo:number; locked:boolean; lines:GuidedBasisLine[];
  paragraphs:Array<{id:number;label:string}>; vatRegimes:Array<{id:number;label:string;active:boolean}>;
  onApply:(lines:GuidedBasisLine[],parentId:number)=>Promise<void>; onClose:()=>void;
};

export function GuidedCalculation({request,versionNo,locked,lines,paragraphs,vatRegimes,onApply,onClose}:Props){
  const [questions,setQuestions]=useState<Question[]>([]);
  const [answers,setAnswers]=useState<Record<string,Answer>>({});
  const [parentId,setParentId]=useState<number|null>(paragraphs[0]?.id??null);
  const [message,setMessage]=useState("Vragen laden…");
  const [busy,setBusy]=useState(false);
  const [reasons,setReasons]=useState<string[]>([]);
  const source=lines.find(line=>line.structureKey==="guided:review")?.sourceDetails??null;
  useEffect(()=>{
    let cancelled=false;
    void (async()=>{
      try{
        const response=await request("/api/workbench/current/guidance",{headers:{Accept:"application/json"}});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error??"Vragen konden niet worden geladen.");
        if(cancelled)return;
        const next=data.questions as Question[];
        let saved:Record<string,Answer>={};
        try{const parsed=JSON.parse(source??"null");if(parsed?.contract==="brebo-guided-calculation-v1")saved=parsed.answers??{};}catch{}
        setQuestions(next);
        setAnswers(Object.fromEntries(next.map(q=>[q.id,saved[q.id]??{decision:"pending",quantity:null,unit:q.unit,unitPrice:null,carrier:q.carrier,vatRegimeId:null,explanation:""}])));
        setMessage(locked?"Vastgestelde versie: antwoorden zijn alleen leesbaar.":"Controleer de scope en voorzieningen. Een antwoord Ja wordt een kostenregel; Niet nodig / al opgenomen vraagt een toelichting.");
        setReasons([]);
      }catch(error){if(!cancelled)setMessage(error instanceof Error?error.message:"Vragen laden mislukt.");}
    })();
    return()=>{cancelled=true;};
  },[request,versionNo,locked]);
  const patch=(id:string,change:Partial<Answer>)=>setAnswers(current=>({...current,[id]:{...current[id],...change}}));
  const apply=async()=>{
    if(busy||locked||parentId==null)return;
    setBusy(true);
    try{
      const response=await request("/api/workbench/current/guidance/preview",{
        method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({versionNo,answers,lines})
      });
      const data=await response.json() as Proposal&{error?:string};
      if(!response.ok)throw new Error(data.error??"Vraagcontrole mislukt.");
      await onApply(data.lines,parentId);
      setReasons(data.reasons);
      setMessage(data.complete?"Antwoorden gecontroleerd en kostenregels opgeslagen. Loop de totale calculatie na vóór vaststelling.":`Concept opgeslagen met ${data.reasons.length} open punt(en). Vaststellen blijft geblokkeerd tot deze zijn opgelost.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Verwerken mislukt.");}
    finally{setBusy(false);}
  };
  const answered=Object.values(answers).filter(a=>a.decision!=="pending").length;
  return <section className="guidedCalculation" aria-label="Vraaggestuurde calculatie" aria-busy={busy}>
    <header><div><span className="eyebrow">CALCULATIECONTROLE</span><h2>Vraaggestuurde calculatie</h2><p>Vul het voorstel uit gebouw, elementen en recepten aan met uitvoering en bouwplaatskosten.</p></div><button type="button" onClick={onClose} aria-label="Vraaggestuurde calculatie sluiten">×</button></header>
    <div className="guidedSummary"><strong>{answered} / {questions.length} beantwoord</strong><span>{lines.filter(line=>["item","allowance","adjustable","option"].includes(line.lineType)).length} calculatieregels</span><span>Bedragen exclusief btw · geen automatische prijsaanname</span></div>
    {!locked&&<label className="guidedDestination">Voorzieningen opnemen onder eindparagraaf<select value={parentId??""} disabled={busy} onChange={event=>setParentId(event.target.value?Number(event.target.value):null)}><option value="">Kies een eindparagraaf…</option>{paragraphs.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}
    {!paragraphs.length&&!locked&&<p role="alert">Maak eerst een hoofdgroep en eindparagraaf in het rekenblad of via Builder.</p>}
    {[...new Set(questions.map(q=>q.group))].map(group=><fieldset key={group} disabled={locked||busy}><legend>{group}</legend>{questions.filter(q=>q.group===group).map(q=>{
      const a=answers[q.id];if(!a)return null;
      return <div className={"guidedQuestion is-"+a.decision} key={q.id}>
        <label><strong>{q.label}</strong><select value={a.decision} onChange={event=>patch(q.id,{decision:event.target.value as Answer["decision"]})}>
          <option value="pending">Nog te beoordelen</option>{q.kind==="cost"?<><option value="yes">Ja, kosten opnemen</option><option value="no">Niet nodig / al opgenomen</option></>:<option value="confirmed">Gecontroleerd en akkoord</option>}
        </select></label>
        {q.kind==="cost"&&a.decision==="yes"&&<div className="guidedCostInputs">
          <label>Aantal / duur<input type="number" min="0.000001" max="1000000000" step="any" value={a.quantity??""} onChange={event=>patch(q.id,{quantity:event.target.value===""?null:Number(event.target.value)})}/></label>
          <label>Eenheid<input value={a.unit} maxLength={16} onChange={event=>patch(q.id,{unit:event.target.value})}/></label>
          <label>Prijs per eenheid (€)<input type="number" min="0.000001" max="1000000000" step="any" value={a.unitPrice??""} onChange={event=>patch(q.id,{unitPrice:event.target.value===""?null:Number(event.target.value)})}/></label>
          <label>Kostendrager<select value={a.carrier} onChange={event=>patch(q.id,{carrier:event.target.value as Answer["carrier"]})}><option value="equipment">Materieel</option><option value="subcontracting">Onderaanneming</option><option value="other">Overig</option></select></label>
          <label>Btw<select aria-label="Btw" value={a.vatRegimeId??""} onChange={event=>patch(q.id,{vatRegimeId:event.target.value?Number(event.target.value):null})}><option value="">Kies btw…</option>{vatRegimes.filter(r=>r.active).map(r=><option value={r.id} key={r.id}>{r.label}</option>)}</select></label>
        </div>}
        {a.decision!=="pending"&&<label className="guidedExplanation">{a.decision==="yes"?"Prijsbron en uitgangspunten (inclusief aan-/afvoer en huurduur)":a.decision==="no"?"Waarom niet nodig, of waar al opgenomen?":"Toelichting / gecontroleerde bronnen"}<textarea maxLength={1500} rows={2} value={a.explanation} onChange={event=>patch(q.id,{explanation:event.target.value})}/></label>}
      </div>;
    })}</fieldset>)}
    <footer><p role="status">{message}</p>{!locked&&<button type="button" disabled={busy||!questions.length||parentId==null||!paragraphs.some(p=>p.id===parentId)} onClick={()=>void apply()}>{busy?"Verwerken…":"Antwoorden en kostenregels opslaan"}</button>}</footer>
    {reasons.length>0&&<ul className="guidedOpenPoints">{reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>}
  </section>;
}
