import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type LineType = "chapter" | "paragraph" | "item" | "allowance" | "adjustable" | "option" | "note";
type Line = {
  id: number;
  parentId: number | null;
  lineType: LineType;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  labour: number;
  material: number;
  equipment: number;
  subcontracting: number;
  other: number;
};
type ProjectContext = {
  id: number;
  code: string;
  title: string;
  status: string;
  client_name: string;
  project_kind: string;
  disciplines: string[];
  description: string;
  buildings: Array<{ id: number; title: string }>;
};

const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const isCostLine = (line: Line) => !["chapter", "paragraph", "note"].includes(line.lineType);
const lineDirect = (line: Line) => line.quantity * (line.labour + line.material + line.equipment + line.subcontracting + line.other);

function NumberCell({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input className="cell number" type="number" step="0.01" value={Number.isFinite(value) ? value : 0}
    onChange={event => onChange(Number(event.target.value))} />;
}

function mapServerLine(raw: Record<string, unknown>): Line {
  return {
    id: Number(raw.id),
    parentId: raw.parent_id == null ? null : Number(raw.parent_id),
    lineType: String(raw.line_type) as LineType,
    code: String(raw.code ?? ""),
    description: String(raw.description ?? ""),
    unit: String(raw.unit ?? ""),
    quantity: Number(raw.quantity ?? 0),
    labour: Number(raw.labour_unit_cost ?? 0),
    material: Number(raw.material_unit_cost ?? 0),
    equipment: Number(raw.equipment_unit_cost ?? 0),
    subcontracting: Number(raw.subcontracting_unit_cost ?? 0),
    other: Number(raw.other_unit_cost ?? 0)
  };
}

function App() {
  const [lines, setLines] = useState<Line[]>([]);
  const [project, setProject] = useState<ProjectContext | null>(null);
  const [calculationTitle, setCalculationTitle] = useState("BREBO Calculatie");
  const [markupPct, setMarkupPct] = useState(30);
  const [status, setStatus] = useState("Laden…");
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [nextId, setNextId] = useState(-1);

  const totals = useMemo(() => {
    const direct = lines.filter(line => isCostLine(line) && line.lineType !== "option").reduce((sum, line) => sum + lineDirect(line), 0);
    const markupAmount = direct * (markupPct / 100);
    return { direct, markupAmount, sales: direct + markupAmount };
  }, [lines, markupPct]);

  const loadWorkbench = async () => {
    const response = await fetch("/api/workbench/current", { headers: { Accept: "application/json" } });
    if (response.status === 401) {
      setAuthorized(false);
      setStatus("Open deze calculatie vanuit BREBO Office");
      return;
    }
    if (!response.ok) throw new Error("Werkbank kon niet worden geladen.");
    const data = await response.json();
    const direct = Number(data.version?.direct_cost ?? 0);
    const markupAmount = Number(data.version?.markup_amount ?? 0);
    setMarkupPct(direct !== 0 ? (markupAmount / direct) * 100 : 0);
    setLines(Array.isArray(data.lines) ? data.lines.map((line: Record<string, unknown>) => mapServerLine(line)) : []);
    setProject(data.project as ProjectContext);
    setCalculationTitle(String(data.calculation?.title ?? "BREBO Calculatie"));
    setAuthorized(true);
    setStatus("Opgeslagen");
  };

  useEffect(() => {
    const boot = async () => {
      try {
        const url = new URL(window.location.href);
        if (url.pathname === "/launch") {
          const token = url.searchParams.get("token");
          if (!token) throw new Error("Launch-token ontbreekt.");
          setStatus("Office-koppeling openen…");
          const response = await fetch("/api/launch/consume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
          });
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(String(error.error ?? "Office-link kon niet worden geopend."));
          }
          window.history.replaceState({}, "", "/");
        }
        await loadWorkbench();
      } catch (error) {
        setAuthorized(false);
        setStatus(error instanceof Error ? error.message : "Werkbank kon niet worden geopend.");
      }
    };
    void boot();
  }, []);

  const patchLine = (id: number, patch: Partial<Line>) => {
    setLines(current => current.map(line => line.id === id ? { ...line, ...patch } : line));
    setStatus("Concept — niet opgeslagen");
  };

  const addLine = (lineType: LineType) => {
    const latestChapter = [...lines].reverse().find(line => line.lineType === "chapter");
    const latestParagraph = [...lines].reverse().find(line => line.lineType === "paragraph");
    const parent = lineType === "paragraph" ? latestChapter : (lineType === "chapter" ? undefined : (latestParagraph ?? latestChapter));
    const id = nextId;
    setNextId(id - 1);
    setLines(current => [...current, {
      id,
      parentId: lineType === "chapter" ? null : parent?.id ?? null,
      lineType,
      code: "",
      description: lineType === "chapter" ? "Nieuw hoofdstuk" : lineType === "paragraph" ? "Nieuwe paragraaf" : "",
      unit: lineType === "item" ? "st" : "",
      quantity: lineType === "item" ? 1 : 0,
      labour: 0, material: 0, equipment: 0, subcontracting: 0, other: 0
    }]);
    setStatus("Concept — niet opgeslagen");
  };

  const save = async () => {
    setStatus("Opslaan…");
    try {
      const response = await fetch("/api/workbench/current", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markupPct,
          lines: lines.map((line, index) => ({
            id: line.id,
            parentId: line.parentId,
            sortOrder: index,
            lineType: line.lineType,
            code: line.code,
            description: line.description,
            unit: line.unit,
            quantity: line.quantity,
            labourUnitCost: line.labour,
            materialUnitCost: line.material,
            equipmentUnitCost: line.equipment,
            subcontractingUnitCost: line.subcontracting,
            otherUnitCost: line.other
          }))
        })
      });
      if (!response.ok) throw new Error("Opslaan mislukt");
      setStatus("Opgeslagen");
      await loadWorkbench();
    } catch {
      setStatus("Opslaan mislukt");
    }
  };

  if (authorized === false) {
    return <div className="entry">
      <div className="entryCard">
        <span className="mark">B</span>
        <h1>BREBO Calculatie</h1>
        <p>{status}</p>
        <p className="muted">Calculaties worden vanuit BREBO Office geopend. Daarmee blijven projectcontext, rechten en databron centraal beheerd.</p>
      </div>
    </div>;
  }

  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="mark">B</span><strong>BREBO</strong><span>Calculatie</span></div>
      <nav><a href="#">Office</a><a className="active" href="#">Calculatie</a><a href="https://mjop.brebobv.nl">MJOP</a><a href="https://planning.brebobv.nl">Planning</a></nav>
      <div className="user">BREBO</div>
    </header>

    <main>
      <div className="context">
        <div>
          <span className="eyebrow">{project?.code ? `PROJECT · ${project.code}` : "PROJECT"}</span>
          <h1>{calculationTitle}</h1>
          <p>{project?.title ?? "Projectcontext laden…"} · {status}</p>
          {project?.client_name && <p className="projectMeta">Opdrachtgever: {project.client_name}{project.project_kind ? ` · ${project.project_kind}` : ""}</p>}
        </div>
        <div className="contextActions"><button className="secondary" onClick={() => window.history.back()}>← Office</button><button onClick={save}>Opslaan</button></div>
      </div>

      <section className="kpis">
        <div><span>Directe kostprijs</span><strong>{money.format(totals.direct)}</strong></div>
        <div><span>Opslag op inkoop</span><strong><input className="markup" type="number" step="0.1" value={markupPct} onChange={e => { setMarkupPct(Number(e.target.value)); setStatus("Concept — niet opgeslagen"); }} />%</strong></div>
        <div><span>Opslagbedrag</span><strong>{money.format(totals.markupAmount)}</strong></div>
        <div className="primary"><span>Verkoopprijs</span><strong>{money.format(totals.sales)}</strong></div>
      </section>

      <section className="workbench">
        <div className="toolbar">
          <button onClick={() => addLine("chapter")}>+ Hoofdstuk</button>
          <button onClick={() => addLine("paragraph")}>+ Paragraaf</button>
          <button onClick={() => addLine("item")}>+ Regel</button>
          <span />
          <button className="secondary">Recept</button>
          <button className="secondary">Prijzen</button>
        </div>

        <div className="grid">
          <div className="row head"><b>Code</b><b>Omschrijving</b><b>Type</b><b>Eenh.</b><b>Aantal</b><b>Arbeid</b><b>Materiaal</b><b>Materieel</b><b>OA</b><b>Overig</b><b>Totaal</b></div>
          {lines.map(line => {
            if (line.lineType === "chapter" || line.lineType === "paragraph") {
              return <div className={line.lineType} key={line.id}>
                <input value={line.code} onChange={e => patchLine(line.id, { code: e.target.value })} />
                <span>▾</span>
                <input value={line.description} onChange={e => patchLine(line.id, { description: e.target.value })} />
              </div>;
            }
            return <div className={`row data type-${line.lineType}`} key={line.id}>
              <input className="cell" value={line.code} onChange={e => patchLine(line.id, { code: e.target.value })} />
              <input className="cell desc" value={line.description} onChange={e => patchLine(line.id, { description: e.target.value })} />
              <select className="cell" value={line.lineType} onChange={e => patchLine(line.id, { lineType: e.target.value as LineType })}>
                <option value="item">Regel</option><option value="allowance">Stelpost</option><option value="adjustable">Verrekenbaar</option><option value="option">Optie</option><option value="note">Notitie</option>
              </select>
              <input className="cell" value={line.unit} onChange={e => patchLine(line.id, { unit: e.target.value })} />
              <NumberCell value={line.quantity} onChange={quantity => patchLine(line.id, { quantity })} />
              <NumberCell value={line.labour} onChange={labour => patchLine(line.id, { labour })} />
              <NumberCell value={line.material} onChange={material => patchLine(line.id, { material })} />
              <NumberCell value={line.equipment} onChange={equipment => patchLine(line.id, { equipment })} />
              <NumberCell value={line.subcontracting} onChange={subcontracting => patchLine(line.id, { subcontracting })} />
              <NumberCell value={line.other} onChange={other => patchLine(line.id, { other })} />
              <strong>{line.lineType === "note" ? "—" : money.format(lineDirect(line))}</strong>
            </div>;
          })}
          <button className="newrow" onClick={() => addLine("item")}>+ Nieuwe calculatieregel</button>
        </div>
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
