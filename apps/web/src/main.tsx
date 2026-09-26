import React, { useMemo, useState } from "react";
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

const initialLines: Line[] = [
  { id: 1, parentId: null, lineType: "chapter", code: "30", description: "Kozijnen en beglazing", unit: "", quantity: 0, labour: 0, material: 0, equipment: 0, subcontracting: 0, other: 0 },
  { id: 2, parentId: 1, lineType: "paragraph", code: "31", description: "Kozijnen", unit: "", quantity: 0, labour: 0, material: 0, equipment: 0, subcontracting: 0, other: 0 },
  { id: 3, parentId: 2, lineType: "item", code: "31.10", description: "Bestaand kozijn demonteren", unit: "st", quantity: 8, labour: 92.5, material: 0, equipment: 6, subcontracting: 0, other: 0 },
  { id: 4, parentId: 2, lineType: "item", code: "31.20", description: "Kunststof kozijn leveren", unit: "st", quantity: 8, labour: 0, material: 742.35, equipment: 0, subcontracting: 0, other: 0 },
  { id: 5, parentId: 2, lineType: "item", code: "31.30", description: "Kozijn monteren en afwerken", unit: "st", quantity: 8, labour: 186, material: 48.5, equipment: 18, subcontracting: 0, other: 0 }
];

const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const isCostLine = (line: Line) => !["chapter", "paragraph", "note"].includes(line.lineType);
const lineDirect = (line: Line) => line.quantity * (line.labour + line.material + line.equipment + line.subcontracting + line.other);

function NumberCell({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input className="cell number" type="number" step="0.01" value={Number.isFinite(value) ? value : 0}
    onChange={event => onChange(Number(event.target.value))} />;
}

function App() {
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [markupPct, setMarkupPct] = useState(30);
  const [status, setStatus] = useState("Concept — lokaal gewijzigd");
  const [nextId, setNextId] = useState(6);

  const totals = useMemo(() => {
    const direct = lines.filter(line => isCostLine(line) && line.lineType !== "option").reduce((sum, line) => sum + lineDirect(line), 0);
    const markupAmount = direct * (markupPct / 100);
    return { direct, markupAmount, sales: direct + markupAmount };
  }, [lines, markupPct]);

  const patchLine = (id: number, patch: Partial<Line>) => {
    setLines(current => current.map(line => line.id === id ? { ...line, ...patch } : line));
    setStatus("Concept — niet opgeslagen");
  };

  const addLine = (lineType: LineType) => {
    const parent = [...lines].reverse().find(line => line.lineType === "paragraph") ?? [...lines].reverse().find(line => line.lineType === "chapter");
    const id = nextId;
    setNextId(id + 1);
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
      const calculationId = new URLSearchParams(window.location.search).get("id");
      if (!calculationId) {
        setStatus("Demo — voeg ?id=<calculatie-id> toe na koppeling met API");
        return;
      }
      const response = await fetch(`/api/calculations/${calculationId}/workbench`, {
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
    } catch {
      setStatus("Opslaan mislukt");
    }
  };

  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="mark">B</span><strong>BREBO</strong><span>Calculatie</span></div>
      <nav><a href="https://office.brebobv.nl">Office</a><a className="active" href="#">Calculatie</a><a href="https://mjop.brebobv.nl">MJOP</a><a href="https://planning.brebobv.nl">Planning</a></nav>
      <div className="user">John Boon</div>
    </header>

    <main>
      <div className="context">
        <div><span className="eyebrow">PROJECT</span><h1>Nieuwe calculatie</h1><p>Werkblad · {status}</p></div>
        <div className="contextActions"><button className="secondary">← Office</button><button onClick={save}>Opslaan</button></div>
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
