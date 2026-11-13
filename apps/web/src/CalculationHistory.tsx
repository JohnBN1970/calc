import React,{useEffect,useState} from "react";
type Change={structureKey:string;description:string;kind:string;fields:Array<{field:string;before:unknown;after:unknown}>};
type Event={id:number;actorId:number;actorLabel:string;kind:string;versionNo:number;editRevision:number;reason:string;createdAt:string;changes:{lines?:Change[];sourceVersionNo?:number}};
const fieldLabels:Record<string,string>={quantity:"Hoeveelheid",unit:"Eenheid",description:"Omschrijving",labourUnitCost:"Uurtarief",labourTotalHours:"Arbeidsuren",labourNorm:"Arbeidsnorm",materialUnitCost:"Materiaalprijs",equipmentUnitCost:"Materieelprijs",subcontractingUnitCost:"Onderaanneming",otherUnitCost:"Overige kosten",sourceDetails:"Bron / vraagantwoorden",sourceReference:"Prijsbron",vatRegimeId:"Btw",parentStructureKey:"Paragraaf",sortOrder:"Volgorde"};
const show=(value:unknown)=>value==null?"—":typeof value==="object"?JSON.stringify(value):String(value);
export function CalculationHistory({request,refreshKey,onClose}:{request:(input:string,init?:RequestInit)=>Promise<Response>;refreshKey:string;onClose:()=>void}){
 const [events,setEvents]=useState<Event[]>([]);const [nextCursor,setNextCursor]=useState<number|null>(null);const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 const load=async(cursor:number|null)=>{
  setBusy(true);try{
   const response=await request("/api/workbench/current/change-history"+(cursor?"?before="+cursor:""),{headers:{Accept:"application/json"}});const data=await response.json();
   if(!response.ok)throw new Error(data.error??"Wijzigingshistorie niet beschikbaar.");
   setEvents(current=>cursor?[...current,...data.events]:data.events);setNextCursor(data.nextCursor);setMessage("");
  }catch(error){setMessage(error instanceof Error?error.message:"Historie laden mislukt.");}finally{setBusy(false);}
 };
 useEffect(()=>{void load(null);},[request,refreshKey]);
 return <section className="calculationHistory" aria-label="Revisies en wijzigingshistorie"><header><div><h2>Revisies en wijzigingen</h2><p>Opgeslagen rekenbladwijzigingen, nieuwe revisies en vaststellingen. De auteur komt uit de geverifieerde Office-sessie.</p></div><button type="button" onClick={onClose} aria-label="Wijzigingshistorie sluiten">×</button></header>
 <p className="muted">Gebruikers worden met hun Office-gebruikersnummer getoond. Historie van vóór deze functie is niet achteraf toegekend.</p>
 {events.map(event=><details className="calculationHistoryEvent" key={event.id}><summary><strong>v{event.versionNo} · {event.kind==="version_started"?"Revisie gestart":event.kind==="version_established"?"Vastgesteld":"Opgeslagen"}</strong><span>{event.actorLabel}</span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("nl-NL")}</time><span>{event.reason}</span></summary><div><p>Opslagnummer {event.editRevision}{event.changes.sourceVersionNo!=null?` · gebaseerd op v${event.changes.sourceVersionNo}`:""}</p>
 {(event.changes.lines??[]).map(change=><div className="calculationHistoryLine" key={change.structureKey}><strong>{change.kind==="added"?"Toegevoegd":change.kind==="removed"?"Verwijderd":"Gewijzigd"}: {change.description}</strong><table><thead><tr><th>Veld</th><th>Was</th><th>Wordt</th></tr></thead><tbody>{change.fields.map(field=><tr key={field.field}><th>{fieldLabels[field.field]??field.field}</th><td>{show(field.before)}</td><td>{show(field.after)}</td></tr>)}</tbody></table></div>)}
 </div></details>)}
 {!busy&&!events.length&&!message&&<p>Nog geen wijzigingen geregistreerd.</p>}<p role="status">{message|| (busy?"Historie laden…":"")}</p>{nextCursor&&<button type="button" disabled={busy} onClick={()=>void load(nextCursor)}>Oudere wijzigingen laden</button>}
 </section>;
}
