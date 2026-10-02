/// <reference types="vite/client" />
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import "./styles.css";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type LineType = "chapter" | "paragraph" | "item" | "allowance" | "adjustable" | "option" | "note";
type PriceSourceType = "manual" | "article" | "recipe" | "supplier_quote";
type Line = {
  id: number;
  parentId: number | null;
  structureKey?: string | null;
  lineType: LineType;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  labourNorm: number | null;
  labourTotalHours: number | null;
  labourHoursInputMode: "norm" | "total_hours" | null;
  labour: number;
  material: number;
  equipment: number;
  subcontracting: number;
  other: number;
  vatRegimeId?: number | null;
  priceSourceType: PriceSourceType;
  officeSourceId: string | null;
  sourceReference: string | null;
  sourceSupplier: string | null;
  sourceUnitPrice: number | null;
  sourcePriceDate: string | null;
  sourceDocumentId: string | null;
  sourceDetails: string | null;
  sourceVisualPage: number | null;
  sourcePositionBounds: VisualCrop | null;
  sourceVisualCrop: VisualCrop | null;
  sourceVisualSearchRegion: VisualCrop | null;
  sourceTextRegions: VisualCrop[] | null;
  sourceOfferSummary: string | null;
  resolutionStatus?: "resolved" | "unresolved";
  resolutionReason?: string | null;
};
type ColumnKey = "code"|"description"|"type"|"unit"|"quantity"|"norm"|"hours"|"hourlyRate"|"material"|"equipment"|"subcontracting"|"other"|"vat"|"total";
type ColumnSetting = { key: ColumnKey; label: string; width: number; visible: boolean };
const defaultColumns: ColumnSetting[] = [
  { key:"code", label:"Code", width:90, visible:true },
  { key:"description", label:"Omschrijving", width:300, visible:true },
  { key:"type", label:"Type", width:110, visible:true },
  { key:"unit", label:"Eenh.", width:65, visible:true },
  { key:"quantity", label:"Aantal", width:75, visible:true },
  { key:"norm", label:"Norm", width:90, visible:true },
  { key:"hours", label:"Totaal uren", width:100, visible:true },
  { key:"hourlyRate", label:"Uurprijs", width:100, visible:true },
  { key:"material", label:"Materiaal", width:105, visible:true },
  { key:"equipment", label:"Materieel", width:105, visible:true },
  { key:"subcontracting", label:"OA", width:100, visible:true },
  { key:"other", label:"Overig", width:100, visible:true },
  { key:"vat", label:"BTW", width:120, visible:true },
  { key:"total", label:"Totaal", width:125, visible:true }
];
const columnPrefsKey = "brebo.calc.columns.v1";
function loadColumnSettings(): ColumnSetting[] {
  try {
    const raw = localStorage.getItem(columnPrefsKey);
    if (!raw) return defaultColumns;
    const parsed = JSON.parse(raw) as ColumnSetting[];
    const byKey = new Map(parsed.map(item => [item.key,item]));
    return defaultColumns.map(def => {
      const saved = byKey.get(def.key);
      return saved ? { ...def, visible: saved.visible !== false, width: Math.max(55, Math.min(600, Number(saved.width) || def.width)) } : def;
    }).sort((a,b) => parsed.findIndex(x=>x.key===a.key)-parsed.findIndex(x=>x.key===b.key));
  } catch { return defaultColumns; }
}

type QuoteCandidate = { value: number; score: number; line_no: number; text: string };
type VisualCrop = { x: number; y: number; width: number; height: number };
type QuoteLine = { position: string; quantity: number; unit: string; description: string; details?: string; detail_fields?: Record<string,string>; offer_summary?: string; source_page?: number | null; source_position_bounds?: VisualCrop | null; source_visual_crop?: VisualCrop | null; source_visual_search_region?: VisualCrop | null; source_text_regions?: VisualCrop[] | null; unit_price: number; line_total: number; line_no: number };
type QuoteClassification = { discipline: string; element: string; material: string; type: string; confidence: number };
type ClassificationScheme = "nl_sfb" | "stabu" | "custom";
type StructureTarget = { group: string; paragraph: string };
type QuoteProposal = {
  status: string;
  target: { description: string; quantity: number | null; unit: string };
  classification: QuoteClassification | null;
  lines: QuoteLine[];
  candidates: QuoteCandidate[];
  suggested: QuoteCandidate | null;
  fileId: number;
  filename: string;
  targetLineId: number | null;
};

type CostCarrier = "labour" | "material" | "equipment" | "subcontracting" | "other";
type LineAllocation = { sourceLineId:number; targetLineId:number; method:"quantity"|"value"|"manual"; share:number; amount:number };

type ArticleSearchItem = {
  article_id: number;
  supplier_article_id: number;
  price_id: number;
  catalog_import_id: number;
  code: string;
  description: string;
  cost_category: string;
  supplier: string;
  supplier_article_no: string;
  product_group: string | null;
  unit: string;
  net_price: number;
  price_date: string;
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

type WorkbenchAggregate = {
  contract: "brebo-calc-workbench-aggregate-v1";
  officeVersion: string;
  editable: boolean;
  concept: {
    positions: Array<{
      positionRef: string;
      quantity: number;
      widthMm: number;
      heightMm: number;
      description: string | null;
      reviewStatus: "reviewed" | "proposed";
      warnings: string[];
    }>;
    unresolved: string[];
  };
  recipeProposals: Array<{
    positionRef: string;
    recipeRef: string;
    label: string;
    confidence: number;
    reasons: string[];
    reviewRequired: boolean;
  }>;
  takeoffs: Array<{
    id: number;
    position_ref: string;
    quantity: number;
    width_mm: number | null;
    height_mm: number | null;
    area_m2: number | null;
    perimeter_m: number | null;
    top_m: number | null;
    bottom_m: number | null;
    left_m: number | null;
    right_m: number | null;
  }>;
  structure: Array<{
    node_key: string;
    parent_key: string | null;
    node_type: string;
    depth: number;
    code: string | null;
    label: string;
  }>;
  readiness: unknown;
};

type CalcRecipe = {
  id:number;
  recipeId:number;
  recipeKey:string;
  name:string;
  description:string|null;
  versionNo:number;
  status:"draft"|"published"|"archived";
  applicability:Record<string,unknown>|null;
  lines:Array<{
    id:number;
    lineRef:string;
    sortOrder:number;
    costKind:"material"|"labour"|"equipment"|"subcontracting"|"other";
    description:string;
    unit:string|null;
    quantitySourceType:string|null;
    quantitySourceRef:string|null;
    costSourceType:string|null;
    costSourceRef:string|null;
    takeoffBasis:"area"|"perimeter"|"two_sides_plus_head"|"width"|"height"|"part_area"|"internal_joint"|"fixed";
    factor:number;
    wastePct:number;
    fixedQuantity:number|null;
  }>;
};

type CalcSubcalculation = {
  id:number;
  versionId:number;
  ref:string;
  description:string;
  dimensionType:string;
  dimensionRef:string|null;
  sortOrder:number;
  scopes:Array<{
    id:number;
    scopeType:"building"|"facade"|"dwelling"|"dwelling_type"|"building_part"|"position"|"structure"|"recipe"|"custom";
    scopeRef:string;
    includeDescendants:boolean;
    sortOrder:number;
  }>;
};

type CalcSubcalculationResult = {
  id:number;
  ref:string;
  description:string;
  lineIds:number[];
  directCost:number;
  costs:{labour:number;material:number;equipment:number;subcontracting:number;other:number};
  directShare:number;
  allocatedTailCost:number;
  salesPrice:number;
};

type VatRegime={
  id:number;
  code:string;
  label:string;
  treatment:"normal"|"reverse_charge"|"exempt";
  rate:number|null;
  active:boolean;
  sortOrder:number;
};

type TailCostComponent={
  id:number;versionId:number;ownerType:"calculation"|"subcalculation";ownerRef:string|null;
  componentKey:string;description:string;basis:"fixed"|"percentage"|"per_unit";
  value:number;baseScope:"direct_cost"|"running_total"|"selected_lines"|"subcalculation"|"quantity"|"owner_direct_cost"|"owner_running_total"|"consolidated_direct_cost"|"consolidated_running_total";
  baseRef:string|null;quantity:number|null;vatRegimeId:number|null;sortOrder:number;active:boolean;
};
type EvaluatedTailCost=TailCostComponent & {baseAmount:number;amount:number;ownerRunningTotal:number;consolidatedRunningTotal:number};

const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const isCostLine = (line: Line) => !["chapter", "paragraph", "note"].includes(line.lineType);
const lineDirect = (line: Line) => (line.labourTotalHours ?? 0) * line.labour + line.quantity * (line.material + line.equipment + line.subcontracting + line.other);

const classificationScheme: ClassificationScheme = "custom";
const sourceDetailLabels = ["Systeem","Uw-waarde","Omschrijving deur","Kleur","Profielen","Beglazing","Beschläge","Deurbeslag","Deurbeslagpakket","Ontwatering","Gewicht positie","Ventilatierooster","Bovenste sluiter","Bander","Drukknop","Rozet","PZ-cilinder","Slot"];
function parseSourceDetails(details: string | null): Array<[string,string]> {
  if (!details?.trim()) return [];
  const escaped = sourceDetailLabels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const normalized = details.replace(new RegExp("\\s*(?=(?:" + escaped + ")\\s*:)", "gi"), "\n");
  const rows: Array<[string,string]> = [];
  for (const raw of normalized.split(/\r?\n/)) {
    const line = raw.trim().replace(/\s+/g, " ");
    const match = line.match(new RegExp("^(" + escaped + ")\\s*:\\s*(.*)$", "i"));
    if (match) rows.push([match[1], match[2].trim()]);
    else if (line && rows.length) rows[rows.length - 1][1] = (rows[rows.length - 1][1] + " " + line).trim();
  }
  return rows;
}


function mapClassification(classification: QuoteClassification | null, scheme: ClassificationScheme): StructureTarget | null {
  if (!classification) return null;
  // Mapping belongs to the selected calculation scheme, never to document recognition.
  // NL-SfB and STABU mappings are deliberately configuration-driven follow-up work.
  if (scheme === "custom" && classification.element === "kozijn" && classification.material === "staal") {
    return { group: "Kozijnen", paragraph: "Stalen kozijnen en deuren" };
  }
  return null;
}


type IconName = "office" | "save" | "chapter" | "paragraph" | "line" | "recipe" | "prices";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    office: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></>,
    save: <><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h9V3"/><path d="M7 21v-8h10v8"/></>,
    chapter: <><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/><path d="M8 3v4"/><path d="M8 10v4"/><path d="M8 17v4"/></>,
    paragraph: <><path d="M5 5h14"/><path d="M8 10h11"/><path d="M8 15h11"/><path d="M8 20h7"/><path d="M4 9v7"/></>,
    line: <><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/><path d="M18 16v6"/><path d="M15 19h6"/></>,
    recipe: <><path d="M6 3h12v18H6z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/></>,
    prices: <><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.8-.8-1.8-1.2-3-1.2-1.7 0-3 1-3 2.3 0 3.2 6 1.8 6 5 0 1.4-1.3 2.4-3 2.4-1.3 0-2.5-.4-3.4-1.3"/><path d="M12 5v14"/></>
  };
  return <svg className="commandIcon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}


function NumberCell({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input className="cell number" type="number" step="0.01" value={Number.isFinite(value) ? value : 0}
    onChange={event => onChange(Number(event.target.value))} />;
}

function detectVisualCrop(full: HTMLCanvasElement, region: VisualCrop, textRegions: VisualCrop[] = [], anchor?: VisualCrop | null): VisualCrop | null {
  const rx=Math.max(0,Math.floor(full.width*region.x));
  const ry=Math.max(0,Math.floor(full.height*region.y));
  const rw=Math.max(1,Math.min(full.width-rx,Math.floor(full.width*region.width)));
  const rh=Math.max(1,Math.min(full.height-ry,Math.floor(full.height*region.height)));
  const probe=document.createElement("canvas");
  const scale=Math.min(1,650/Math.max(rw,rh));
  probe.width=Math.max(1,Math.floor(rw*scale));
  probe.height=Math.max(1,Math.floor(rh*scale));
  const ctx=probe.getContext("2d",{willReadFrequently:true});
  if(!ctx)return null;
  ctx.drawImage(full,rx,ry,rw,rh,0,0,probe.width,probe.height);

  ctx.fillStyle="#fff";
  for(const t of textRegions){
    const x0=Math.max(0,Math.floor(((t.x-region.x)/region.width)*probe.width)-4);
    const y0=Math.max(0,Math.floor(((t.y-region.y)/region.height)*probe.height)-4);
    const x1=Math.min(probe.width,Math.ceil((((t.x+t.width)-region.x)/region.width)*probe.width)+4);
    const y1=Math.min(probe.height,Math.ceil((((t.y+t.height)-region.y)/region.height)*probe.height)+4);
    if(x1>x0&&y1>y0)ctx.fillRect(x0,y0,x1-x0,y1-y0);
  }

  const img=ctx.getImageData(0,0,probe.width,probe.height);
  const W=probe.width,H=probe.height, dark=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const p=(y*W+x)*4;
    const gray=(img.data[p]+img.data[p+1]+img.data[p+2])/3;
    if(gray<205&&img.data[p+3]>50)dark[y*W+x]=1;
  }

  // Extract long orthogonal runs. Product drawings tend to contain persistent
  // horizontal/vertical geometry; residual glyph fragments generally do not.
  const structural=new Uint8Array(W*H);
  const minH=Math.max(10,Math.floor(W*0.025));
  const minV=Math.max(10,Math.floor(H*0.025));
  for(let y=0;y<H;y++){
    let s=-1;
    for(let x=0;x<=W;x++){
      const on=x<W&&dark[y*W+x];
      if(on&&s<0)s=x;
      if((!on||x===W)&&s>=0){
        const e=x-1;
        if(e-s+1>=minH)for(let xx=s;xx<=e;xx++)structural[y*W+xx]=1;
        s=-1;
      }
    }
  }
  for(let x=0;x<W;x++){
    let s=-1;
    for(let y=0;y<=H;y++){
      const on=y<H&&dark[y*W+x];
      if(on&&s<0)s=y;
      if((!on||y===H)&&s>=0){
        const e=y-1;
        if(e-s+1>=minV)for(let yy=s;yy<=e;yy++)structural[yy*W+x]=1;
        s=-1;
      }
    }
  }

  // Grow structural runs slightly, then collect candidate drawing clusters.
  const grown=new Uint8Array(W*H),R=5;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(structural[y*W+x]){
    for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
      const nx=x+dx,ny=y+dy;
      if(nx>=0&&ny>=0&&nx<W&&ny<H)grown[ny*W+nx]=1;
    }
  }

  const seen=new Uint8Array(W*H);
  const qx=new Int32Array(W*H),qy=new Int32Array(W*H);
  let best:{x0:number;y0:number;x1:number;y1:number;score:number}|null=null;

  const anchorCx=anchor ? ((anchor.x+anchor.width/2-region.x)/region.width)*W : W*0.5;
  const anchorCy=anchor ? ((anchor.y+anchor.height-region.y)/region.height)*H : 0;

  for(let sy=0;sy<H;sy++)for(let sx=0;sx<W;sx++){
    const si=sy*W+sx;
    if(!grown[si]||seen[si])continue;
    let head=0,tail=0,x0=sx,x1=sx,y0=sy,y1=sy,structPixels=0,darkPixels=0;
    qx[tail]=sx;qy[tail++]=sy;seen[si]=1;
    while(head<tail){
      const x=qx[head],y=qy[head++];
      if(structural[y*W+x])structPixels++;
      if(dark[y*W+x])darkPixels++;
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const){
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=W||ny>=H)continue;
        const ni=ny*W+nx;
        if(grown[ni]&&!seen[ni]){seen[ni]=1;qx[tail]=nx;qy[tail++]=ny;}
      }
    }
    const bw=x1-x0+1,bh=y1-y0+1,area=bw*bh;
    if(bw<W*0.06||bh<H*0.06||area<W*H*0.004)continue;
    const aspect=Math.min(bw,bh)/Math.max(bw,bh);
    const lineScore=structPixels/Math.max(1,area);
    const inkDensity=darkPixels/Math.max(1,area);
    if(lineScore<0.002||inkDensity>0.32)continue;

    const cx=(x0+x1)/2,cy=(y0+y1)/2;
    const dist=Math.hypot((cx-anchorCx)/W,(cy-anchorCy)/H);
    const proximity=1/Math.max(0.15,dist);
    const rectangularity=0.55+aspect;
    const sizeScore=Math.sqrt(area/(W*H));
    const score=sizeScore*rectangularity*proximity*(1+Math.min(2,lineScore*90))*(1-Math.min(0.8,inkDensity));
    if(!best||score>best.score)best={x0,y0,x1,y1,score};
  }
  if(!best)return null;

  // Expand from structural skeleton to include nearby dimension lines and thin
  // drawing strokes, but not distant masked text.
  let x0=Math.max(0,best.x0-12),y0=Math.max(0,best.y0-12);
  let x1=Math.min(W-1,best.x1+12),y1=Math.min(H-1,best.y1+12);
  for(let pass=0;pass<2;pass++){
    const margin=10;
    let nx0=x0,ny0=y0,nx1=x1,ny1=y1;
    for(let y=Math.max(0,y0-margin);y<=Math.min(H-1,y1+margin);y++)for(let x=Math.max(0,x0-margin);x<=Math.min(W-1,x1+margin);x++){
      if(!dark[y*W+x])continue;
      if(x>=x0-margin&&x<=x1+margin&&y>=y0-margin&&y<=y1+margin){
        nx0=Math.min(nx0,x);ny0=Math.min(ny0,y);nx1=Math.max(nx1,x);ny1=Math.max(ny1,y);
      }
    }
    x0=nx0;y0=ny0;x1=nx1;y1=ny1;
  }

  return{
    x:region.x+(x0/W)*region.width,
    y:region.y+(y0/H)*region.height,
    width:((x1-x0+1)/W)*region.width,
    height:((y1-y0+1)/H)*region.height
  };
}

function SourceVisual({ fileId, page, label, crop, searchRegion, textRegions, anchor, onDetected }: {
  fileId: string | number; page: number; label: string; crop?: VisualCrop | null;
  searchRegion?: VisualCrop | null; textRegions?: VisualCrop[] | null; anchor?: VisualCrop | null; onDetected?: (crop: VisualCrop) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<"loading"|"ready"|"none">("loading");
  const [detectedCrop, setDetectedCrop] = useState<VisualCrop | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!crop && !searchRegion) { setState("none"); return; }
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const response = await fetch("/api/quotes/" + fileId + "/preview");
        if (!response.ok) throw new Error("PDF source unavailable");
        const bytes = new Uint8Array(await response.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        const pdfPage = await pdf.getPage(page);
        const viewport = pdfPage.getViewport({ scale: 1.7 });
        const full = document.createElement("canvas");
        full.width = Math.ceil(viewport.width); full.height = Math.ceil(viewport.height);
        const context = full.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        await pdfPage.render({ canvas: full, canvasContext: context, viewport }).promise;
        if (cancelled) return;

        const resolved = crop ?? (searchRegion ? detectVisualCrop(full, searchRegion, textRegions ?? [], anchor) : null);
        if (!resolved) { setDetectedCrop(null); setState("none"); return; }
        setDetectedCrop(resolved);
        if (!crop && onDetected) onDetected(resolved);

        const sx=Math.max(0,Math.floor(full.width*resolved.x)), sy=Math.max(0,Math.floor(full.height*resolved.y));
        const sw=Math.max(1,Math.min(full.width-sx,Math.floor(full.width*resolved.width)));
        const sh=Math.max(1,Math.min(full.height-sy,Math.floor(full.height*resolved.height)));
        const canvas=canvasRef.current;
        if (!canvas) return;
        canvas.width=sw; canvas.height=sh;
        const target=canvas.getContext("2d");
        if (!target) throw new Error("Canvas unavailable");
        target.drawImage(full,sx,sy,sw,sh,0,0,sw,sh);
        setState("ready");
      } catch {
        if (!cancelled) setState("none");
      }
    })();
    return () => { cancelled=true; };
  }, [fileId,page,crop?.x,crop?.y,crop?.width,crop?.height,searchRegion?.x,searchRegion?.y,searchRegion?.width,searchRegion?.height,textRegions,anchor?.x,anchor?.y,anchor?.width,anchor?.height]);

  if ((!crop && !searchRegion) || state==="none") return null;
  return <div className="sourceVisualWrap sourceVisualCrop">
    <canvas ref={canvasRef} aria-label={label} />
    {state==="loading" && <small>Positiebeeld zoeken…</small>}
    {state==="ready" && <small>Automatisch herkend positiebeeld · pagina {page}</small>}
    <details className="sourceVisualDebug" onClick={event => event.stopPropagation()}>
      <summary>Beelddetectie debug</summary>
      <pre>{JSON.stringify({ page, mode: crop ? "bestaande crop" : "dynamische detectie", existing_crop: crop ?? null, detected_crop: detectedCrop, position_bounds: anchor ?? null, search_region: searchRegion ?? null, text_regions_count: textRegions?.length ?? 0, text_regions: textRegions ?? [] }, null, 2)}</pre>
    </details>
  </div>;
}

function mapServerLine(raw: Record<string, unknown>): Line {
  return {
    id: Number(raw.id),
    parentId: raw.parent_id == null ? null : Number(raw.parent_id),
    structureKey: raw.structure_key == null ? null : String(raw.structure_key),
    lineType: String(raw.line_type) as LineType,
    code: String(raw.code ?? ""),
    description: String(raw.description ?? ""),
    unit: String(raw.unit ?? ""),
    quantity: Number(raw.quantity ?? 0),
    labourNorm: raw.labour_norm == null ? null : Number(raw.labour_norm),
    labourTotalHours: raw.labour_total_hours == null ? null : Number(raw.labour_total_hours),
    labourHoursInputMode: raw.labour_hours_input_mode === "norm" || raw.labour_hours_input_mode === "total_hours" ? raw.labour_hours_input_mode : null,
    labour: Number(raw.labour_unit_cost ?? 0),
    material: Number(raw.material_unit_cost ?? 0),
    equipment: Number(raw.equipment_unit_cost ?? 0),
    subcontracting: Number(raw.subcontracting_unit_cost ?? 0),
    other: Number(raw.other_unit_cost ?? 0),
    vatRegimeId: raw.vat_regime_id == null ? null : Number(raw.vat_regime_id),
    priceSourceType: String(raw.price_source_type ?? "manual") as PriceSourceType,
    officeSourceId: raw.office_source_id == null ? null : String(raw.office_source_id),
    sourceReference: raw.source_reference == null ? null : String(raw.source_reference),
    sourceSupplier: raw.source_supplier == null ? null : String(raw.source_supplier),
    sourceUnitPrice: raw.source_unit_price == null ? null : Number(raw.source_unit_price),
    sourcePriceDate: raw.source_price_date == null ? null : String(raw.source_price_date),
    sourceDocumentId: raw.source_document_id == null ? null : String(raw.source_document_id),
    sourceDetails: raw.source_details == null ? null : String(raw.source_details),
    sourceVisualPage: raw.source_visual_page == null ? null : Number(raw.source_visual_page),
    sourcePositionBounds: raw.source_position_bounds ? JSON.parse(String(raw.source_position_bounds)) as VisualCrop : null,
    sourceVisualCrop: raw.source_visual_crop ? JSON.parse(String(raw.source_visual_crop)) as VisualCrop : null,
    sourceVisualSearchRegion: raw.source_visual_search_region ? JSON.parse(String(raw.source_visual_search_region)) as VisualCrop : null,
    sourceTextRegions: raw.source_text_regions ? JSON.parse(String(raw.source_text_regions)) as VisualCrop[] : null,
    sourceOfferSummary: raw.source_offer_summary == null ? null : String(raw.source_offer_summary)
  };
}

function App() {
  const [lines, setLines] = useState<Line[]>([]);
  const [project, setProject] = useState<ProjectContext | null>(null);
  const [calculationTitle, setCalculationTitle] = useState("BREBO Calculatie");
  const [status, setStatus] = useState("Laden…");
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [nextId, setNextId] = useState(-1);
  const [priceWorkspaceOpen, setPriceWorkspaceOpen] = useState(false);
  const [recipeWorkspaceOpen, setRecipeWorkspaceOpen] = useState(false);
  const [recipeLibraryOpen, setRecipeLibraryOpen] = useState(false);
  const [subcalculationOpen, setSubcalculationOpen] = useState(false);
  const [recipes, setRecipes] = useState<CalcRecipe[]>([]);
  const [subcalculations, setSubcalculations] = useState<CalcSubcalculation[]>([]);
  const [subcalculationResults,setSubcalculationResults]=useState<CalcSubcalculationResult[]>([]);
  const [activeSubcalculationId,setActiveSubcalculationId]=useState<number|null>(null);
  const [selectedRecipeVersionId, setSelectedRecipeVersionId] = useState<number | null>(null);
  const [recipeDraft, setRecipeDraft] = useState({ recipeKey:"", name:"", description:"" });
  const [recipeLineDraft, setRecipeLineDraft] = useState({
    lineRef:"", description:"", costKind:"material", unit:"st", takeoffBasis:"fixed",
    quantitySourceType:"", quantitySourceRef:"", costSourceType:"article", costSourceRef:"",
    factor:1, wastePct:0, fixedQuantity:1
  });
  const [subcalcDraft, setSubcalcDraft] = useState({ ref:"", description:"" });
  const [subcalcScopeDraft, setSubcalcScopeDraft] = useState({ subcalculationId:0, scopeType:"position", scopeRef:"" });
  const [managementStatus, setManagementStatus] = useState("");
  const [aggregate, setAggregate] = useState<WorkbenchAggregate | null>(null);
  const [recipeParagraphKey, setRecipeParagraphKey] = useState("");
  const [selectedTakeoffByPosition, setSelectedTakeoffByPosition] = useState<Record<string,number>>({});
  const [recipeActionStatus, setRecipeActionStatus] = useState("");
  const [priceSearch, setPriceSearch] = useState("");
  const [articleResults, setArticleResults] = useState<ArticleSearchItem[]>([]);
  const [articleSearchStatus, setArticleSearchStatus] = useState("Zoek in de centrale Office-artikelstam.");
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<number[]>([]);
  const [allocations, setAllocations] = useState<LineAllocation[]>([]);
  const [quoteStatus, setQuoteStatus] = useState("Selecteer eerst een calculatieregel.");
  const [quoteProposal, setQuoteProposal] = useState<QuoteProposal | null>(null);
  const [quoteCarrier, setQuoteCarrier] = useState<CostCarrier>("subcontracting");
  const [selectedQuotePositions, setSelectedQuotePositions] = useState<string[]>([]);
  const [columnSettings, setColumnSettings] = useState<ColumnSetting[]>(() => loadColumnSettings());
  const [columnPreferencesLoaded,setColumnPreferencesLoaded]=useState(false);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [vatRegimes,setVatRegimes]=useState<VatRegime[]>([]);
  const [vatSettingsStatus,setVatSettingsStatus]=useState("");
  const [vatRegimeDraft,setVatRegimeDraft]=useState({
    code:"",
    label:"",
    treatment:"normal" as VatRegime["treatment"],
    rate:null as number|null,
    active:true,
    sortOrder:0
  });
  const [tailCostOpen,setTailCostOpen]=useState(false);
  const [tailCosts,setTailCosts]=useState<TailCostComponent[]>([]);
  const [evaluatedTailCosts,setEvaluatedTailCosts]=useState<EvaluatedTailCost[]>([]);
  const [tailCostTotal,setTailCostTotal]=useState(0);
  const [mainDirectCost,setMainDirectCost]=useState(0);
  const [tailCostDraft,setTailCostDraft]=useState({
    ownerType:"calculation",ownerRef:"",componentKey:"",description:"",basis:"percentage",value:0,
    baseScope:"owner_direct_cost",baseRef:"",quantity:null as number|null,vatRegimeId:null as number|null
  });
  const [tailCostStatus,setTailCostStatus]=useState("");
  const quoteFileRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(() => {
    const direct = lines.filter(line => isCostLine(line) && line.lineType !== "option").reduce((sum, line) => sum + lineDirect(line), 0);
    const tailCost = tailCostTotal;
    return { direct, markupAmount: tailCost, sales: direct + tailCost };
  }, [lines, tailCostTotal]);

  const unresolvedLines = useMemo(
    () => lines.filter(line => line.resolutionStatus === "unresolved"),
    [lines]
  );
  const calculationReady = unresolvedLines.length === 0;

  const activeSubcalculationResult = useMemo(
    () => activeSubcalculationId == null ? null : subcalculationResults.find(row => row.id === activeSubcalculationId) ?? null,
    [activeSubcalculationId, subcalculationResults]
  );

  const workbenchLines = useMemo(() => {
    if (!activeSubcalculationResult) return lines;
    const included = new Set(activeSubcalculationResult.lineIds);
    const lineById = new Map(lines.map(line => [line.id, line]));
    for (const id of [...included]) {
      let parentId = lineById.get(id)?.parentId ?? null;
      while (parentId != null) {
        if (included.has(parentId)) break;
        included.add(parentId);
        parentId = lineById.get(parentId)?.parentId ?? null;
      }
    }
    return lines.filter(line => included.has(line.id));
  }, [lines, activeSubcalculationResult]);

  const displayedTotals = activeSubcalculationResult
    ? {
        direct: activeSubcalculationResult.directCost,
        markupAmount: activeSubcalculationResult.allocatedTailCost,
        sales: activeSubcalculationResult.salesPrice
      }
    : totals;
  const visibleColumns = useMemo(() => columnSettings.filter(column => column.visible), [columnSettings]);
  const gridTemplateColumns = useMemo(() => visibleColumns.map(column => `${column.width}px`).join(" "), [visibleColumns]);
  useEffect(() => {
    localStorage.setItem(columnPrefsKey, JSON.stringify(columnSettings));
    if(!columnPreferencesLoaded)return;
    const timer=window.setTimeout(()=>{
      void fetch("/api/settings/user/columns",{
        method:"PUT",
        headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({columns:columnSettings.map(({key,width,visible})=>({key,width,visible}))})
      });
    },350);
    return()=>window.clearTimeout(timer);
  }, [columnSettings,columnPreferencesLoaded]);

  useEffect(()=>{
    if(authorized!==true)return;
    let cancelled=false;
    void (async()=>{
      try{
        const response=await fetch("/api/settings/user/columns",{headers:{Accept:"application/json"}});
        const payload=await response.json().catch(()=>({})) as {columns?:Array<{key:ColumnKey;width:number;visible:boolean}>};
        if(!response.ok)throw new Error("Kolomvoorkeuren konden niet worden geladen.");
        if(cancelled)return;
        if(Array.isArray(payload.columns)&&payload.columns.length){
          const byKey=new Map(payload.columns.map(item=>[item.key,item]));
          const ordered=payload.columns
            .map(item=>defaultColumns.find(def=>def.key===item.key))
            .filter((item):item is ColumnSetting=>Boolean(item))
            .map(def=>{
              const saved=byKey.get(def.key);
              return{...def,width:Math.max(55,Math.min(600,Number(saved?.width)||def.width)),visible:saved?.visible!==false};
            });
          const missing=defaultColumns.filter(def=>!byKey.has(def.key));
          setColumnSettings([...ordered,...missing]);
        }
      }catch{
        // Lokale voorkeur blijft de fallback als synchronisatie tijdelijk niet beschikbaar is.
      }finally{
        if(!cancelled)setColumnPreferencesLoaded(true);
      }
    })();
    return()=>{cancelled=true;};
  },[authorized]);

  useEffect(()=>{
    if(authorized!==true)return;
    let cancelled=false;
    void (async()=>{
      try{
        const response=await fetch("/api/settings/vat-regimes",{headers:{Accept:"application/json"}});
        const payload=await response.json().catch(()=>({})) as {regimes?:VatRegime[]};
        if(!response.ok)throw new Error("Btw-regimes konden niet worden geladen.");
        if(!cancelled)setVatRegimes(Array.isArray(payload.regimes)?payload.regimes:[]);
      }catch{
        if(!cancelled)setVatRegimes([]);
      }
    })();
    return()=>{cancelled=true;};
  },[authorized]);


  const patchColumn = (key: ColumnKey, patch: Partial<ColumnSetting>) => setColumnSettings(current => current.map(column => column.key === key ? { ...column, ...patch } : column));
  const moveColumn = (key: ColumnKey, direction: -1|1) => setColumnSettings(current => {
    const index = current.findIndex(column => column.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const resetColumns = () => setColumnSettings(defaultColumns);

  const startColumnResize = (event: React.PointerEvent, key: ColumnKey) => {
    event.preventDefault();
    event.stopPropagation();
    const column = columnSettings.find(item => item.key === key);
    if (!column) return;
    const startX = event.clientX;
    const startWidth = column.width;
    const move = (moveEvent: PointerEvent) => {
      const width = Math.max(55, Math.min(600, startWidth + moveEvent.clientX - startX));
      patchColumn(key, { width });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.classList.remove("is-column-resizing");
    };
    document.body.classList.add("is-column-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };


  const loadVatRegimes=async()=>{
    setVatSettingsStatus("Btw-instellingen laden…");
    try{
      const response=await fetch("/api/settings/vat-regimes",{headers:{Accept:"application/json"}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(payload.error??"Btw-instellingen konden niet worden geladen."));
      setVatRegimes(Array.isArray(payload.regimes)?payload.regimes:[]);
      setVatSettingsStatus("");
    }catch(error){
      setVatSettingsStatus(error instanceof Error?error.message:"Btw-instellingen konden niet worden geladen.");
    }
  };

  const openSettings=async()=>{
    setSettingsOpen(true);
    await loadVatRegimes();
  };

  const createVatSetting=async()=>{
    setVatSettingsStatus("Btw-regime opslaan…");
    try{
      const response=await fetch("/api/settings/vat-regimes",{
        method:"POST",
        headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify(vatRegimeDraft)
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(payload.error??"Btw-regime kon niet worden opgeslagen."));
      setVatRegimeDraft({code:"",label:"",treatment:"normal",rate:null,active:true,sortOrder:0});
      await loadVatRegimes();
    }catch(error){
      setVatSettingsStatus(error instanceof Error?error.message:"Btw-regime kon niet worden opgeslagen.");
    }
  };

  const patchVatSetting=async(id:number,patch:Partial<VatRegime>)=>{
    setVatSettingsStatus("Btw-regime bijwerken…");
    try{
      const response=await fetch(`/api/settings/vat-regimes/${id}`,{
        method:"PUT",
        headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify(patch)
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(payload.error??"Btw-regime kon niet worden bijgewerkt."));
      setVatRegimes(current=>current.map(item=>item.id===id?payload as VatRegime:item));
      setVatSettingsStatus("");
    }catch(error){
      setVatSettingsStatus(error instanceof Error?error.message:"Btw-regime kon niet worden bijgewerkt.");
    }
  };

  const loadTailCosts=async(directCost?:number)=>{
    const response=await fetch("/api/workbench/current/tail-costs",{headers:{Accept:"application/json"}});
    if(!response.ok)throw new Error("Staartkosten konden niet worden geladen.");
    const payload=await response.json() as {components:TailCostComponent[]};
    const components=Array.isArray(payload.components)?payload.components:[];
    setTailCosts(components);
    const direct=directCost ?? lines.filter(line=>isCostLine(line)&&line.lineType!=="option").reduce((sum,line)=>sum+lineDirect(line),0);
    const evalResponse=await fetch("/api/workbench/current/tail-costs/evaluate",{
      method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({directCost:direct})
    });
    if(evalResponse.ok){
      const evaluated=await evalResponse.json() as {calculationComponents:EvaluatedTailCost[];tailCost:number;mainDirectCost:number};
      setEvaluatedTailCosts(Array.isArray(evaluated.calculationComponents)?evaluated.calculationComponents:[]);
      setTailCostTotal(Number(evaluated.tailCost??0));
      setMainDirectCost(Number(evaluated.mainDirectCost??0));
    }else{
      setEvaluatedTailCosts([]);
      setTailCostTotal(0);
      setMainDirectCost(0);
    }
  };

  const createTailCost=async()=>{
    setTailCostStatus("Staartkostencomponent toevoegen…");
    try{
      const response=await fetch("/api/workbench/current/tail-costs",{
        method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({...tailCostDraft,baseRef:tailCostDraft.baseRef||null})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(payload.error??"Staartkostencomponent kon niet worden toegevoegd."));
      setTailCostDraft({ownerType:"calculation",ownerRef:"",componentKey:"",description:"",basis:"percentage",value:0,baseScope:"owner_direct_cost",baseRef:"",quantity:null,vatRegimeId:null});
      await loadTailCosts();
      setTailCostStatus("Staartkostencomponent toegevoegd.");
    }catch(error){setTailCostStatus(error instanceof Error?error.message:"Staartkostencomponent kon niet worden toegevoegd.");}
  };

  const loadRecipeLibrary = async () => {
    const response = await fetch("/api/recipes", { headers:{Accept:"application/json"} });
    if(!response.ok) throw new Error("Receptbibliotheek kon niet worden geladen.");
    const payload = await response.json() as {recipes:CalcRecipe[]};
    setRecipes(Array.isArray(payload.recipes)?payload.recipes:[]);
    setSelectedRecipeVersionId(current => current ?? payload.recipes?.[0]?.id ?? null);
  };

  const loadSubcalculations = async () => {
    const response = await fetch("/api/workbench/current/subcalculations", { headers:{Accept:"application/json"} });
    if(!response.ok) throw new Error("Deelcalculaties konden niet worden geladen.");
    const payload = await response.json() as {subcalculations:CalcSubcalculation[]};
    setSubcalculations(Array.isArray(payload.subcalculations)?payload.subcalculations:[]);
  };

  const loadSubcalculationResults=async()=>{
    const response=await fetch("/api/workbench/current/subcalculations/evaluate",{headers:{Accept:"application/json"}});
    if(!response.ok){setSubcalculationResults([]);return;}
    const payload=await response.json() as {results:CalcSubcalculationResult[]};
    setSubcalculationResults(Array.isArray(payload.results)?payload.results:[]);
  };

  const createRecipe = async () => {
    setManagementStatus("Recept aanmaken…");
    try {
      const response = await fetch("/api/recipes", {
        method:"POST", headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify(recipeDraft)
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(String(payload.error??"Recept kon niet worden aangemaakt."));
      setRecipeDraft({recipeKey:"",name:"",description:""});
      await loadRecipeLibrary();
      setManagementStatus("Recept aangemaakt in Calc.");
    } catch(error) { setManagementStatus(error instanceof Error?error.message:"Recept kon niet worden aangemaakt."); }
  };

  const addRecipeLine = async () => {
    if(!selectedRecipeVersionId){setManagementStatus("Kies eerst een recept.");return;}
    setManagementStatus("Receptregel toevoegen…");
    try {
      const response=await fetch(`/api/recipes/${selectedRecipeVersionId}/lines`,{
        method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({
          ...recipeLineDraft,
          quantitySourceType:recipeLineDraft.quantitySourceType||null,
          quantitySourceRef:recipeLineDraft.quantitySourceRef||null,
          costSourceType:recipeLineDraft.costSourceType||null,
          costSourceRef:recipeLineDraft.costSourceRef||null,
          fixedQuantity:recipeLineDraft.takeoffBasis==="fixed"?Number(recipeLineDraft.fixedQuantity):null
        })
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(String(payload.error??"Receptregel kon niet worden toegevoegd."));
      setRecipeLineDraft(current=>({...current,lineRef:"",description:"",costSourceRef:"",quantitySourceRef:""}));
      await loadRecipeLibrary();
      setManagementStatus("Receptregel toegevoegd.");
    } catch(error) { setManagementStatus(error instanceof Error?error.message:"Receptregel kon niet worden toegevoegd."); }
  };

  const addSelectedLinesToSubcalculation = async (subcalculationId:number) => {
    if(!subcalculationId) return;
    const persistedIds=selectedLineIds.filter(id=>id>0 && isCostLine(lines.find(line=>line.id===id) ?? ({lineType:"note"} as Line)));
    if(selectedLineIds.some(id=>id<0)){
      setManagementStatus("Sla nieuwe regels eerst op voordat je ze aan een deelcalculatie koppelt.");
      return;
    }
    if(persistedIds.length===0){
      setManagementStatus("Selecteer minimaal één echte calculatieregel.");
      return;
    }
    setManagementStatus("Regels koppelen aan deelcalculatie…");
    try{
      for(const lineId of persistedIds){
        const response=await fetch(`/api/workbench/current/subcalculations/${subcalculationId}/lines/${lineId}`,{
          method:"PUT",headers:{"Content-Type":"application/json",Accept:"application/json"},
          body:JSON.stringify({included:true})
        });
        if(!response.ok){
          const payload=await response.json().catch(()=>({}));
          throw new Error(String(payload.error??`Regel #${lineId} kon niet worden gekoppeld.`));
        }
      }
      await loadSubcalculationResults();
      setSelectedLineIds([]);
      setManagementStatus(`${persistedIds.length} regel(s) gekoppeld aan deelcalculatie.`);
    }catch(error){
      setManagementStatus(error instanceof Error?error.message:"Regels konden niet worden gekoppeld.");
    }
  };

  const removeSelectedLinesFromActiveSubcalculation = async () => {
    if(activeSubcalculationId==null) return;
    const persistedIds=selectedLineIds.filter(id=>id>0 && isCostLine(lines.find(line=>line.id===id) ?? ({lineType:"note"} as Line)));
    if(persistedIds.length===0){setManagementStatus("Selecteer minimaal één gekoppelde calculatieregel.");return;}
    setManagementStatus("Regels uit deelcalculatie verwijderen…");
    try{
      for(const lineId of persistedIds){
        const response=await fetch(`/api/workbench/current/subcalculations/${activeSubcalculationId}/lines/${lineId}`,{
          method:"PUT",headers:{"Content-Type":"application/json",Accept:"application/json"},
          body:JSON.stringify({included:false})
        });
        if(!response.ok){
          const payload=await response.json().catch(()=>({}));
          throw new Error(String(payload.error??`Regel #${lineId} kon niet worden verwijderd.`));
        }
      }
      await loadSubcalculationResults();
      setSelectedLineIds([]);
      setManagementStatus(`${persistedIds.length} regel(s) uit deelcalculatie verwijderd.`);
    }catch(error){
      setManagementStatus(error instanceof Error?error.message:"Regels konden niet uit de deelcalculatie worden verwijderd.");
    }
  };

  const createSubcalculation = async () => {
    setManagementStatus("Deelcalculatie aanmaken…");
    try {
      const response=await fetch("/api/workbench/current/subcalculations",{
        method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify(subcalcDraft)
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(String(payload.error??"Deelcalculatie kon niet worden aangemaakt."));
      setSubcalcDraft({ref:"",description:""});
      await Promise.all([loadSubcalculations(),loadSubcalculationResults()]);
      setManagementStatus("Deelcalculatie aangemaakt.");
    } catch(error) { setManagementStatus(error instanceof Error?error.message:"Deelcalculatie kon niet worden aangemaakt."); }
  };

  const addSubcalculationScope = async () => {
    if(!subcalcScopeDraft.subcalculationId){setManagementStatus("Kies eerst een deelcalculatie.");return;}
    setManagementStatus("Scope toevoegen…");
    try {
      const response=await fetch(`/api/workbench/current/subcalculations/${subcalcScopeDraft.subcalculationId}/scopes`,{
        method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({scopeType:subcalcScopeDraft.scopeType,scopeRef:subcalcScopeDraft.scopeRef})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(String(payload.error??"Scope kon niet worden toegevoegd."));
      setSubcalcScopeDraft(current=>({...current,scopeRef:""}));
      await Promise.all([loadSubcalculations(),loadSubcalculationResults()]);
      setManagementStatus("Scope toegevoegd.");
    } catch(error) { setManagementStatus(error instanceof Error?error.message:"Scope kon niet worden toegevoegd."); }
  };

  const loadWorkbench = async () => {
    const response = await fetch("/api/workbench/current", { headers: { Accept: "application/json" } });
    if (response.status === 401) {
      setAuthorized(false);
      setStatus("Open deze calculatie vanuit BREBO Office");
      return;
    }
    if (!response.ok) throw new Error("Werkbank kon niet worden geladen.");
    const data = await response.json();
    try {
      const aggregateResponse = await fetch("/api/workbench/current/aggregate", { headers: { Accept: "application/json" } });
      if (aggregateResponse.ok) {
        const nextAggregate = await aggregateResponse.json() as WorkbenchAggregate;
        setAggregate(nextAggregate);
        setRecipeParagraphKey(current => {
          if (current && nextAggregate.structure.some(node => node.node_key === current)) return current;
          const paragraph = nextAggregate.structure.find(node => node.node_type === "paragraph");
          return paragraph?.node_key ?? "";
        });
      }
      else setAggregate(null);
    } catch {
      setAggregate(null);
    }
    setLines(Array.isArray(data.lines) ? data.lines.map((line: Record<string, unknown>) => mapServerLine(line)) : []);
    setSelectedLineIds([]);
    setAllocations(Array.isArray(data.allocations) ? data.allocations.map((row: Record<string,unknown>) => ({
      sourceLineId:Number(row.source_line_id), targetLineId:Number(row.target_line_id), method:String(row.allocation_method) as LineAllocation["method"], share:Number(row.share ?? 0), amount:Number(row.amount ?? 0)
    })) : []);
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
        await Promise.all([loadRecipeLibrary(),loadSubcalculations(),loadSubcalculationResults(),loadTailCosts()]);
      } catch (error) {
        setAuthorized(false);
        setStatus(error instanceof Error ? error.message : "Werkbank kon niet worden geopend.");
      }
    };
    void boot();
  }, []);

  const acceptRecipeProposal = async (proposal: WorkbenchAggregate["recipeProposals"][number]) => {
    if (!recipeParagraphKey || !aggregate) {
      setRecipeActionStatus("Kies eerst een Calc-paragraaf.");
      return;
    }
    setRecipeActionStatus(`${proposal.label} in Calc genereren…`);
    try {
      const response = await fetch("/api/workbench/current/concept/recipe-proposals/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          positionRef: proposal.positionRef,
          recipeVersionId: Number(proposal.recipeRef),
          takeoffId: selectedTakeoffByPosition[proposal.positionRef] ?? undefined,
          passes: 1,
          parameters: {}
        })
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        recipeName?: string;
        lines?: Array<{
          code:string;description:string;unit:string;quantity:number;
          labourNorm:number|null;labourTotalHours:number|null;labourHoursInputMode:"norm"|"total_hours"|null;
          labour:number;material:number;equipment:number;subcontracting:number;other:number;
          priceSourceType:"recipe";officeSourceId:string|null;sourceReference:string;sourceUnitPrice:number|null;sourceDetails:string;
          resolutionStatus:"resolved"|"unresolved";resolutionReason:string|null;
        }>;
        readiness?:"ready"|"incomplete";
        unresolvedCount?:number;
      };
      if (!response.ok) throw new Error(String(payload.error ?? "Recept kon niet worden gegenereerd."));
      if (!Array.isArray(payload.lines) || payload.lines.length === 0) throw new Error("Het Calc-recept leverde geen regels op.");

      const paragraphNode = aggregate.structure.find(node => node.node_key === recipeParagraphKey);
      if (!paragraphNode || paragraphNode.node_type !== "paragraph") throw new Error("De gekozen Calc-paragraaf bestaat niet meer.");
      const paragraphLine = lines.find(line => line.lineType === "paragraph" && line.structureKey === paragraphNode.node_key);
      if (!paragraphLine) throw new Error("De gekozen Calc-paragraaf is niet meer beschikbaar.");

      let id = nextId;
      const created: Line[] = [];
      const paragraphId = paragraphLine.id;

      for (const generated of payload.lines) {
        created.push({
          id:id--,
          parentId:paragraphId,
          lineType:"item",
          code:generated.code,
          description:generated.description,
          unit:generated.unit,
          quantity:generated.quantity,
          labourNorm:generated.labourNorm,
          labourTotalHours:generated.labourTotalHours,
          labourHoursInputMode:generated.labourHoursInputMode,
          labour:generated.labour,
          material:generated.material,
          equipment:generated.equipment,
          subcontracting:generated.subcontracting,
          other:generated.other,
          priceSourceType:"recipe",
          officeSourceId:generated.officeSourceId,
          sourceReference:generated.sourceReference,
          sourceSupplier:null,
          sourceUnitPrice:generated.sourceUnitPrice,
          sourcePriceDate:null,
          sourceDocumentId:null,
          sourceDetails:generated.sourceDetails,
          sourceVisualPage:null,
          sourcePositionBounds:null,
          sourceVisualCrop:null,
          sourceVisualSearchRegion:null,
          sourceTextRegions:null,
          sourceOfferSummary:`${payload.recipeName ?? proposal.label} · ${proposal.positionRef}`,
          resolutionStatus:generated.resolutionStatus,
          resolutionReason:generated.resolutionReason
        });
      }

      setNextId(id);
      setLines(current => [...current, ...created]);
      setStatus("Concept — niet opgeslagen");
      const unresolvedCount=payload.lines.filter(line=>line.resolutionStatus==="unresolved").length;
      setRecipeActionStatus(unresolvedCount
        ? `${payload.recipeName ?? proposal.label}: ${unresolvedCount} bron(nen) ontbreken. Regels zijn zichtbaar, maar de calculatie kan zo niet worden opgeslagen.`
        : `${payload.recipeName ?? proposal.label}: ${payload.lines.length} Calc-regel(s) gegenereerd. Nog opslaan.`);
    } catch (error) {
      setRecipeActionStatus(error instanceof Error ? error.message : "Recept kon niet worden gegenereerd.");
    }
  };

  const patchLine = (id: number, patch: Partial<Line>) => {
    setLines(current => current.map(line => line.id === id ? { ...line, ...patch } : line));
    setStatus("Concept — niet opgeslagen");
  };

  const incomingAllocation = (lineId:number) => allocations.filter(item => item.targetLineId === lineId).reduce((sum,item)=>sum+item.amount,0);
  const outgoingAllocation = (lineId:number) => allocations.filter(item => item.sourceLineId === lineId).reduce((sum,item)=>sum+item.amount,0);
  const effectiveLineDirect = (line:Line) => lineDirect(line) - outgoingAllocation(line.id) + incomingAllocation(line.id);
  const allocateLine = (sourceLineId:number, method:"quantity"|"value") => {
    const source=lines.find(line=>line.id===sourceLineId); if(!source)return;
    const targets=lines.filter(line=>selectedLineIds.includes(line.id)&&line.id!==sourceLineId&&isCostLine(line)&&line.lineType!=="option");
    if(!targets.length){setStatus("Selecteer eerst minimaal één doelregel voor de verdeling.");return;}
    const sourceAmount=lineDirect(source); if(sourceAmount<=0){setStatus("Deze kostenregel heeft geen bedrag om te verdelen.");return;}
    const weights=targets.map(line=>method==="quantity"?Math.max(0,line.quantity):Math.max(0,lineDirect(line)));
    const totalWeight=weights.reduce((sum,value)=>sum+value,0); if(totalWeight<=0){setStatus("De geselecteerde doelregels hebben geen bruikbare verdeelbasis.");return;}
    let allocated=0; const next=targets.map((line,index)=>{const share=weights[index]/totalWeight;const amount=index===targets.length-1?sourceAmount-allocated:Math.round(sourceAmount*share*10000)/10000;allocated+=amount;return{sourceLineId,targetLineId:line.id,method,share,amount} as LineAllocation;});
    setAllocations(current=>[...current.filter(item=>item.sourceLineId!==sourceLineId),...next]); setStatus(`${source.description||"Kostenregel"} verdeeld over ${targets.length} regel(s). Nog opslaan.`);
  };
  const clearAllocation=(sourceLineId:number)=>{setAllocations(current=>current.filter(item=>item.sourceLineId!==sourceLineId));setStatus("Kostenverdeling opgeheven — nog opslaan");};

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
      labourNorm: null, labourTotalHours: null, labourHoursInputMode: null,
      labour: 0, material: 0, equipment: 0, subcontracting: 0, other: 0,
      priceSourceType: "manual", officeSourceId: null, sourceReference: null,
      sourceSupplier: null, sourceUnitPrice: null, sourcePriceDate: null, sourceDocumentId: null, sourceDetails: null, sourceVisualPage: null, sourcePositionBounds: null, sourceVisualCrop: null, sourceVisualSearchRegion: null, sourceTextRegions: null, sourceOfferSummary: null
    }]);
    setStatus("Concept — niet opgeslagen");
  };

  const freshId = () => {
    const id = nextId;
    setNextId(id - 1);
    return id;
  };

  const insertRelative = (lineId: number, where: "above" | "below") => {
    const source = lines.find(line => line.id === lineId);
    if (!source) return;
    const id = freshId();
    const created: Line = {
      ...source,
      id,
      code: "",
      description: "",
      priceSourceType: "manual",
      officeSourceId: null,
      sourceReference: null,
      sourceSupplier: null,
      sourceUnitPrice: null,
      sourcePriceDate: null,
      sourceDocumentId: null,
      sourceDetails: null,
      sourceVisualPage: null,
      sourcePositionBounds: null,
      sourceVisualCrop: null,
      sourceVisualSearchRegion: null,
      sourceTextRegions: null,
      sourceOfferSummary: null
    };
    const index = lines.findIndex(line => line.id === lineId);
    const at = where === "above" ? index : index + 1;
    setLines(current => [...current.slice(0, at), created, ...current.slice(at)]);
    setSelectedLineId(id);
    setStatus("Concept — niet opgeslagen");
  };

  const duplicateLine = (lineId: number) => {
    const source = lines.find(line => line.id === lineId);
    if (!source) return;
    const id = freshId();
    const copy: Line = { ...source, id };
    const index = lines.findIndex(line => line.id === lineId);
    setLines(current => [...current.slice(0, index + 1), copy, ...current.slice(index + 1)]);
    setSelectedLineId(id);
    setStatus("Concept — niet opgeslagen");
  };

  const deleteLine = (lineId: number) => {
    const source = lines.find(line => line.id === lineId);
    if (!source) return;
    const childIds = new Set<number>([lineId]);
    if (source.lineType === "chapter") {
      lines.filter(line => line.parentId === lineId).forEach(line => {
        childIds.add(line.id);
        if (line.lineType === "paragraph") lines.filter(child => child.parentId === line.id).forEach(child => childIds.add(child.id));
      });
    } else if (source.lineType === "paragraph") {
      lines.filter(line => line.parentId === lineId).forEach(line => childIds.add(line.id));
    }
    const count = childIds.size;
    if (count > 1 && !window.confirm(`Dit verwijdert ook ${count - 1} onderliggende regel(s). Doorgaan?`)) return;
    setLines(current => current.filter(line => !childIds.has(line.id)));
    setSelectedLineId(current => current != null && childIds.has(current) ? null : current);
    setStatus("Concept — niet opgeslagen");
  };

  const moveLine = (lineId: number, direction: -1 | 1) => {
    const index = lines.findIndex(line => line.id === lineId);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= lines.length) return;
    setLines(current => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setStatus("Concept — niet opgeslagen");
  };

  const detachSource = (lineId: number) => {
    patchLine(lineId, {
      priceSourceType: "manual",
      officeSourceId: null,
      sourceReference: null,
      sourceSupplier: null,
      sourceUnitPrice: null,
      sourcePriceDate: null,
      sourceDocumentId: null,
      sourceDetails: null,
      sourceVisualPage: null,
      sourcePositionBounds: null,
      sourceVisualCrop: null,
      sourceVisualSearchRegion: null,
      sourceTextRegions: null,
      sourceOfferSummary: null
    });
  };

  const moveToParent = (lineId: number, parentId: number | null) => {
    patchLine(lineId, { parentId });
  };

  const LineActions = ({ line }: { line: Line }) => {
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

    const toggle = () => {
      if (open) {
        setOpen(false);
        return;
      }
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const estimatedHeight = 330;
      const right = Math.max(8, window.innerWidth - rect.right);
      const opensUp = window.innerHeight - rect.bottom < estimatedHeight && rect.top > estimatedHeight;
      setMenuStyle(opensUp
        ? { position: "fixed", right, bottom: Math.max(8, window.innerHeight - rect.top + 4) }
        : { position: "fixed", right, top: Math.max(8, rect.bottom + 4) });
      setOpen(true);
    };

    useEffect(() => {
      if (!open) return;
      const close = () => setOpen(false);
      const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
      window.addEventListener("resize", close);
      window.addEventListener("scroll", close, true);
      window.addEventListener("keydown", onKey);
      return () => {
        window.removeEventListener("resize", close);
        window.removeEventListener("scroll", close, true);
        window.removeEventListener("keydown", onKey);
      };
    }, [open]);

    const menu = open ? createPortal(
      <div className="lineActionsMenu lineActionsOverlay" style={menuStyle} onClick={event => event.stopPropagation()}>
        <button type="button" onClick={() => { insertRelative(line.id, "above"); setOpen(false); }}>Regel erboven invoegen</button>
        <button type="button" onClick={() => { insertRelative(line.id, "below"); setOpen(false); }}>Regel eronder invoegen</button>
        <button type="button" onClick={() => { duplicateLine(line.id); setOpen(false); }}>Dupliceren</button>
        <button type="button" onClick={() => { moveLine(line.id, -1); setOpen(false); }}>Omhoog</button>
        <button type="button" onClick={() => { moveLine(line.id, 1); setOpen(false); }}>Omlaag</button>
        {line.lineType !== "chapter" && <label>Verplaatsen naar
          <select value={line.parentId ?? ""} onChange={event => { moveToParent(line.id, event.target.value === "" ? null : Number(event.target.value)); setOpen(false); }}>
            <option value="">Geen bovenliggend niveau</option>
            {lines.filter(parent => parent.lineType === "chapter" || parent.lineType === "paragraph").filter(parent => parent.id !== line.id).map(parent => <option key={parent.id} value={parent.id}>{parent.lineType === "chapter" ? "H · " : "P · "}{parent.description}</option>)}
          </select>
        </label>}
        {line.sourceDocumentId && <button type="button" onClick={() => { detachSource(line.id); setOpen(false); }}>Bron loskoppelen</button>}
        {isCostLine(line) && <>
          <button type="button" onClick={() => { allocateLine(line.id,"value"); setOpen(false); }}>Verdelen op inkoopwaarde</button>
          <button type="button" onClick={() => { allocateLine(line.id,"quantity"); setOpen(false); }}>Verdelen op aantal</button>
          {outgoingAllocation(line.id) > 0 && <button type="button" onClick={() => { clearAllocation(line.id); setOpen(false); }}>Verdeling opheffen</button>}
        </>}
        <button type="button" className="danger" onClick={() => { deleteLine(line.id); setOpen(false); }}>Verwijderen</button>
      </div>,
      document.body
    ) : null;

    return <>
      <button ref={buttonRef} type="button" className="lineActionsTrigger" title="Regelacties" aria-expanded={open} onClick={event => { event.stopPropagation(); toggle(); }}>⋮</button>
      {menu}
    </>;
  };

  const toggleBulkLine = (lineId: number, checked: boolean) => {
    setSelectedLineIds(current => checked ? Array.from(new Set([...current, lineId])) : current.filter(id => id !== lineId));
  };

  const bulkDuplicate = () => {
    if (selectedLineIds.length === 0) return;
    const selected = new Set(selectedLineIds);
    let id = nextId;
    const next: Line[] = [];
    const copies: number[] = [];
    for (const line of lines) {
      next.push(line);
      if (selected.has(line.id)) {
        const copy = { ...line, id: id-- };
        next.push(copy);
        copies.push(copy.id);
      }
    }
    setNextId(id);
    setLines(next);
    setSelectedLineIds(copies);
    setStatus("Concept — niet opgeslagen");
  };

  const bulkMoveToParent = (parentId: number | null) => {
    if (selectedLineIds.length === 0) return;
    setLines(current => current.map(line => selectedLineIds.includes(line.id) ? { ...line, parentId } : line));
    setStatus("Concept — niet opgeslagen");
  };

  const bulkDetachSource = () => {
    if (selectedLineIds.length === 0) return;
    setLines(current => current.map(line => selectedLineIds.includes(line.id) ? {
      ...line,
      priceSourceType: "manual" as PriceSourceType,
      officeSourceId: null,
      sourceReference: null,
      sourceSupplier: null,
      sourceUnitPrice: null,
      sourcePriceDate: null,
      sourceDocumentId: null,
      sourceDetails: null,
      sourceVisualPage: null,
      sourcePositionBounds: null,
      sourceVisualCrop: null,
      sourceVisualSearchRegion: null,
      sourceTextRegions: null,
      sourceOfferSummary: null
    } : line));
    setStatus("Concept — niet opgeslagen");
  };

  const bulkDelete = () => {
    if (selectedLineIds.length === 0) return;
    const ids = new Set(selectedLineIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const line of lines) {
        if (line.parentId != null && ids.has(line.parentId) && !ids.has(line.id)) {
          ids.add(line.id);
          changed = true;
        }
      }
    }
    if (!window.confirm(`${ids.size} geselecteerde regel(s) verwijderen?`)) return;
    setLines(current => current.filter(line => !ids.has(line.id)));
    setSelectedLineIds([]);
    setSelectedLineId(current => current != null && ids.has(current) ? null : current);
    setStatus("Concept — niet opgeslagen");
  };

  const searchArticles = async () => {
    setArticleSearchStatus("Zoeken in Office…");
    try {
      const params = new URLSearchParams({ q: priceSearch, limit: "40" });
      const response = await fetch(`/api/articles/search?${params.toString()}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Artikelzoekopdracht mislukt");
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items as ArticleSearchItem[] : [];
      setArticleResults(items);
      setArticleSearchStatus(`${items.length} resultaten uit BREBO Office`);
    } catch {
      setArticleResults([]);
      setArticleSearchStatus("Artikeldata kon niet uit BREBO Office worden opgehaald.");
    }
  };

  const addArticleLine = (article: ArticleSearchItem) => {
    const latestChapter = [...lines].reverse().find(line => line.lineType === "chapter");
    const latestParagraph = [...lines].reverse().find(line => line.lineType === "paragraph");
    const parent = latestParagraph ?? latestChapter;
    const id = nextId;
    setNextId(id - 1);
    setLines(current => [...current, {
      id,
      parentId: parent?.id ?? null,
      lineType: "item",
      code: article.code,
      description: article.description,
      unit: article.unit,
      quantity: 1,
      labourNorm: null, labourTotalHours: null, labourHoursInputMode: null,
      labour: 0,
      material: Number(article.net_price ?? 0),
      equipment: 0,
      subcontracting: 0,
      other: 0,
      priceSourceType: "article",
      officeSourceId: String(article.article_id),
      sourceReference: article.supplier_article_no,
      sourceSupplier: article.supplier,
      sourceUnitPrice: Number(article.net_price ?? 0),
      sourcePriceDate: article.price_date,
      sourceDocumentId: String(article.catalog_import_id),
      sourceDetails: null,
      sourceVisualPage: null,
      sourcePositionBounds: null,
      sourceVisualCrop: null,
      sourceVisualSearchRegion: null,
      sourceTextRegions: null,
      sourceOfferSummary: null
    }]);
    setStatus("Concept — niet opgeslagen");
    setPriceWorkspaceOpen(false);
  };

  const openQuoteUpload = () => {
    quoteFileRef.current?.click();
  };

  const uploadQuote = async (file: File | undefined) => {
    if (!file) return;
    const selected = lines.find(line => line.id === selectedLineId && isCostLine(line)) ?? null;
    const targetLineId = selected?.id ?? null;
    setQuoteStatus(`${file.name} naar Office sturen en uitlezen…`);
    try {
      const response = await fetch("/api/quotes/upload", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-BREBO-Line-Ref": targetLineId == null ? "new-line" : String(targetLineId),
          "X-BREBO-Filename": file.name,
          "X-BREBO-Line-Description": selected?.description ?? "",
          "X-BREBO-Line-Quantity": selected ? String(selected.quantity) : "",
          "X-BREBO-Line-Unit": selected?.unit ?? ""
        },
        body: file
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`${String(data.error ?? "Offerte kon niet worden verwerkt.")} (HTTP ${response.status})`);
      const fileId = Number(data.source?.file_id ?? 0);
      const extractionStatus = String(data.extraction?.status ?? "unknown");
      const candidates = Array.isArray(data.proposal?.candidates) ? data.proposal.candidates as QuoteCandidate[] : [];
      const quoteLines = Array.isArray(data.proposal?.lines) ? data.proposal.lines as QuoteLine[] : [];
      setSelectedQuotePositions(quoteLines.map(line => line.position));
      setQuoteProposal({
        status: String(data.proposal?.status ?? "unknown"),
        target: {
          description: String(data.proposal?.target?.description ?? selected?.description ?? ""),
          quantity: data.proposal?.target?.quantity == null ? null : Number(data.proposal.target.quantity),
          unit: String(data.proposal?.target?.unit ?? selected?.unit ?? "")
        },
        classification: data.proposal?.classification ? data.proposal.classification as QuoteClassification : null,
        lines: quoteLines,
        candidates,
        suggested: data.proposal?.suggested ? data.proposal.suggested as QuoteCandidate : null,
        fileId,
        filename: file.name,
        targetLineId
      });
      if (targetLineId != null) {
        patchLine(targetLineId, {
          priceSourceType: "supplier_quote",
          officeSourceId: fileId > 0 ? String(fileId) : null,
          sourceReference: file.name,
          sourceDocumentId: fileId > 0 ? String(fileId) : null
        });
      }
      setQuoteStatus(extractionStatus === "extracted"
        ? (targetLineId == null
          ? (quoteLines.length > 0 ? `${quoteLines.length} offerteregels herkend. Controleer en neem de geselecteerde regels over.` : `Offerte opgeslagen en herkend. Kies rechts een prijs; Calc maakt de calculatieregel automatisch.`)
          : `Offerte opgeslagen en herkend. Bron #${fileId} is aan regel ${targetLineId} gekoppeld.`)
        : `Offerte opgeslagen in Office als bron #${fileId}; extractiestatus: ${extractionStatus}.`);
    } catch (error) {
      setQuoteStatus(error instanceof Error ? error.message : "Offerte kon niet worden verwerkt.");
    } finally {
      if (quoteFileRef.current) quoteFileRef.current.value = "";
    }
  };

  const applyQuoteLines = () => {
    if (!quoteProposal || quoteProposal.lines.length === 0) return;
    const chosen = quoteProposal.lines.filter(line => selectedQuotePositions.includes(line.position));
    if (chosen.length === 0) {
      setQuoteStatus("Selecteer minimaal één offerteregel.");
      return;
    }

    const classification = quoteProposal.classification;
    const structureTarget = mapClassification(classification, classificationScheme);
    let id = nextId;
    let chapterId: number | null = null;
    let paragraphId: number | null = null;
    const structural: Line[] = [];

    if (structureTarget?.group) {
      const existingChapter = lines.find(line => line.lineType === "chapter" && line.description.trim().toLowerCase() === structureTarget.group.trim().toLowerCase());
      if (existingChapter) {
        chapterId = existingChapter.id;
      } else {
        chapterId = id--;
        structural.push({
          id: chapterId, parentId: null, lineType: "chapter", code: "", description: structureTarget.group,
          unit: "", quantity: 0, labourNorm: null, labourTotalHours: null, labourHoursInputMode: null, labour: 0, material: 0, equipment: 0, subcontracting: 0, other: 0,
          priceSourceType: "manual", officeSourceId: null, sourceReference: null, sourceSupplier: null,
          sourceUnitPrice: null, sourcePriceDate: null, sourceDocumentId: null, sourceDetails: null, sourceVisualPage: null, sourcePositionBounds: null, sourceVisualCrop: null, sourceVisualSearchRegion: null, sourceTextRegions: null, sourceOfferSummary: null
        });
      }

      const existingParagraph = lines.find(line => line.lineType === "paragraph"
        && line.description.trim().toLowerCase() === structureTarget.paragraph.trim().toLowerCase()
        && line.parentId === chapterId);
      if (existingParagraph) {
        paragraphId = existingParagraph.id;
      } else if (structureTarget.paragraph) {
        paragraphId = id--;
        structural.push({
          id: paragraphId, parentId: chapterId, lineType: "paragraph", code: "", description: structureTarget.paragraph,
          unit: "", quantity: 0, labourNorm: null, labourTotalHours: null, labourHoursInputMode: null, labour: 0, material: 0, equipment: 0, subcontracting: 0, other: 0,
          priceSourceType: "manual", officeSourceId: null, sourceReference: null, sourceSupplier: null,
          sourceUnitPrice: null, sourcePriceDate: null, sourceDocumentId: null, sourceDetails: null, sourceVisualPage: null, sourcePositionBounds: null, sourceVisualCrop: null, sourceVisualSearchRegion: null, sourceTextRegions: null, sourceOfferSummary: null
        });
      }
    } else {
      const latestChapter = [...lines].reverse().find(line => line.lineType === "chapter");
      const latestParagraph = [...lines].reverse().find(line => line.lineType === "paragraph");
      chapterId = latestChapter?.id ?? null;
      paragraphId = latestParagraph?.id ?? null;
    }

    const parentId = paragraphId ?? chapterId;
    const created: Line[] = chosen.map(source => {
      const currentId = id--;
      const costs = { labour: 0, material: 0, equipment: 0, subcontracting: 0, other: 0 };
      costs[quoteCarrier] = source.unit_price;
      return {
        id: currentId,
        parentId,
        lineType: "item",
        code: source.position,
        description: source.description,
        unit: source.unit || "st",
        quantity: source.quantity > 0 ? source.quantity : 1,
        labourNorm: null,
        labourTotalHours: null,
        labourHoursInputMode: null,
        ...costs,
        priceSourceType: "supplier_quote",
        officeSourceId: String(quoteProposal.fileId),
        sourceReference: quoteProposal.filename,
        sourceSupplier: null,
        sourceUnitPrice: source.unit_price,
        sourcePriceDate: null,
        sourceDocumentId: String(quoteProposal.fileId),
        sourceDetails: source.details?.trim() || null,
        sourceVisualPage: source.source_page == null ? null : Number(source.source_page),
        sourcePositionBounds: source.source_position_bounds ?? null,
        sourceVisualCrop: source.source_visual_crop ?? null,
        sourceVisualSearchRegion: source.source_visual_search_region ?? null,
        sourceTextRegions: source.source_text_regions ?? null,
        sourceOfferSummary: source.offer_summary?.trim() || null
      };
    });

    setNextId(id);
    setLines(current => [...current, ...structural, ...created]);
    setSelectedLineId(created[created.length - 1]?.id ?? null);
    setQuoteProposal(null);
    setSelectedQuotePositions([]);
    setStatus("Concept — niet opgeslagen");
    const structureText = structureTarget ? ` onder ${structureTarget.group} > ${structureTarget.paragraph}` : "";
    setQuoteStatus(`${created.length} offerteregels overgenomen${structureText} als ${quoteCarrier === "subcontracting" ? "OA" : quoteCarrier}. Nog opslaan.`);
  };

  const applyQuoteCandidate = (candidate: QuoteCandidate) => {
    if (!quoteProposal) return;
    const patch: Partial<Line> = {
      priceSourceType: "supplier_quote",
      officeSourceId: String(quoteProposal.fileId),
      sourceReference: quoteProposal.filename,
      sourceUnitPrice: candidate.value,
      sourceDocumentId: String(quoteProposal.fileId)
    };
    if (quoteCarrier === "labour") patch.labour = candidate.value;
    if (quoteCarrier === "material") patch.material = candidate.value;
    if (quoteCarrier === "equipment") patch.equipment = candidate.value;
    if (quoteCarrier === "subcontracting") patch.subcontracting = candidate.value;
    if (quoteCarrier === "other") patch.other = candidate.value;

    if (quoteProposal.targetLineId != null) {
      patchLine(quoteProposal.targetLineId, patch);
      setQuoteStatus(`${money.format(candidate.value)} overgenomen als ${quoteCarrier === "subcontracting" ? "OA" : quoteCarrier} voor regel #${quoteProposal.targetLineId}. Nog opslaan.`);
      setQuoteProposal(null);
      return;
    }

    const latestChapter = [...lines].reverse().find(line => line.lineType === "chapter");
    const latestParagraph = [...lines].reverse().find(line => line.lineType === "paragraph");
    const parent = latestParagraph ?? latestChapter;
    const id = nextId;
    setNextId(id - 1);
    const newLine: Line = {
      id,
      parentId: parent?.id ?? null,
      lineType: "item",
      code: "",
      description: quoteProposal.target.description || candidate.text || quoteProposal.filename,
      unit: quoteProposal.target.unit || "st",
      quantity: quoteProposal.target.quantity && quoteProposal.target.quantity > 0 ? quoteProposal.target.quantity : 1,
      labourNorm: null, labourTotalHours: null, labourHoursInputMode: null,
      labour: 0,
      material: 0,
      equipment: 0,
      subcontracting: 0,
      other: 0,
      priceSourceType: "supplier_quote",
      officeSourceId: String(quoteProposal.fileId),
      sourceReference: quoteProposal.filename,
      sourceSupplier: null,
      sourceUnitPrice: candidate.value,
      sourcePriceDate: null,
      sourceDocumentId: String(quoteProposal.fileId),
      sourceDetails: null,
      sourceVisualPage: null,
      sourcePositionBounds: null,
      sourceVisualCrop: null,
      sourceVisualSearchRegion: null,
      sourceTextRegions: null,
      sourceOfferSummary: null,
      ...patch
    };
    setLines(current => [...current, newLine]);
    setSelectedLineId(id);
    setQuoteProposal(null);
    setStatus("Concept — niet opgeslagen");
    setQuoteStatus(`${money.format(candidate.value)} overgenomen; Calc heeft automatisch een nieuwe calculatieregel gemaakt. Nog opslaan.`);
  };

  const save = async () => {
    setStatus("Opslaan…");
    try {
      const response = await fetch("/api/workbench/current", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocations,
          lines: lines.map((line, index) => ({
            id: line.id,
            parentId: line.parentId,
            structureKey: line.structureKey ?? null,
            sortOrder: index,
            lineType: line.lineType,
            code: line.code,
            description: line.description,
            unit: line.unit,
            quantity: line.quantity,
            labourNorm: line.labourNorm,
            labourTotalHours: line.labourTotalHours,
            labourHoursInputMode: line.labourHoursInputMode,
            labourUnitCost: line.labour,
            materialUnitCost: line.material,
            equipmentUnitCost: line.equipment,
            subcontractingUnitCost: line.subcontracting,
            otherUnitCost: line.other,
            vatRegimeId: line.vatRegimeId,
            priceSourceType: line.priceSourceType,
            officeSourceId: line.officeSourceId,
            sourceReference: line.sourceReference,
            sourceSupplier: line.sourceSupplier,
            sourceUnitPrice: line.sourceUnitPrice,
            sourcePriceDate: line.sourcePriceDate,
            sourceDocumentId: line.sourceDocumentId,
            sourceDetails: line.sourceDetails,
            sourceVisualPage: line.sourceVisualPage,
            sourcePositionBounds: line.sourcePositionBounds,
            sourceVisualCrop: line.sourceVisualCrop,
            sourceVisualSearchRegion: line.sourceVisualSearchRegion,
            sourceTextRegions: line.sourceTextRegions,
            sourceOfferSummary: line.sourceOfferSummary
          }))
        })
      });
      const payload = await response.json().catch(() => ({})) as {directCost?:number;officeSync?:{ok?:boolean;error?:string}};
      if (!response.ok) throw new Error("Opslaan mislukt");
      if (payload.officeSync?.ok) setStatus("Opgeslagen · resultaat gesynchroniseerd met Office");
      else setStatus(`Opgeslagen in Calc · Office-sync mislukt${payload.officeSync?.error ? `: ${payload.officeSync.error}` : ""}`);
      await loadWorkbench();
      await Promise.all([loadTailCosts(payload.directCost),loadSubcalculationResults()]);
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
      <div className="user" title="Calc frontend build 2026.09.28-r1">BREBO <small className="buildMark">r1</small></div>
    </header>

    <main>
      <div className="context">
        <div>
          <span className="eyebrow">{project?.code ? `PROJECT · ${project.code}` : "PROJECT"}</span>
          <h1>{calculationTitle}</h1>
          <p>{project?.title ?? "Projectcontext laden…"} · {status}</p>
          {project?.client_name && <p className="projectMeta">Opdrachtgever: {project.client_name}{project.project_kind ? ` · ${project.project_kind}` : ""}</p>}
        </div>
        <div className="contextActions"><span className="saveState">{status}</span></div>
      </div>

      <section className="kpis">
        <div><span>Directe kostprijs</span><strong>{money.format(displayedTotals.direct)}</strong></div>
        <div><span>Staartkosten</span><strong>{money.format(displayedTotals.markupAmount)}</strong></div>
        <div className="primary"><span>Verkoopprijs</span><strong>{money.format(displayedTotals.sales)}</strong></div>
      </section>

      {!calculationReady && <div className="readinessBanner" role="alert">
        <div><strong>Calculatie onvolledig</strong><span>{unresolvedLines.length} prijs- of normbron(nen) ontbreken. Opslaan en publiceren is geblokkeerd.</span></div>
        <div className="readinessItems">{unresolvedLines.map(line=><button type="button" key={line.id} onClick={()=>setSelectedLineId(line.id)}><b>{line.code || "Regel"}</b><span>{line.description}</span><small>{line.resolutionReason || "Bron niet beschikbaar."}</small></button>)}</div>
      </div>}

      {settingsOpen && <div className="settingsOverlay" role="dialog" aria-modal="true" aria-label="Calc-instellingen">
        <div className="settingsPanel">
          <div className="settingsHead">
            <div><span className="eyebrow">CALC CONFIGURATIE</span><h2>Instellingen</h2><p>Centraal beheer van calculatie-instellingen. Btw-regimes zijn hier configureerbaar en niet hardcoded.</p></div>
            <button type="button" className="panelClose" onClick={()=>setSettingsOpen(false)} aria-label="Sluiten">×</button>
          </div>
          <div className="settingsSection">
            <div className="settingsSectionHead"><div><h3>Btw-regimes</h3><p>Gebruik eigen regimes voor bijvoorbeeld verschillende tarieven, verlegging of vrijstelling.</p></div></div>
            <div className="vatRegimeList">
              {vatRegimes.map(regime=><div className="vatRegimeRow" key={regime.id}>
                <input value={regime.label} onChange={event=>setVatRegimes(current=>current.map(item=>item.id===regime.id?{...item,label:event.target.value}:item))} onBlur={()=>void patchVatSetting(regime.id,{label:regime.label})} aria-label="Omschrijving" />
                <input value={regime.code} onChange={event=>setVatRegimes(current=>current.map(item=>item.id===regime.id?{...item,code:event.target.value}:item))} onBlur={()=>void patchVatSetting(regime.id,{code:regime.code})} aria-label="Code" />
                <select value={regime.treatment} onChange={event=>void patchVatSetting(regime.id,{treatment:event.target.value as VatRegime["treatment"]})} aria-label="Behandeling">
                  <option value="normal">Normaal</option>
                  <option value="reverse_charge">Verlegd</option>
                  <option value="exempt">Vrijgesteld</option>
                </select>
                <input type="number" step="0.01" min="0" max="100" value={regime.rate??""} disabled={regime.treatment!=="normal"} onChange={event=>setVatRegimes(current=>current.map(item=>item.id===regime.id?{...item,rate:event.target.value===""?null:Number(event.target.value)}:item))} onBlur={()=>void patchVatSetting(regime.id,{rate:regime.rate})} aria-label="Tarief" />
                <label className="toggleLabel"><input type="checkbox" checked={regime.active} onChange={event=>void patchVatSetting(regime.id,{active:event.target.checked})} /> Actief</label>
              </div>)}
              {vatRegimes.length===0 && <p className="muted">Nog geen btw-regimes ingesteld.</p>}
            </div>
            <div className="vatRegimeCreate">
              <input placeholder="Omschrijving" value={vatRegimeDraft.label} onChange={event=>setVatRegimeDraft(current=>({...current,label:event.target.value}))} />
              <input placeholder="Code" value={vatRegimeDraft.code} onChange={event=>setVatRegimeDraft(current=>({...current,code:event.target.value}))} />
              <select value={vatRegimeDraft.treatment} onChange={event=>setVatRegimeDraft(current=>({...current,treatment:event.target.value as VatRegime["treatment"],rate:event.target.value==="normal"?current.rate:null}))}>
                <option value="normal">Normaal</option>
                <option value="reverse_charge">Verlegd</option>
                <option value="exempt">Vrijgesteld</option>
              </select>
              <input type="number" step="0.01" min="0" max="100" placeholder="Tarief %" disabled={vatRegimeDraft.treatment!=="normal"} value={vatRegimeDraft.rate??""} onChange={event=>setVatRegimeDraft(current=>({...current,rate:event.target.value===""?null:Number(event.target.value)}))} />
              <button type="button" onClick={()=>void createVatSetting()}>Regime toevoegen</button>
            </div>
            {vatSettingsStatus && <p className="settingsStatus">{vatSettingsStatus}</p>}
          </div>
        </div>
      </div>}

      <section className="workbench">
        <div className="commandbar" role="toolbar" aria-label="Calculatie acties">
          <button className="command" type="button" onClick={() => window.history.back()} title="Terug naar BREBO Office"><Icon name="office" /><span>Office</span></button>
          <button className="command" type="button" onClick={()=>void openSettings()} title="Calc-instellingen"><span aria-hidden="true">⚙</span><span>Instellingen</span></button>
          <div className="commandDivider" />
          <button className="command" type="button" onClick={() => addLine("chapter")} title="Nieuw hoofdstuk"><Icon name="chapter" /><span>Hoofdstuk</span></button>
          <button className="command" type="button" onClick={() => addLine("paragraph")} title="Nieuwe paragraaf"><Icon name="paragraph" /><span>Paragraaf</span></button>
          <button className="command" type="button" onClick={() => addLine("item")} title="Nieuwe calculatieregel"><Icon name="line" /><span>Regel</span></button>
          <div className="commandDivider" />
          <button className={"command commandSecondary" + (recipeWorkspaceOpen ? " commandActive" : "")} type="button" title="Calc-recept toepassen op Office-brondata" onClick={() => setRecipeWorkspaceOpen(open => !open)}><Icon name="recipe" /><span>Recept</span></button>
          <button className={"command commandSecondary" + (recipeLibraryOpen ? " commandActive" : "")} type="button" title="Recepten beheren in Calc" onClick={() => setRecipeLibraryOpen(open => !open)}><Icon name="recipe" /><span>Recepten</span></button>
          <button className={"command commandSecondary" + (subcalculationOpen ? " commandActive" : "")} type="button" title="Deelcalculaties beheren in Calc" onClick={() => setSubcalculationOpen(open => !open)}><span>Deelcalc</span></button>
          <button className={"command commandSecondary" + (tailCostOpen ? " commandActive" : "")} type="button" title="Staartkosten beheren in Calc" onClick={() => setTailCostOpen(open=>!open)}><span>Staartkosten</span></button>
          <button className={"command commandSecondary" + (priceWorkspaceOpen ? " commandActive" : "")} type="button" title="Artikelen, prijzen en prijsbronnen" onClick={() => setPriceWorkspaceOpen(open => !open)}><Icon name="prices" /><span>Prijzen</span></button>
          <button className={"command commandSecondary" + (columnSettingsOpen ? " commandActive" : "")} type="button" title="Kolommen instellen" onClick={() => setColumnSettingsOpen(open => !open)}><span>Kolommen</span></button>
          <span className="commandSpacer" />
          <button className="command commandSave" type="button" onClick={save} disabled={!calculationReady} title={calculationReady ? "Calculatie opslaan" : "Los eerst ontbrekende prijs- of normbronnen op"}><Icon name="save" /><span>Opslaan</span></button>
        </div>

        {recipeWorkspaceOpen && <div className="recipeWorkspace">
          <div className="recipeWorkspaceHead">
            <div><span className="eyebrow">OFFICE BRONDATA → CALC BEREKENING</span><h2>Concept & recepten</h2><p>{aggregate ? `Office-context ${aggregate.officeVersion} · recepten beheerd door Calc` : "Office-context wordt nog niet geleverd."}</p></div>
            <button className="panelClose" type="button" onClick={() => setRecipeWorkspaceOpen(false)} aria-label="Sluiten">×</button>
          </div>
          {!aggregate ? <p className="muted">De bestaande calculatie blijft beschikbaar. De nieuwe Office-workbenchcontext is nog niet geladen.</p> : <>
            <div className="recipeControls">
              <label><span>Recepten plaatsen in</span><select value={recipeParagraphKey} onChange={event => setRecipeParagraphKey(event.target.value)}>
                <option value="">Kies paragraaf…</option>
                {aggregate.structure.filter(node => node.node_type === "paragraph").map(node => <option key={node.node_key} value={node.node_key}>{node.code ? `${node.code} · ` : ""}{node.label}</option>)}
              </select></label>
              <span className="recipeActionStatus" role="status" aria-live="polite">{recipeActionStatus || (aggregate.editable ? "Office-brondata beschikbaar voor Calc." : "Office-brondata is alleen-lezen; Calc kan er wel mee rekenen.")}</span>
            </div>
            <div className="recipeSummary">
              <div><span>Conceptposities</span><strong>{aggregate.concept.positions.length}</strong></div>
              <div><span>Receptvoorstellen</span><strong>{aggregate.recipeProposals.length}</strong></div>
              <div><span>Calc-regels uit recept</span><strong>{lines.filter(line => line.priceSourceType === "recipe").length}</strong></div>
              <div><span>Directe kost Calc</span><strong>{money.format(totals.direct)}</strong></div>
            </div>
            {aggregate.concept.unresolved.length > 0 && <div className="recipeWarnings"><strong>Open punten</strong>{aggregate.concept.unresolved.map((warning,index)=><span key={index}>{warning}</span>)}</div>}
            <div className="recipeColumns">
              <div className="recipePanel"><h3>Posities</h3>{aggregate.concept.positions.length === 0 ? <p className="muted">Nog geen complete posities.</p> : aggregate.concept.positions.map((position,index) => {
                const candidates = aggregate.takeoffs.filter(row => row.position_ref.trim() === position.positionRef);
                const selectedTakeoffId = selectedTakeoffByPosition[position.positionRef];
                return <div className="conceptPosition" key={`${position.positionRef}-${index}`}><div><strong>{position.positionRef}</strong><span>{position.quantity} × {position.widthMm} × {position.heightMm} mm</span></div><span className={"reviewBadge " + position.reviewStatus}>{position.reviewStatus}</span>{position.description && <p>{position.description}</p>}{position.warnings.map((warning,warningIndex)=><small key={warningIndex}>{warning}</small>)}
                  {candidates.length > 1 && <div className="takeoffReview"><strong>Meerdere geometrieën gevonden</strong>{candidates.map(candidate => <label key={candidate.id} className={selectedTakeoffId === candidate.id ? "is-selected" : ""}><input type="radio" name={`takeoff-${position.positionRef}`} checked={selectedTakeoffId === candidate.id} onChange={() => setSelectedTakeoffByPosition(current => ({...current,[position.positionRef]:candidate.id}))} /><span><b>Take-off #{candidate.id}</b><small>{candidate.quantity} × {candidate.width_mm ?? "—"} × {candidate.height_mm ?? "—"} mm · {candidate.area_m2 ?? "—"} m² · omtrek {candidate.perimeter_m ?? "—"} m</small></span></label>)}</div>}
                </div>;
              })}</div>
              <div className="recipePanel"><h3>Voorstellen</h3>{aggregate.recipeProposals.length === 0 ? <p className="muted">Geen toepasselijke receptvoorstellen.</p> : aggregate.recipeProposals.map((proposal,index) =>
                <div className="recipeProposalCard" key={`${proposal.positionRef}-${proposal.recipeRef}-${index}`}><div><strong>{proposal.label}</strong><span>{proposal.positionRef} · {Math.round(proposal.confidence*100)}%</span></div>{proposal.reasons.map((reason,i)=><small key={i}>{reason}</small>)}<button type="button" disabled={!aggregate.editable || !recipeParagraphKey || (aggregate.takeoffs.filter(row => row.position_ref.trim() === proposal.positionRef).length > 1 && !selectedTakeoffByPosition[proposal.positionRef])} onClick={() => void acceptRecipeProposal(proposal)}>Bevestigen & doorrekenen</button></div>
              )}</div>
              <div className="recipePanel"><h3>Door Calc gegenereerd</h3>{lines.filter(line => line.priceSourceType === "recipe").length === 0 ? <p className="muted">Nog geen receptregels in de calculatie.</p> : lines.filter(line => line.priceSourceType === "recipe").map(line =>
                <div className={"generatedLineCard"+(line.resolutionStatus==="unresolved"?" is-unresolved":"")} key={line.id}><div><strong>{line.description}</strong><span>{line.sourceReference ?? "Calc-recept"}</span></div><b>{line.labourTotalHours != null ? line.labourTotalHours.toLocaleString("nl-NL",{maximumFractionDigits:4}) : line.quantity.toLocaleString("nl-NL",{maximumFractionDigits:4})} {line.unit}</b>{line.resolutionStatus==="unresolved"?<small className="sourceError">{line.resolutionReason || "Bron niet beschikbaar."}</small>:<small>{money.format(lineDirect(line))} direct</small>}</div>
              )}</div>
            </div>
            <div className="costRollupBar">
              <div className="costRollupTotal"><span>Calc directe kost</span><strong>{money.format(totals.direct)}</strong><small>som van de zichtbare calculatieregels</small></div>
              <div><span>Calc staartkosten</span><strong>{money.format(totals.markupAmount)}</strong><small>opbouw via Staartkosten</small></div>
              <div><span>Calc verkoopprijs</span><strong>{money.format(totals.sales)}</strong><small>wordt na opslaan teruggekoppeld naar Office</small></div>
            </div>
          </>}
        </div>}

        {recipeLibraryOpen && <div className="managementWorkspace">
          <div className="recipeWorkspaceHead">
            <div><span className="eyebrow">CALC-OWNED</span><h2>Receptbibliotheek</h2><p>Calc bepaalt de samenstelling; Office levert actuele normen, tarieven en prijzen.</p></div>
            <button className="panelClose" type="button" onClick={() => setRecipeLibraryOpen(false)} aria-label="Sluiten">×</button>
          </div>
          <div className="managementGrid">
            <section className="managementCard">
              <h3>Nieuw recept</h3>
              <label><span>Code</span><input value={recipeDraft.recipeKey} onChange={event=>setRecipeDraft(current=>({...current,recipeKey:event.target.value}))} placeholder="bijv. kozijn-vervangen" /></label>
              <label><span>Naam</span><input value={recipeDraft.name} onChange={event=>setRecipeDraft(current=>({...current,name:event.target.value}))} placeholder="Kozijn vervangen" /></label>
              <label><span>Omschrijving</span><textarea value={recipeDraft.description} onChange={event=>setRecipeDraft(current=>({...current,description:event.target.value}))} /></label>
              <button type="button" onClick={() => void createRecipe()}>Recept aanmaken</button>
            </section>
            <section className="managementCard">
              <h3>Recepten</h3>
              <div className="managementList">{recipes.length===0?<p className="muted">Nog geen Calc-recepten.</p>:recipes.map(recipe=>
                <button type="button" className={"managementListItem"+(selectedRecipeVersionId===recipe.id?" is-selected":"")} key={recipe.id} onClick={()=>setSelectedRecipeVersionId(recipe.id)}>
                  <strong>{recipe.name}</strong><span>{recipe.recipeKey} · v{recipe.versionNo} · {recipe.status}</span><small>{recipe.lines.length} regel(s)</small>
                </button>
              )}</div>
            </section>
            <section className="managementCard managementWide">
              <h3>Regel toevoegen aan {recipes.find(recipe=>recipe.id===selectedRecipeVersionId)?.name ?? "recept"}</h3>
              <div className="managementFields">
                <label><span>Regelcode</span><input value={recipeLineDraft.lineRef} onChange={event=>setRecipeLineDraft(current=>({...current,lineRef:event.target.value}))} /></label>
                <label><span>Omschrijving</span><input value={recipeLineDraft.description} onChange={event=>setRecipeLineDraft(current=>({...current,description:event.target.value}))} /></label>
                <label><span>Kostensoort</span><select value={recipeLineDraft.costKind} onChange={event=>setRecipeLineDraft(current=>({...current,costKind:event.target.value}))}><option value="material">Materiaal</option><option value="labour">Arbeid</option><option value="equipment">Materieel</option><option value="subcontracting">OA</option><option value="other">Overig</option></select></label>
                <label><span>Eenheid</span><input value={recipeLineDraft.unit} onChange={event=>setRecipeLineDraft(current=>({...current,unit:event.target.value}))} /></label>
                <label><span>Uittrekbasis</span><select value={recipeLineDraft.takeoffBasis} onChange={event=>setRecipeLineDraft(current=>({...current,takeoffBasis:event.target.value}))}><option value="fixed">Vast</option><option value="area">Oppervlak</option><option value="perimeter">Omtrek</option><option value="two_sides_plus_head">2 zijden + bovendorpel</option><option value="width">Breedte</option><option value="height">Hoogte</option><option value="part_area">Vakoppervlak</option><option value="internal_joint">Interne koppeling</option></select></label>
                <label><span>Factor</span><input type="number" step="0.01" value={recipeLineDraft.factor} onChange={event=>setRecipeLineDraft(current=>({...current,factor:Number(event.target.value)}))} /></label>
                <label><span>Verlies %</span><input type="number" step="0.1" value={recipeLineDraft.wastePct} onChange={event=>setRecipeLineDraft(current=>({...current,wastePct:Number(event.target.value)}))} /></label>
                {recipeLineDraft.takeoffBasis==="fixed" && <label><span>Vaste hoeveelheid</span><input type="number" step="0.01" value={recipeLineDraft.fixedQuantity} onChange={event=>setRecipeLineDraft(current=>({...current,fixedQuantity:Number(event.target.value)}))} /></label>}
                <label><span>Normbron type</span><input value={recipeLineDraft.quantitySourceType} onChange={event=>setRecipeLineDraft(current=>({...current,quantitySourceType:event.target.value}))} placeholder="norm" /></label>
                <label><span>Normbron ref</span><input value={recipeLineDraft.quantitySourceRef} onChange={event=>setRecipeLineDraft(current=>({...current,quantitySourceRef:event.target.value}))} placeholder="montage:kozijn_per_m" /></label>
                <label><span>Kostprijsbron type</span><select value={recipeLineDraft.costSourceType} onChange={event=>setRecipeLineDraft(current=>({...current,costSourceType:event.target.value}))}><option value="">Geen</option><option value="article">Artikel</option><option value="project_labour">Projectarbeid</option><option value="norm">Normwaarde</option></select></label>
                <label><span>Kostprijsbron ref</span><input value={recipeLineDraft.costSourceRef} onChange={event=>setRecipeLineDraft(current=>({...current,costSourceRef:event.target.value}))} placeholder="artikelcode of default" /></label>
              </div>
              <button type="button" disabled={!selectedRecipeVersionId} onClick={() => void addRecipeLine()}>Regel toevoegen</button>
              {selectedRecipeVersionId && <div className="recipeLineList">{(recipes.find(recipe=>recipe.id===selectedRecipeVersionId)?.lines??[]).map(line=><div key={line.id}><strong>{line.lineRef} · {line.description}</strong><span>{line.costKind} · {line.takeoffBasis} · factor {line.factor}{line.wastePct ? " · " + line.wastePct + "% verlies" : ""}</span><small>{line.quantitySourceRef ? "norm: " + line.quantitySourceType + ":" + line.quantitySourceRef : "geen normbron"} · {line.costSourceRef ? "prijs: " + line.costSourceType + ":" + line.costSourceRef : "geen kostprijsbron"}</small></div>)}</div>}
            </section>
          </div>
          {managementStatus && <div className="managementStatus" role="status">{managementStatus}</div>}
        </div>}

        {subcalculationOpen && <div className="managementWorkspace">
          <div className="recipeWorkspaceHead">
            <div><span className="eyebrow">CALC-OWNED</span><h2>Deelcalculaties</h2><p>Eén calculatieregel of positie kan in meerdere deelcalculaties tegelijk vallen.</p></div>
            <button className="panelClose" type="button" onClick={() => setSubcalculationOpen(false)} aria-label="Sluiten">×</button>
          </div>
          <div className="managementGrid">
            <section className="managementCard">
              <h3>Nieuwe deelcalculatie</h3>
              <label><span>Referentie</span><input value={subcalcDraft.ref} onChange={event=>setSubcalcDraft(current=>({...current,ref:event.target.value}))} placeholder="gevel-zuid" /></label>
              <label><span>Omschrijving</span><input value={subcalcDraft.description} onChange={event=>setSubcalcDraft(current=>({...current,description:event.target.value}))} placeholder="Gevel Zuid" /></label>
              <button type="button" onClick={() => void createSubcalculation()}>Deelcalculatie aanmaken</button>
            </section>
            <section className="managementCard">
              <h3>Scope toevoegen</h3>
              <label><span>Deelcalculatie</span><select value={subcalcScopeDraft.subcalculationId} onChange={event=>setSubcalcScopeDraft(current=>({...current,subcalculationId:Number(event.target.value)}))}><option value={0}>Kies…</option>{subcalculations.map(item=><option key={item.id} value={item.id}>{item.description}</option>)}</select></label>
              <label><span>Doorsnede</span><select value={subcalcScopeDraft.scopeType} onChange={event=>setSubcalcScopeDraft(current=>({...current,scopeType:event.target.value}))}><option value="position">Positie</option><option value="facade">Gevel</option><option value="dwelling_type">Woningtype</option><option value="dwelling">Woning</option><option value="building_part">Bouwdeel</option><option value="structure">Calculatiestructuur</option><option value="recipe">Recept</option><option value="building">Gebouw</option><option value="custom">Vrij</option></select></label>
              <label><span>Referentie</span><input value={subcalcScopeDraft.scopeRef} onChange={event=>setSubcalcScopeDraft(current=>({...current,scopeRef:event.target.value}))} placeholder="bijv. N1, Zuid, Type A" /></label>
              <button type="button" disabled={!subcalcScopeDraft.subcalculationId || !subcalcScopeDraft.scopeRef.trim()} onClick={() => void addSubcalculationScope()}>Scope toevoegen</button>
            </section>
            <section className="managementCard managementWide">
              <h3>Huidige deelcalculaties</h3>
              {subcalculations.length===0?<p className="muted">Nog geen deelcalculaties.</p>:<div className="subcalcList">{subcalculations.map(item=>{const result=subcalculationResults.find(row=>row.id===item.id);return <div className="subcalcCard" key={item.id}><div><strong>{item.description}</strong><span>{item.ref}</span></div>{item.scopes.length===0?<small>Nog geen scope.</small>:<div className="scopeTags">{item.scopes.map(scope=><span key={scope.id}>{scope.scopeType}: {scope.scopeRef}</span>)}</div>}<div className="subcalcTotals"><span>Direct <b>{money.format(result?.directCost??0)}</b></span><span>Staartkosten <b>{money.format(result?.allocatedTailCost??0)}</b></span><span>Verkoop <b>{money.format(result?.salesPrice??0)}</b></span><small>{result?.lineIds.length??0} regel(s) · {result?Math.round(result.directShare*1000)/10:0}% van directe kost</small></div></div>})}</div>}
            </section>
          </div>
          {managementStatus && <div className="managementStatus" role="status">{managementStatus}</div>}
        </div>}
        {tailCostOpen && <div className="managementWorkspace">
          <div className="recipeWorkspaceHead"><div><span className="eyebrow">CALC-OWNED</span><h2>Staartkosten</h2><p>De verkoopprijs wordt door Calc opgebouwd bovenop de directe kostprijs.</p></div><button className="panelClose" type="button" onClick={()=>setTailCostOpen(false)}>×</button></div>
          <div className="managementGrid">
            <section className="managementCard"><h3>Component toevoegen</h3>
              <label><span>Hoort bij</span><select value={tailCostDraft.ownerType+":"+tailCostDraft.ownerRef} onChange={e=>{
                const [ownerType,ownerRef=""]=e.target.value.split(":");
                setTailCostDraft(v=>({...v,ownerType,ownerRef,baseScope:"owner_direct_cost",baseRef:""}));
              }}>
                <option value="calculation:">Hoofdcalculatie</option>
                {subcalculations.map(item=><option key={item.id} value={"subcalculation:"+item.ref}>Deelcalculatie · {item.description}</option>)}
              </select></label>
              <label><span>Code</span><input value={tailCostDraft.componentKey} onChange={e=>setTailCostDraft(v=>({...v,componentKey:e.target.value}))} /></label>
              <label><span>Omschrijving</span><input value={tailCostDraft.description} onChange={e=>setTailCostDraft(v=>({...v,description:e.target.value}))} /></label>
              <label><span>Berekening</span><select value={tailCostDraft.basis} onChange={e=>setTailCostDraft(v=>({...v,basis:e.target.value}))}><option value="percentage">Percentage</option><option value="fixed">Vast bedrag</option><option value="per_unit">Per eenheid</option></select></label>
              <label><span>Waarde</span><input type="number" step="0.01" value={tailCostDraft.value} onChange={e=>setTailCostDraft(v=>({...v,value:Number(e.target.value)}))} /></label>
              <label><span>Rekenbasis</span><select value={tailCostDraft.baseScope} onChange={e=>setTailCostDraft(v=>({...v,baseScope:e.target.value}))}>
                <option value="owner_direct_cost">{tailCostDraft.ownerType==="subcalculation"?"Directe kost van deze deelcalculatie":"Alleen hoofdregels"}</option>
                <option value="owner_running_total">{tailCostDraft.ownerType==="subcalculation"?"Lopend totaal van deze deelcalculatie":"Lopend totaal hoofdregels"}</option>
                {tailCostDraft.ownerType==="calculation"&&<><option value="consolidated_direct_cost">Alle unieke directe kosten</option><option value="consolidated_running_total">Geconsolideerd lopend totaal</option></>}
                <option value="quantity">Hoeveelheid</option>
              </select></label>
              {tailCostDraft.basis==="per_unit"&&<label><span>Hoeveelheid</span><input type="number" step="0.01" value={tailCostDraft.quantity??""} onChange={e=>setTailCostDraft(v=>({...v,quantity:e.target.value===""?null:Number(e.target.value)}))} /></label>}
              <label><span>BTW</span><select value={tailCostDraft.vatRegimeId??""} onChange={e=>setTailCostDraft(v=>({...v,vatRegimeId:e.target.value===""?null:Number(e.target.value)}))}><option value="">—</option>{vatRegimes.filter(regime=>regime.active).map(regime=><option key={regime.id} value={regime.id}>{regime.label}{regime.treatment==="normal"&&regime.rate!=null?` (${regime.rate}%)`:regime.treatment==="reverse_charge"?" (verlegd)":regime.treatment==="exempt"?" (vrijgesteld)":""}</option>)}</select></label>
              <button type="button" onClick={()=>void createTailCost()}>Toevoegen</button>
            </section>
            <section className="managementCard managementWide"><h3>Opbouw verkoopprijs</h3>
              <div className="tailCostList">
                <div><span><strong>Alle unieke directe kosten</strong><small>Elke Calc-regel telt één keer, ook als hij in meerdere deelcalculaties zit.</small></span><b>{money.format(totals.direct)}</b></div>
                <div><span><strong>Daarvan hoofdregels</strong><small>Regels die niet onder een deelcalculatie vallen.</small></span><b>{money.format(mainDirectCost)}</b></div>
                {subcalculationResults.filter(row=>row.allocatedTailCost!==0).map(row=><div key={"subtail-"+row.id}><span><strong>Staartkosten · {row.description}</strong><small>Alleen binnen deze deelcalculatie berekend.</small></span><b>{money.format(row.allocatedTailCost)}</b></div>)}
                {evaluatedTailCosts.map(row=><div key={row.id}><span><strong>{row.description}</strong><small>{row.basis==="percentage"?row.value+"%":row.basis==="fixed"?money.format(row.value):money.format(row.value)+" per eenheid"} · {row.baseScope==="owner_direct_cost"?"hoofdregels":row.baseScope==="owner_running_total"?"lopend hoofd":row.baseScope==="consolidated_direct_cost"?"alle unieke directe kosten":row.baseScope==="consolidated_running_total"?"geconsolideerd lopend totaal":row.baseScope} · basis {money.format(row.baseAmount)}</small></span><b>{money.format(row.amount)}</b></div>)}
                <div className="tailCostTotal"><strong>Verkoopprijs</strong><b>{money.format(totals.sales)}</b></div>
              </div>
              {tailCosts.length===0&&<p className="muted">Nog geen staartkosten. De verkoopprijs is dan gelijk aan de directe kostprijs.</p>}
            </section>
          </div>
          {tailCostStatus&&<div className="managementStatus">{tailCostStatus}</div>}
        </div>}
        {columnSettingsOpen && <div className="columnSettingsPanel">
          <div className="columnSettingsHead"><div><strong>Kolommen</strong><span>Toon, verberg, verplaats en stel breedtes in.</span></div><button type="button" onClick={resetColumns}>Standaard herstellen</button></div>
          <div className="columnSettingsList">
            {columnSettings.map((column,index) => <div className="columnSettingRow" key={column.key}>
              <label><input type="checkbox" checked={column.visible} onChange={event => patchColumn(column.key,{visible:event.target.checked})} />{column.label}</label>
              <label className="columnWidth">Breedte <input type="number" min="55" max="600" step="5" value={column.width} onChange={event => patchColumn(column.key,{width:Math.max(55,Math.min(600,Number(event.target.value)||55))})} /> px</label>
              <button type="button" disabled={index===0} onClick={() => moveColumn(column.key,-1)}>↑</button>
              <button type="button" disabled={index===columnSettings.length-1} onClick={() => moveColumn(column.key,1)}>↓</button>
            </div>)}
          </div>
        </div>}
        {priceWorkspaceOpen && <div className="priceWorkspace">
          <div className="priceWorkspaceHead">
            <div><span className="eyebrow">OFFICE PRIJSBRONNEN</span><h2>Artikelen & prijzen</h2><p>Zoek brondata uit BREBO Office of verwerk een nieuwe prijsbron voor deze calculatie.</p></div>
            <button className="panelClose" type="button" onClick={() => setPriceWorkspaceOpen(false)} aria-label="Sluiten">×</button>
          </div>
          <div className="priceActions">
            <label className="priceSearch"><span>Zoeken in artikelen en prijzen</span><input value={priceSearch} onChange={event => setPriceSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void searchArticles(); }} placeholder="Artikelnummer, omschrijving, leverancier…" /></label>
            <button type="button" className="sourceAction" onClick={() => void searchArticles()}><strong>Artikel zoeken</strong><span>Zoek direct in de beheerde Office-artikelstam.</span></button>
            <button type="button" className="sourceAction" onClick={() => setStatus("Import wordt gekoppeld aan Office document-import")}><strong>Prijslijst importeren</strong><span>XML, Excel, PDF, Word of andere bron via Office laten herkennen.</span></button>
            <button type="button" className="sourceAction" onClick={openQuoteUpload}><strong>Offerte inlezen</strong><span>{selectedLineId == null ? "Kies een offertebestand; koppel daarna aan een regel." : `Inlezen voor geselecteerde regel #${selectedLineId}`}</span></button>
            <input ref={quoteFileRef} className="hiddenFile" type="file" accept=".pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={event => void uploadQuote(event.target.files?.[0])} />
          </div>
          <div className="articleSearchStatus">{articleSearchStatus}</div>
          <div className="quoteStatus" role="status" aria-live="polite"><strong>Status offerte:</strong> {quoteStatus}</div>
          {quoteProposal && <div className="quoteReview">
            <div className="quotePreviewPane">
              <div className="quotePreviewTitle"><strong>Originele offerte</strong><span>{quoteProposal.filename}</span></div>
              <iframe title="Originele leveranciersofferte" src={`/api/quotes/${quoteProposal.fileId}/preview`} />
            </div>
            <div className="quoteReviewContent">
            <div className="quoteReviewHead">
              <div><small>HERKENDE OFFERTEPRIJS</small><strong>{quoteProposal.filename}</strong><span>Controleer het voorstel vóór overnemen.</span></div>
              <label><span>Kostendrager</span><select value={quoteCarrier} onChange={event => setQuoteCarrier(event.target.value as CostCarrier)}>
                <option value="material">Materiaal</option>
                <option value="subcontracting">OA</option>
                <option value="equipment">Materieel</option>
                <option value="labour">Arbeid</option>
                <option value="other">Overig</option>
              </select></label>
            </div>
            {quoteProposal.lines.length > 0 ? <div className="quoteStructured">
              <div className="quoteStructuredHead"><div><strong>{quoteProposal.lines.length} offerteregels herkend</strong>{quoteProposal.classification && (() => {
                  const mapped = mapClassification(quoteProposal.classification, classificationScheme);
                  return <small>{mapped ? `${mapped.group} › ${mapped.paragraph} · ` : ""}{Math.round(quoteProposal.classification.confidence * 100)}% herkenning</small>;
                })()}</div><button type="button" onClick={applyQuoteLines}>Geselecteerde regels overnemen</button></div>
              {quoteProposal.lines.map(line => <label className="quoteStructuredLine" key={line.position}>
                <input type="checkbox" checked={selectedQuotePositions.includes(line.position)} onChange={event => setSelectedQuotePositions(current => event.target.checked ? [...current, line.position] : current.filter(position => position !== line.position))} />
                <span className="quotePosition">{line.position}</span>
                <span className="quoteLineDescription"><strong>{line.description}</strong><small>{line.quantity} {line.unit} × {money.format(line.unit_price)}</small>{(line.details || line.source_page || line.offer_summary) && <details className="quoteLineDetails"><summary>Technisch detail</summary><div className="sourceDetailPanel">{line.source_page && (line.source_visual_crop || line.source_visual_search_region) && <SourceVisual fileId={quoteProposal.fileId} page={Number(line.source_page)} crop={line.source_visual_crop} searchRegion={line.source_visual_search_region} textRegions={line.source_text_regions} anchor={line.source_position_bounds} label={`Bronbeeld offertepositie ${line.position}`} />}<div className="sourceDetailContent">{line.detail_fields && Object.keys(line.detail_fields).length > 0 ? <dl className="detailFields">{Object.entries(line.detail_fields).map(([key,value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl> : line.details && <pre>{line.details}</pre>}{line.offer_summary && <div className="offerSummary"><small>CONCEPT OFFERTEOMSCHRIJVING</small><p>{line.offer_summary}</p></div>}</div></div></details>}</span>
                <strong>{money.format(line.line_total)}</strong>
              </label>)}
            </div> : quoteProposal.candidates.length === 0 ? <p className="muted">Office heeft tekst uitgelezen, maar nog geen betrouwbaar bedrag gevonden.</p> :
              <div className="quoteCandidates">{quoteProposal.candidates.map((candidate, index) =>
                <div className={"quoteCandidate" + (index === 0 ? " is-suggested" : "")} key={`${candidate.line_no}-${candidate.value}`}>
                  <div><small>{index === 0 ? "Voorstel" : `Kandidaat ${index + 1}`} · bronregel {candidate.line_no}</small><strong>{money.format(candidate.value)}</strong><span>{candidate.text}</span></div>
                  <button type="button" onClick={() => applyQuoteCandidate(candidate)}>Overnemen</button>
                </div>)}</div>}
            </div>
          </div>}
          {articleResults.length > 0 && <div className="articleResults">
            {articleResults.map(article => <div className="articleResult" key={`${article.supplier_article_id}-${article.price_id}`}>
              <div className="articleIdentity"><small>{article.code}{article.product_group ? ` · ${article.product_group}` : ""}</small><strong>{article.description}</strong><span>{article.supplier} · art. {article.supplier_article_no}</span></div>
              <div><small>Eenheid</small><strong>{article.unit}</strong></div>
              <div><small>Netto</small><strong>{money.format(article.net_price)}</strong><span>{article.price_date}</span></div>
              <button type="button" onClick={() => addArticleLine(article)}>Kiezen</button>
            </div>)}
          </div>}
          <div className="sourcePrinciple"><strong>Office beheert de bron.</strong><span>Calc bewaart bij gebruik een prijssnapshot met Office-referentie, leverancier, prijsdatum en documentbron.</span></div>
        </div>}

        <div className="subcalcWorkmode">
          <label><span>Weergave</span><select value={activeSubcalculationId ?? ""} onChange={event=>{setActiveSubcalculationId(event.target.value?Number(event.target.value):null);setSelectedLineIds([]);}}>
            <option value="">Volledige calculatie</option>
            {subcalculations.map(item=><option key={item.id} value={item.id}>{item.description}</option>)}
          </select></label>
          {activeSubcalculationResult && <div className="subcalcWorkmodeTotals">
            <span><small>Direct</small><strong>{money.format(activeSubcalculationResult.directCost)}</strong></span>
            <span><small>Staartkosten</small><strong>{money.format(activeSubcalculationResult.allocatedTailCost)}</strong></span>
            <span><small>Verkoop</small><strong>{money.format(activeSubcalculationResult.salesPrice)}</strong></span>
            <span><small>Regels</small><strong>{activeSubcalculationResult.lineIds.length}</strong></span>
          </div>}
        </div>

        {selectedLineIds.length > 0 && <div className="bulkBar">
          <strong>{selectedLineIds.length} geselecteerd</strong>
          <button type="button" onClick={bulkDuplicate}>Dupliceren</button>
          <label>Verplaatsen naar
            <select defaultValue="__choose" onChange={event => {
              if (event.target.value === "__choose") return;
              bulkMoveToParent(event.target.value === "" ? null : Number(event.target.value));
              event.currentTarget.value = "__choose";
            }}>
              <option value="__choose">Kies…</option>
              <option value="">Geen bovenliggend niveau</option>
              {lines.filter(parent => parent.lineType === "chapter" || parent.lineType === "paragraph").map(parent =>
                <option key={parent.id} value={parent.id}>{parent.lineType === "chapter" ? "H · " : "P · "}{parent.description}</option>
              )}
            </select>
          </label>
          {subcalculations.length>0 && <label>Toevoegen aan deelcalc
            <select defaultValue="__choose" onChange={event=>{const value=Number(event.target.value);if(value)void addSelectedLinesToSubcalculation(value);event.currentTarget.value="__choose";}}>
              <option value="__choose">Kies…</option>
              {subcalculations.map(item=><option key={item.id} value={item.id}>{item.description}</option>)}
            </select>
          </label>}
          <button type="button" onClick={bulkDetachSource}>Bron loskoppelen</button>
          {activeSubcalculationId!=null && <button type="button" onClick={() => void removeSelectedLinesFromActiveSubcalculation()}>Uit deze deelcalc</button>}
          <button type="button" className="danger" onClick={bulkDelete}>Verwijderen</button>
          <button type="button" onClick={() => setSelectedLineIds([])}>Selectie wissen</button>
        </div>}
        <div className="grid">
          <div className="row head configurableRow" style={{gridTemplateColumns}}>
            {visibleColumns.map(column => <b className={column.key === "code" ? "codeHead resizableHead" : "resizableHead"} key={column.key}>
              {column.key === "code" && <input type="checkbox" aria-label="Alle regels selecteren" checked={workbenchLines.length > 0 && selectedLineIds.length === workbenchLines.length} onChange={event => setSelectedLineIds(event.target.checked ? workbenchLines.map(line => line.id) : [])} />}
              <span>{column.label}</span>
              <span className="columnResizeHandle" role="separator" aria-orientation="vertical" title="Sleep om kolombreedte te wijzigen" onPointerDown={event => startColumnResize(event,column.key)} />
            </b>)}
          </div>
          {workbenchLines.map(line => {
            if (line.lineType === "chapter" || line.lineType === "paragraph") {
              return <div className={line.lineType} key={line.id}>
                <div className="bulkCodeCell" onClick={event => event.stopPropagation()}><input type="checkbox" checked={selectedLineIds.includes(line.id)} onChange={event => toggleBulkLine(line.id, event.target.checked)} /><input value={line.code} onChange={e => patchLine(line.id, { code: e.target.value })} /></div>
                <span>▾</span>
                <input value={line.description} onChange={e => patchLine(line.id, { description: e.target.value })} />
                <LineActions line={line} />
              </div>;
            }
            const cells: Record<ColumnKey, React.ReactNode> = {
              code: <div className="bulkCodeCell cell" onClick={event => event.stopPropagation()}><input type="checkbox" checked={selectedLineIds.includes(line.id)} onChange={event => toggleBulkLine(line.id,event.target.checked)} /><input value={line.code} onChange={e => patchLine(line.id,{code:e.target.value})} /></div>,
              description: <div className="descWrap">
                <input className="cell desc" value={line.description} onChange={e => patchLine(line.id,{description:e.target.value})} />
                {line.priceSourceType === "supplier_quote" && line.sourceDocumentId && (() => {
                  const sameSource = lines.filter(candidate => candidate.priceSourceType === "supplier_quote" && candidate.sourceDocumentId === line.sourceDocumentId);
                  const selectedFromSource = sameSource.filter(candidate => selectedLineIds.includes(candidate.id)).length;
                  const sourceTag = `Offerte #${line.sourceDocumentId}`;
                  return <button type="button" className="priceSourceBadge" title={line.sourceReference ? `${sourceTag}: ${line.sourceReference} — klik om alle ${sameSource.length} regels uit deze bron te selecteren` : `${sourceTag} — klik om alle bronregels te selecteren`} onClick={event => {
                    event.stopPropagation();
                    const ids = sameSource.map(candidate => candidate.id);
                    setSelectedLineIds(current => selectedFromSource === sameSource.length
                      ? current.filter(id => !ids.includes(id))
                      : Array.from(new Set([...current, ...ids])));
                    setStatus(selectedFromSource === sameSource.length
                      ? `${sourceTag}: selectie opgeheven`
                      : `${sameSource.length} regels uit ${sourceTag} geselecteerd`);
                  }}>{sourceTag}</button>;
                })()}
                {(line.sourceDetails || (line.sourceVisualPage && (line.sourceVisualCrop || line.sourceVisualSearchRegion)) || line.sourceOfferSummary) && <details className="calcLineDetails" onClick={event => event.stopPropagation()}><summary>Details uit bronofferte</summary><div className="sourceDetailPanel">{line.sourceVisualPage && (line.sourceVisualCrop || line.sourceVisualSearchRegion) && line.sourceDocumentId && <SourceVisual fileId={line.sourceDocumentId} page={line.sourceVisualPage} crop={line.sourceVisualCrop} searchRegion={line.sourceVisualSearchRegion} textRegions={line.sourceTextRegions} anchor={line.sourcePositionBounds} onDetected={detected => patchLine(line.id,{sourceVisualCrop:detected})} label={`Bronbeeld ${line.code || "offerteregel"}`} />}<div className="sourceDetailContent">{line.sourceDetails && (() => { const fields=parseSourceDetails(line.sourceDetails); return fields.length>0 ? <dl className="detailFields">{fields.map(([key,value],index)=><React.Fragment key={key+"-"+index}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl> : <pre>{line.sourceDetails}</pre>; })()}{line.sourceOfferSummary && <div className="offerSummary"><small>CONCEPT OFFERTEOMSCHRIJVING</small><textarea value={line.sourceOfferSummary} onChange={e => patchLine(line.id,{sourceOfferSummary:e.target.value})} /></div>}</div></div></details>}
              </div>,
              type: <select className="cell" value={line.lineType} onChange={e => patchLine(line.id,{lineType:e.target.value as LineType})}><option value="item">Regel</option><option value="allowance">Stelpost</option><option value="adjustable">Verrekenbaar</option><option value="option">Optie</option><option value="note">Notitie</option></select>,
              unit: <input className="cell" value={line.unit} onChange={e => patchLine(line.id,{unit:e.target.value})} />,
              quantity: <NumberCell value={line.quantity} onChange={quantity => {
                const patch: Partial<Line> = {quantity};
                if(line.labourHoursInputMode==="norm" && line.labourNorm!=null) patch.labourTotalHours=quantity*line.labourNorm;
                else if(line.labourHoursInputMode==="total_hours" && quantity>0 && line.labourTotalHours!=null) patch.labourNorm=line.labourTotalHours/quantity;
                patchLine(line.id,patch);
              }} />,
              norm: <NumberCell value={line.labourNorm ?? 0} onChange={labourNorm => patchLine(line.id,{labourNorm,labourTotalHours:line.quantity*labourNorm,labourHoursInputMode:"norm"})} />,
              hours: <NumberCell value={line.labourTotalHours ?? 0} onChange={labourTotalHours => patchLine(line.id,{labourTotalHours,labourNorm:line.quantity>0?labourTotalHours/line.quantity:line.labourNorm,labourHoursInputMode:"total_hours"})} />,
              hourlyRate: <NumberCell value={line.labour} onChange={labour => patchLine(line.id,{labour})} />,
              material: <NumberCell value={line.material} onChange={material => patchLine(line.id,{material})} />,
              equipment: <NumberCell value={line.equipment} onChange={equipment => patchLine(line.id,{equipment})} />,
              subcontracting: <NumberCell value={line.subcontracting} onChange={subcontracting => patchLine(line.id,{subcontracting})} />,
              other: <NumberCell value={line.other} onChange={other => patchLine(line.id,{other})} />,
              vat: <select className="cell" value={line.vatRegimeId ?? ""} onClick={event=>event.stopPropagation()} onChange={event=>patchLine(line.id,{vatRegimeId:event.target.value===""?null:Number(event.target.value)})}><option value="">—</option>{vatRegimes.filter(regime=>regime.active||regime.id===line.vatRegimeId).map(regime=><option key={regime.id} value={regime.id}>{regime.label}{regime.treatment==="normal"&&regime.rate!=null?` (${regime.rate}%)`:regime.treatment==="reverse_charge"?" (verlegd)":regime.treatment==="exempt"?" (vrijgesteld)":""}</option>)}</select>,
              total: <div className="lineTotalCell"><strong>{line.lineType==="note" ? "—" : money.format(effectiveLineDirect(line))}</strong><LineActions line={line} /></div>
            };
            return <div className={`row data configurableRow type-${line.lineType}${selectedLineId===line.id?" is-selected":""}${selectedLineIds.includes(line.id)?" is-bulk-selected":""}`} style={{gridTemplateColumns}} key={line.id} onClick={() => {setSelectedLineId(line.id);setQuoteStatus(`Regel #${line.id} geselecteerd: ${line.description || "zonder omschrijving"}`);}}>
              {visibleColumns.map(column => <React.Fragment key={column.key}>{cells[column.key]}</React.Fragment>)}
            </div>;
          })}
          {activeSubcalculationId == null ? <button className="newrow" onClick={() => addLine("item")}>+ Nieuwe calculatieregel</button> : <div className="subcalcFilteredNotice">Je werkt nu in een deelcalculatie. Nieuwe regels maak je in de volledige calculatie en koppel je daarna hieraan.</div>}
        </div>
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
