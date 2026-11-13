import React, { useEffect, useMemo, useState } from "react";

type DraftLine = {
  id: number;
  sort_order: number;
  description: string;
  unit: string;
  quantity: number;
  material_unit_cost: number;
  labour_unit_cost: number;
};

type CrmDraft = {
  contract: "brebo-calc-crm-draft-v1";
  calculationId: number;
  title: string;
  version: number;
  lines: DraftLine[];
};

const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

export function CrmDraftWorkbench({ basePath }: { basePath: string }) {
  const [draft, setDraft] = useState<CrmDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("st");
  const [quantity, setQuantity] = useState("1");
  const [material, setMaterial] = useState("0");
  const [labour, setLabour] = useState("0");

  async function refresh() {
    const response = await fetch(basePath + "/api/crm-draft", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(response.status === 401
        ? "Open eerst een nieuwe calculatie vanuit een bevoegde CRM-verkoopkans."
        : "De CRM-conceptcalculatie is nog niet beschikbaar.");
    }
    const next: unknown = await response.json();
    if (!next || typeof next !== "object" || (next as { contract?: string }).contract !== "brebo-calc-crm-draft-v1") {
      throw new Error("Onbekend antwoord van de calculatiewerkbank.");
    }
    setDraft(next as CrmDraft);
  }

  useEffect(() => {
    let canceled = false;
    void (async () => {
      try {
        const response = await fetch(basePath + "/api/crm-draft", { cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 401
          ? "Open deze conceptcalculatie vanuit BREBO Office CRM."
          : "De CRM-werkbank is nog niet vrijgegeven.");
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || (data as { contract?: string }).contract !== "brebo-calc-crm-draft-v1") {
          throw new Error("Ongeldige conceptcalculatie.");
        }
        if (!canceled) setDraft(data as CrmDraft);
      } catch (cause) {
        if (!canceled) setError(cause instanceof Error ? cause.message : "Calculatie niet beschikbaar.");
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => { canceled = true; };
  }, [basePath]);

  const total = useMemo(() => (draft?.lines ?? []).reduce((acc, line) =>
    acc + Number(line.quantity) * (Number(line.material_unit_cost) + Number(line.labour_unit_cost)), 0), [draft]);

  async function addLine(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !draft) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const payload = {
        description: description.trim(),
        unit: unit.trim(),
        quantity: Number(quantity),
        materialUnitCost: Number(material),
        labourUnitCost: Number(labour)
      };
      const response = await fetch(basePath + "/api/crm-draft/lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(response.status === 409 ? "Dit concept kan niet meer worden gewijzigd."
          : response.status === 401 || response.status === 403 ? "De Office-toegang is verlopen of geweigerd."
          : "De calculatieregel kon niet worden opgeslagen.");
      }
      await refresh();
      setDescription("");
      setMessage("Calculatieregel opgeslagen.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return <div style={{minHeight:"100vh",background:"#f5f7fb",color:"#17233c",fontFamily:"Inter,system-ui,sans-serif",padding:"32px 5vw"}}>
    <header style={{maxWidth:1160,margin:"0 auto 28px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:20}}>
      <div>
        <div style={{fontSize:12,fontWeight:800,letterSpacing:1.6,color:"#4a57b4"}}>BREBO OFFICE / CALCULATIE</div>
        <h1 style={{fontSize:28,margin:"8px 0"}}>CRM-conceptcalculatie</h1>
        <p style={{margin:0,color:"#626d82"}}>Een nieuwe calculatie vóór projectstart. Opdrachtacceptatie en werkbegroting volgen later in Office.</p>
      </div>
      <div style={{borderRadius:12,padding:"10px 14px",background:"#e9ecfb",color:"#444b91",fontWeight:700}}>Concept</div>
    </header>
    <main style={{maxWidth:1160,margin:"0 auto",display:"grid",gap:20}}>
      {loading && <section style={{padding:28,background:"#fff",borderRadius:14}}>Concept wordt geopend…</section>}
      {error && <div role="alert" style={{background:"#fff0f0",border:"1px solid #edc0c0",padding:18,borderRadius:12,color:"#9c2222"}}>{error}</div>}
      {draft && <>
        <section style={{background:"#fff",borderRadius:14,padding:24,boxShadow:"0 4px 16px #1522440d"}}>
          <div style={{fontSize:12,color:"#697489"}}>CALCULATIE #{draft.calculationId} · VERSIE {draft.version}</div>
          <h2 style={{fontSize:21,margin:"8px 0 14px"}}>{draft.title}</h2>
          <div style={{display:"flex",gap:36,flexWrap:"wrap"}}>
            <div><div style={{fontSize:12,color:"#697489"}}>Regels</div><strong style={{fontSize:25}}>{draft.lines.length}</strong></div>
            <div><div style={{fontSize:12,color:"#697489"}}>Directe kosten (excl. btw)</div><strong style={{fontSize:25}}>{eur.format(total)}</strong></div>
            <div><div style={{fontSize:12,color:"#697489"}}>Project</div><strong>Nog niet gestart</strong></div>
          </div>
        </section>
        <section style={{background:"#fff",borderRadius:14,padding:24,overflowX:"auto",boxShadow:"0 4px 16px #1522440d"}}>
          <h2 style={{fontSize:20,marginTop:0}}>Calculatieregels</h2>
          <table style={{width:"100%",borderCollapse:"collapse",textAlign:"left",minWidth:600}}>
            <thead><tr style={{color:"#6b778b",fontSize:13}}><th style={{padding:12}}>Omschrijving</th><th>Eenheid</th><th>Aantal</th><th>Materiaal/st</th><th>Arbeid/st</th><th style={{textAlign:"right"}}>Totaal</th></tr></thead>
            <tbody>{draft.lines.map(line=><tr key={line.id} style={{borderTop:"1px solid #e8ecf4"}}>
              <td style={{padding:12}}>{line.description}</td><td>{line.unit}</td><td>{Number(line.quantity).toLocaleString("nl-NL")}</td>
              <td>{eur.format(Number(line.material_unit_cost))}</td><td>{eur.format(Number(line.labour_unit_cost))}</td>
              <td style={{textAlign:"right",fontWeight:700}}>{eur.format(Number(line.quantity)*(Number(line.material_unit_cost)+Number(line.labour_unit_cost)))}</td>
            </tr>)}</tbody>
          </table>
          {draft.lines.length===0 && <p style={{color:"#6b778b"}}>Nog geen regels toegevoegd. Begin met een nieuwe calculatieregel.</p>}
        </section>
        <section style={{background:"#fff",borderRadius:14,padding:24,boxShadow:"0 4px 16px #1522440d"}}>
          <h2 style={{fontSize:20,marginTop:0}}>Nieuwe calculatieregel</h2>
          <form onSubmit={event=>void addLine(event)} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:14}}>
            <label style={{gridColumn:"1/-1"}}>Omschrijving<input required maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Bijv. kunststof kozijnen leveren en plaatsen" style={{width:"100%",boxSizing:"border-box",padding:12,border:"1px solid #d4dce9",borderRadius:8,marginTop:5}} /></label>
            {([
              ["Eenheid",unit,setUnit,"text"],
              ["Aantal",quantity,setQuantity,"number"],
              ["Materiaal per eenheid",material,setMaterial,"number"],
              ["Arbeid per eenheid",labour,setLabour,"number"]
            ] as const).map(([label,value,setValue,type])=><label key={label}>{label}
              <input required type={type} min={type==="number"?(label==="Aantal"?"0.0001":"0"):undefined} step={type==="number"?"any":undefined}
                maxLength={type==="text"?32:undefined} value={value} onChange={e=>setValue(e.target.value)}
                style={{width:"100%",boxSizing:"border-box",padding:12,border:"1px solid #d4dce9",borderRadius:8,marginTop:5}} />
            </label>)}
            <div style={{gridColumn:"1/-1",display:"flex",alignItems:"center",gap:15}}>
              <button disabled={busy} type="submit" style={{border:0,borderRadius:8,padding:"13px 20px",background:"#4247aa",color:"#fff",fontWeight:700,cursor:busy?"wait":"pointer"}}>{busy?"Opslaan…":"+ Regel toevoegen"}</button>
              {message && <span role="status" style={{color:"#28704c"}}>{message}</span>}
            </div>
          </form>
        </section>
      </>}
    </main>
  </div>;
}
