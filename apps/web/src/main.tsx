import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Line = {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  labour: number;
  material: number;
  equipment: number;
  subcontracting: number;
};

const lines: Line[] = [
  { code: "21.10", description: "Bestaand kozijn demonteren", unit: "st", quantity: 8, labour: 92.5, material: 0, equipment: 6, subcontracting: 0 },
  { code: "31.20", description: "Kunststof kozijn leveren", unit: "st", quantity: 8, labour: 0, material: 742.35, equipment: 0, subcontracting: 0 },
  { code: "31.30", description: "Kozijn monteren en afwerken", unit: "st", quantity: 8, labour: 186, material: 48.5, equipment: 18, subcontracting: 0 }
];

const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const lineDirect = (line: Line) => line.quantity * (line.labour + line.material + line.equipment + line.subcontracting);
const direct = lines.reduce((sum, line) => sum + lineDirect(line), 0);
const markup = 0.3;
const sales = direct * (1 + markup);

function App() {
  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="mark">B</span><strong>BREBO</strong><span>Calculatie</span></div>
      <nav><a href="#">Office</a><a className="active" href="#">Calculatie</a><a href="#">MJOP</a><a href="#">Planning</a></nav>
      <div className="user">John Boon</div>
    </header>
    <main>
      <div className="context">
        <div><span className="eyebrow">PROJECT</span><h1>Nieuwe calculatie</h1><p>Projectcontext wordt straks rechtstreeks uit BREBO Office geladen.</p></div>
        <button className="secondary">← Terug naar Office</button>
      </div>
      <section className="kpis">
        <div><span>Directe kostprijs</span><strong>{money.format(direct)}</strong></div>
        <div><span>Opslag</span><strong>30,0%</strong></div>
        <div><span>Opslagbedrag</span><strong>{money.format(sales-direct)}</strong></div>
        <div className="primary"><span>Verkoopprijs</span><strong>{money.format(sales)}</strong></div>
      </section>
      <section className="workbench">
        <div className="toolbar"><button>+ Hoofdstuk</button><button>+ Paragraaf</button><button>+ Regel</button><span></span><button className="secondary">Recept</button><button className="secondary">Prijzen</button></div>
        <div className="chapter">▾ 30 &nbsp; Kozijnen en beglazing</div>
        <div className="paragraph">▾ 31 &nbsp; Kozijnen</div>
        <div className="grid">
          <div className="row head"><b>Code</b><b>Omschrijving</b><b>Eenh.</b><b>Aantal</b><b>Arbeid</b><b>Materiaal</b><b>Materieel</b><b>Onderaann.</b><b>Totaal</b></div>
          {lines.map(line => <div className="row" key={line.code}>
            <span>{line.code}</span><span className="desc">{line.description}</span><span>{line.unit}</span><span>{line.quantity.toLocaleString("nl-NL")}</span>
            <span>{money.format(line.labour)}</span><span>{money.format(line.material)}</span><span>{money.format(line.equipment)}</span><span>{money.format(line.subcontracting)}</span><strong>{money.format(lineDirect(line))}</strong>
          </div>)}
          <div className="newrow">+ Nieuwe calculatieregel</div>
        </div>
      </section>
    </main>
  </div>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
