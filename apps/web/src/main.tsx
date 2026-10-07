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
  manualScopes?: Array<{scopeType:ScopeFilterType;scopeRef:string}>;
};
type ColumnKey = "code"|"description"|"type"|"unit"|"quantity"|"norm"|"hours"|"hourlyRate"|"material"|"equipment"|"subcontracting"|"other"|"vat"|"building"|"facade"|"dwelling"|"dwelling_type"|"building_part"|"position"|"recipe"|"source"|"total";
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
  { key:"building", label:"Gebouw", width:130, visible:false },
  { key:"facade", label:"Gevel", width:120, visible:false },
  { key:"dwelling", label:"Woning", width:120, visible:false },
  { key:"dwelling_type", label:"Woningtype", width:130, visible:false },
  { key:"building_part", label:"Bouwdeel", width:130, visible:false },
  { key:"position", label:"Positie", width:110, visible:false },
  { key:"recipe", label:"Recept", width:160, visible:false },
  { key:"source", label:"Bron", width:180, visible:false },
  { key:"total", label:"Totaal", width:125, visible:true }
];
const columnPrefsKey = "brebo.calc.columns.v1";
function loadColumnSettings(): ColumnSetting[] {
  try {
    const raw = localStorage.getItem(columnPrefsKey);
    if (!raw) return defaultColumns;
    const parsed = JSON.parse(raw) as ColumnSetting[];
    const byKey = new Map(parsed.map(item => [item.key,item]));
    const ordered=parsed
      .map(item=>defaultColumns.find(def=>def.key===item.key))
      .filter((item):item is ColumnSetting=>Boolean(item))
      .map(def=>{
        const saved=byKey.get(def.key);
        return saved ? { ...def, visible: saved.visible !== false, width: Math.max(55, Math.min(600, Number(saved.width) || def.width)) } : def;
      });
    const missing=defaultColumns.filter(def=>!byKey.has(def.key));
    return [...ordered,...missing];
  } catch { return defaultColumns; }
}

type ScopeFilterType="building"|"facade"|"dwelling"|"dwelling_type"|"building_part"|"position";
type LineTrace={
  position:string|null;
  recipe:string|null;
  source:string|null;
  scopes:Partial<Record<ScopeFilterType,string[]>>;
};
function lineTrace(line:Line):LineTrace{
  if(line.sourceDetails){
    try{
      const details=JSON.parse(line.sourceDetails) as any;
      const position=String(details?.position_ref??"").trim()||null;
      const recipeKey=String(details?.recipe?.key??"").trim();
      const recipeVersion=details?.recipe?.version==null?"":String(details.recipe.version).trim();
      const recipe=recipeKey?(recipeKey+(recipeVersion?" v"+recipeVersion:"")):null;
      const documents=Array.isArray(details?.evidence?.document_ids)?details.evidence.document_ids.map((value:unknown)=>Number(value)).filter(Number.isFinite):[];
      const pages=Array.isArray(details?.evidence?.pages)?details.evidence.pages.map((value:unknown)=>Number(value)).filter(Number.isFinite):[];
      const source=documents.length
        ? "Doc "+documents.join(", ")+(pages.length?" · p. "+pages.join(", "):"")
        : line.sourceDocumentId
          ? "Doc "+line.sourceDocumentId
          : line.sourceSupplier||line.sourceReference||null;
      const scopes:Partial<Record<ScopeFilterType,string[]>>={};
      if(position)scopes.position=[position];
      if(Array.isArray(details?.context_scopes)){
        for(const item of details.context_scopes){
          const type=String(item?.type??"") as ScopeFilterType;
          const ref=String(item?.ref??"").trim();
          if(!["building","facade","dwelling","dwelling_type","building_part"].includes(type)||!ref)continue;
          const values=scopes[type]??[];
          if(!values.includes(ref))values.push(ref);
          scopes[type]=values;
        }
      }
      for(const item of line.manualScopes??[]){
        const values=scopes[item.scopeType]??[];
        if(!values.includes(item.scopeRef))values.push(item.scopeRef);
        scopes[item.scopeType]=values;
      }
      return{position,recipe,source,scopes};
    }catch{}
  }
  const scopes:Partial<Record<ScopeFilterType,string[]>>={};
  for(const item of line.manualScopes??[]){
    const values=scopes[item.scopeType]??[];
    if(!values.includes(item.scopeRef))values.push(item.scopeRef);
    scopes[item.scopeType]=values;
  }
  return{
    position:scopes.position?.[0]??null,
    recipe:line.priceSourceType==="recipe"&&line.sourceReference?line.sourceReference.split("/")[0]:null,
    source:line.sourceSupplier||(line.sourceDocumentId?"Doc "+line.sourceDocumentId:line.sourceReference),
    scopes
  };
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

type CalcVersionHistoryItem={
  id:number;
  versionNo:number;
  status:"draft"|"established";
  directCost:number;
  markupAmount:number;
  salesPrice:number;
  contentHash:string|null;
  establishedAt:string|null;
  createdAt:string;
  snapshotContract:string|null;
  directCostMix:{labour:number;material:number;equipment:number;subcontracting:number;other:number}|null;
  commercialSummary:{
    purchase:number;
    sales:number;
    margin:number;
    marginPct:number;
    vat:number;
    vatRate:number|null;
    vatBreakdown:Array<{
      code:string;
      label:string;
      rate:number|null;
      taxableBase:number;
      vatAmount:number;
      reverseCharged:boolean;
    }>;
  }|null;
};
type PublicationReadiness={
  canPublish:boolean;
  reasons:string[];
  totals:{directCost:number;markupAmount:number;salesPrice:number;vatTaxableBase:number};
};
type VersionDiff={
  contract:"brebo-calc-version-diff-v1";
  currentVersionNo:number;
  baselineVersionNo:number|null;
  changes:Array<{
    structureKey:string;
    kind:"added"|"removed"|"changed";
    description:string;
    changedFields:string[];
  }>;
  counts:{added:number;removed:number;changed:number};
  commercialDelta:{directCost:number;markupAmount:number;salesPrice:number}|null;
};
type PublicationFreshness={
  contract:"brebo-calc-publication-freshness-v1";
  status:"never_published"|"current"|"draft_pending"|"publish_recovery"|"office_changed"|"version_mismatch";
  message:string;
  latestVersionId:number;
  latestVersionNo:number;
  latestVersionStatus:string;
  latestEstablishedVersionId:number|null;
  officeCalcVersion:string|null;
  officeVersion:string|null;
  currentForOfficeVersion:boolean|null;
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
    sourceSelectionVersion:string|null;
    sourceDecisions:Array<{
      positionRef:string;
      factType:string;
      measurementKind:string|null;
      status:"consistent"|"superseded"|"conflict"|"different_measurement_kind";
      leadingDocumentId:number|null;
      leadingValue:string|null;
      involvedDocumentIds:number[];
      reason:string;
    }>;
  };
  documentTriage: Array<{
    documentId:number;
    title:string;
    documentType:string|null;
    documentFamily:string|null;
    mimeType:string|null;
    status:"primary"|"supporting"|"review"|"excluded";
    score:number;
    factCount:number;
    reviewedFactCount:number;
    positionRefs:string[];
    signals:string[];
    reviewStatus:string;
    automaticStatus:"primary"|"supporting"|"review";
    overridden:boolean;
    overrideReason:string|null;
  }>;
  automationReadiness:{
    canAutoSaveConcept:boolean;
    reasons:string[];
  };
  scopeCoverage:Array<{
    scopeType:"building"|"facade"|"dwelling"|"dwelling_type"|"building_part";
    covered:number;
    total:number;
    missingPositionRefs:string[];
  }>;
  structureProposal:{
    contract:"brebo-calc-structure-proposal-v1";
    chapter:{key:string;label:string};
    groups:Array<{
      key:string;
      label:string;
      recipeRef:string|null;
      positionRefs:string[];
      reviewRequired:boolean;
    }>;
    unresolvedPositionRefs:string[];
    ready:boolean;
  };
  autoBuildEligibility:{
    eligiblePositionRefs:string[];
    blocked:Array<{positionRef:string;reasons:string[]}>;
  };
  recipeSelectionIssues:Array<{
    positionRef:string;
    code:"no_match"|"all_rejected"|"multiple_candidates"|"multiple_accepted";
    message:string;
    candidateRecipeRefs:string[];
  }>;
  recipeProposals: Array<{
    positionRef: string;
    recipeRef: string;
    label: string;
    confidence: number;
    reasons: string[];
    evidence:Array<{
      term:string;
      documentId:number|null;
      sourcePage:number|null;
      sourceFragment:string|null;
      factType:string|null;
    }>;
    reviewRequired: boolean;
  }>;
  derivedTakeoffPositionRefs?: string[];
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
    measurement_kind?: string | null;
    measurement_reference?: string | null;
  }>;
  structure: Array<{
    node_key: string;
    parent_key: string | null;
    node_type: string;
    depth: number;
    code: string | null;
    label: string;
  }>;
  recipeProposalDecisions:Array<{
    positionRef:string;
    recipeVersionId:number;
    decision:"accepted"|"rejected"|"reset";
    reason:string|null;
    sourceSelectionVersion:string|null;
    decidedBy:number;
    current:boolean;
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
  vatBreakdown:Array<{code:string;label:string;rate:number|null;taxableBase:number;vatAmount:number;reverseCharged:boolean}>;
  vat:number;
  salesPriceInclVat:number;
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

type LabourRateRecord={
  id:number;
  roleRef:string;
  label:string;
  hourlyCostRate:number;
  sourceRef:string|null;
  active:boolean;
  isDefault:boolean;
  validFrom:string|null;
  validTo:string|null;
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
const lineContributesToTotals = (line: Line) => ["item","allowance","adjustable"].includes(line.lineType);
const lineDirect = (line: Line) => (line.labourTotalHours ?? 0) * line.labour + line.quantity * (line.material + line.equipment + line.subcontracting + line.other);

function compactQuoteLineDescription(text:string,filename:string):string{
  let value=String(text??"").replace(/\s+/g," ").trim();
  value=value.replace(/^(?:voorstel|kandidaat\s*\d*)\s*[·:\-–—]*\s*/i,"").trim();

  // Alleen een aantoonbare kolomstaart verwijderen: hoeveelheid + eenheid + eindprijs.
  // Technische waarden zoals "100 m2 Rc 3,5" blijven daardoor onderdeel van de omschrijving.
  value=value.replace(
    /\s+\d+(?:[.,]\d+)?\s+(?:st|stuk|stuks|m|m1|m2|m3|meter|kg|uur|uren)\s+(?:€\s*)?-?\d[\d.]*[,.]\d{2}\s*$/i,
    ""
  ).trim();

  // Losse valuta-eindkolom mag eveneens weg, maar alleen als die echt aan het einde staat.
  value=value.replace(/\s+€\s*-?\d[\d.]*[,.]\d{2}\s*$/i,"").trim();

  // Duidelijke boekhoudkundige staart alleen verwijderen wanneer deze als eindsegment staat.
  value=value.replace(/\s+[|;·-]\s*(?:subtotaal|totaal|btw|kredietbeperking)\b.*$/i,"").trim();

  if(!value)return filename;
  return value.length>180?value.slice(0,177).trimEnd()+"…":value;
}

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


type IconName = "office" | "save" | "chapter" | "paragraph" | "line" | "recipe" | "builder" | "prices" | "quote" | "settings" | "help" | "subcalc" | "tail" | "rates";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    office: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></>,
    save: <><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h9V3"/><path d="M7 21v-8h10v8"/></>,
    chapter: <><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/><path d="M8 3v4"/><path d="M8 10v4"/><path d="M8 17v4"/></>,
    paragraph: <><path d="M5 5h14"/><path d="M8 10h11"/><path d="M8 15h11"/><path d="M8 20h7"/><path d="M4 9v7"/></>,
    line: <><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/><path d="M18 16v6"/><path d="M15 19h6"/></>,
    recipe: <><path d="M6 3h12v18H6z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/></>,
    builder: <><path d="M4 20h16"/><path d="M6 17V9l6-5 6 5v8"/><path d="M9 17v-5h6v5"/><path d="m18.5 3 .7 1.6L21 5.3l-1.8.7-.7 1.7-.7-1.7-1.8-.7 1.8-.7.7-1.6Z"/></>,
    prices: <><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.8-.8-1.8-1.2-3-1.2-1.7 0-3 1-3 2.3 0 3.2 6 1.8 6 5 0 1.4-1.3 2.4-3 2.4-1.3 0-2.5-.4-3.4-1.3"/><path d="M12 5v14"/></>,
    quote: <><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h5"/><path d="M8 12h8"/><path d="M8 16h5"/><path d="M8 8h3"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20.3h-3v-.09a1.7 1.7 0 0 0-1.03-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.02 15a1.7 1.7 0 0 0-1.55-1.03H5.4v-3h.09a1.7 1.7 0 0 0 1.55-1.03 1.7 1.7 0 0 0-.34-1.88L6.64 8l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.73 4.7V4.6h3v.09a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.82 8l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03h.09v3h-.09A1.7 1.7 0 0 0 19.4 15Z"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 4.2 1.6c-.9.9-1.9 1.3-1.9 2.8"/><path d="M12 17h.01"/></>,
    subcalc: <><rect x="4" y="5" width="7" height="6" rx="1"/><rect x="13" y="5" width="7" height="6" rx="1"/><rect x="8.5" y="13" width="7" height="6" rx="1"/></>,
    tail: <><path d="M5 5h14"/><path d="M7 10h10"/><path d="M9 15h6"/><path d="M11 20h2"/></>,
    rates: <><path d="M6 4h12v16H6z"/><path d="M9 8h6"/><path d="M9 12h3"/><path d="M14.5 14.5c-1.6 0-2.5.8-2.5 1.8 0 2 4 1 4 2.8 0 1-.9 1.7-2.2 1.7"/><path d="M14 13v8"/></>
  };
  return <svg className="commandIcon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}


function parseDecimalInput(value:string):number|null{
  const normalized=value.trim().replace(/\s/g,"").replace(",",".");
  if(!normalized||normalized==="-"||normalized==="."||normalized==="-.")return null;
  if(!/^-?\d*(?:\.\d*)?$/.test(normalized))return null;
  const parsed=Number(normalized);
  return Number.isFinite(parsed)?parsed:null;
}

function DecimalInput({value,onChange,className="cell number",allowEmpty=false,min,max}:{value:number|null;onChange:(value:number|null)=>void;className?:string;allowEmpty?:boolean;min?:number;max?:number}){
  const [text,setText]=useState(()=>value==null?"":String(value).replace(".",","));
  useEffect(()=>{
    const parsed=parseDecimalInput(text);
    if(value==null){
      if(text!==""&&parsed!==null)setText("");
      return;
    }
    if(parsed===null||Math.abs(parsed-value)>1e-9)setText(String(value).replace(".",","));
  },[value]);
  const commit=(raw:string)=>{
    setText(raw);
    if(raw.trim()===""&&allowEmpty){onChange(null);return;}
    const parsed=parseDecimalInput(raw);
    if(parsed===null)return;
    const bounded=Math.max(min??-Infinity,Math.min(max??Infinity,parsed));
    onChange(bounded);
  };
  return <input className={className} type="text" inputMode="decimal" value={text}
    onChange={event=>commit(event.target.value)} onBlur={()=>{
      if(text.trim()===""&&allowEmpty)return;
      const parsed=parseDecimalInput(text);
      const fallback=value??0;
      const bounded=parsed===null?fallback:Math.max(min??-Infinity,Math.min(max??Infinity,parsed));
      setText(String(bounded).replace(".",","));
      if(parsed!==null)onChange(bounded);
    }}/>;
}

function NumberCell({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <DecimalInput value={value} onChange={next=>onChange(next??0)} />;
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
    sourceOfferSummary: raw.source_offer_summary == null ? null : String(raw.source_offer_summary),
    manualScopes: Array.isArray(raw.manual_scopes) ? (raw.manual_scopes as Array<any>).map(item=>({scopeType:String(item.scopeType) as ScopeFilterType,scopeRef:String(item.scopeRef)})).filter(item=>["building","facade","dwelling","dwelling_type","building_part","position"].includes(item.scopeType)&&item.scopeRef.trim()) : []
  };
}


type DockWindowId="recipe-tree"|"recipe-workspace"|"recipe-library"|"subcalculations"|"tail-costs"|"prices"|"hour-rates"|"kpis";
type DockZone="left"|"right"|"top"|"bottom";
type DockWindowState={pinned:boolean;x:number;y:number;width?:number;height?:number;collapsed?:boolean;dockZone?:DockZone|null};

function PinIcon({pinned}:{pinned:boolean}){
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 4h8"/><path d="M9 4v5l-3 4h12l-3-4V4"/><path d="M12 13v7"/>
    {!pinned&&<path d="M5 19 19 5"/>}
  </svg>;
}

function DockableWindow({id,label,children,collapsible=false,defaultFloating=false}:{id:DockWindowId;label:string;children:React.ReactNode;collapsible?:boolean;defaultFloating?:boolean}){
  const storageKey="brebo-calc-window-"+id;
  const [state,setState]=useState<DockWindowState>(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem(storageKey)??"null") as Partial<DockWindowState>|null;
      const dockZone=["left","right","top","bottom"].includes(String(saved?.dockZone))?saved?.dockZone as DockZone:null;
      return{
        pinned:saved?.pinned!=null?Boolean(saved.pinned):!defaultFloating,
        x:Number(saved?.x??Math.max(80,window.innerWidth*0.22)),
        y:Number(saved?.y??120),
        width:Number.isFinite(Number(saved?.width))?Number(saved?.width):undefined,
        height:Number.isFinite(Number(saved?.height))?Number(saved?.height):undefined,
        collapsed:Boolean(saved?.collapsed),
        dockZone
      };
    }catch{
      return{pinned:!defaultFloating,x:Math.max(80,window.innerWidth*0.22),y:120,collapsed:false,dockZone:null};
    }
  });
  const [zIndex,setZIndex]=useState(100);
  const [dockPreview,setDockPreview]=useState<DockZone|null>(null);
  const [commandbarBottom,setCommandbarBottom]=useState(76);
  const dragRef=useRef<{pointerId:number;startX:number;startY:number;originX:number;originY:number}|null>(null);

  useEffect(()=>{localStorage.setItem(storageKey,JSON.stringify(state));},[state,storageKey]);
  useEffect(()=>{
    const reset=()=>setState({pinned:!defaultFloating,x:Math.max(80,window.innerWidth*0.22),y:Math.max(commandbarBottom+8,120),width:undefined,height:undefined,collapsed:false,dockZone:null});
    window.addEventListener("brebo-calc-reset-windows",reset);
    return()=>window.removeEventListener("brebo-calc-reset-windows",reset);
  },[defaultFloating,commandbarBottom]);
  useEffect(()=>{
    const update=()=>{
      const bar=document.querySelector(".commandbarTop");
      const rect=bar?.getBoundingClientRect();
      const bottom=Math.max(8,Math.ceil(rect?.bottom??68));
      setCommandbarBottom(bottom);
      setState(current=>current.pinned||current.dockZone?current:{
        ...current,
        x:Math.max(8,Math.min(window.innerWidth-280,current.x)),
        y:Math.max(bottom+8,Math.min(window.innerHeight-80,current.y))
      });
    };
    update();
    window.addEventListener("resize",update);
    window.addEventListener("scroll",update,{passive:true});
    return()=>{
      window.removeEventListener("resize",update);
      window.removeEventListener("scroll",update);
    };
  },[]);

  const zoneForPointer=(x:number,y:number):DockZone|null=>{
    const edgeX=Math.max(72,Math.min(150,window.innerWidth*0.07));
    const edgeY=Math.max(72,Math.min(130,window.innerHeight*0.1));
    if(x<=edgeX&&y>=commandbarBottom)return"left";
    if(x>=window.innerWidth-edgeX&&y>=commandbarBottom)return"right";
    if(y>=commandbarBottom&&y<=commandbarBottom+edgeY)return"top";
    if(y>=window.innerHeight-edgeY)return"bottom";
    return null;
  };

  const isScreenDocked=!state.pinned&&state.dockZone!=null;
  const dockStyle:React.CSSProperties|undefined=isScreenDocked
    ? state.dockZone==="left"||state.dockZone==="right"
      ? {top:commandbarBottom,bottom:0,zIndex:40}
      : state.dockZone==="top"
        ? {top:commandbarBottom,zIndex:40}
        : {bottom:0,zIndex:40}
    : undefined;
  const shell=<div
    className={"dockWindow "+(state.pinned?"is-pinned":isScreenDocked?`is-screen-docked dock-${state.dockZone}`:"is-floating")}
    style={state.pinned?undefined:isScreenDocked?dockStyle:{left:state.x,top:Math.max(commandbarBottom+8,state.y),zIndex,width:state.width,height:state.height}}
    onPointerDown={()=>{if(!state.pinned)setZIndex(Date.now()%100000+100);}}
  >
    <div className="dockWindowBar"
      onPointerDown={event=>{
        if(state.pinned||event.button!==0)return;
        const rect=event.currentTarget.parentElement?.getBoundingClientRect();
        const originX=state.dockZone&&rect?rect.left:state.x;
        const originY=state.dockZone&&rect?rect.top:state.y;
        if(state.dockZone){
          setState(current=>({...current,dockZone:null,x:originX,y:originY}));
        }
        dragRef.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,originX,originY};
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event=>{
        const drag=dragRef.current;
        if(!drag||drag.pointerId!==event.pointerId)return;
        const x=Math.max(8,Math.min(window.innerWidth-280,drag.originX+event.clientX-drag.startX));
        const y=Math.max(commandbarBottom+8,Math.min(window.innerHeight-80,drag.originY+event.clientY-drag.startY));
        setState(current=>({...current,x,y,dockZone:null}));
        setDockPreview(zoneForPointer(event.clientX,event.clientY));
      }}
      onPointerUp={event=>{
        const drag=dragRef.current;
        if(!drag||drag.pointerId!==event.pointerId)return;
        const targetZone=zoneForPointer(event.clientX,event.clientY);
        dragRef.current=null;
        setDockPreview(null);
        if(targetZone)setState(current=>({...current,pinned:false,dockZone:targetZone}));
      }}
      onPointerCancel={()=>{
        dragRef.current=null;
        setDockPreview(null);
      }}
    >
      <strong>{label}</strong>
      <div className="dockWindowActions" onPointerDown={event=>event.stopPropagation()} onPointerMove={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()}>
        {collapsible&&<button type="button" className="pinButton" title={state.collapsed?"Uitklappen":"Inklappen"} onClick={event=>{
          event.stopPropagation();
          setState(current=>({...current,collapsed:!current.collapsed}));
        }} aria-label={state.collapsed?"Uitklappen":"Inklappen"}>{state.collapsed?"▾":"▴"}</button>}
        <button type="button" className="pinButton" title={state.pinned?"Losmaken en verslepen":"Terugzetten in Calc"} aria-label={state.pinned?"Losmaken en verslepen":"Terugzetten in Calc"} onClick={event=>{
          event.stopPropagation();
          dragRef.current=null;
          setDockPreview(null);
          setState(current=>{
            if(current.pinned)return{...current,pinned:false,dockZone:null};
            return{...current,pinned:true,dockZone:null};
          });
        }}><PinIcon pinned={state.pinned}/></button>
      </div>
    </div>
    {!state.collapsed&&<div className="dockWindowContent">{children}</div>}
    {!state.pinned&&!isScreenDocked&&!state.collapsed&&<div className="dockResizeHandle" title="Venster groter of kleiner maken" onPointerDown={event=>{
      if(event.button!==0)return;
      event.preventDefault();
      event.stopPropagation();
      const host=event.currentTarget.parentElement;
      if(!host)return;
      const rect=host.getBoundingClientRect();
      const pointerId=event.pointerId;
      const startX=event.clientX,startY=event.clientY,startWidth=rect.width,startHeight=rect.height;
      event.currentTarget.setPointerCapture(pointerId);
      const move=(moveEvent:PointerEvent)=>{
        if(moveEvent.pointerId!==pointerId)return;
        const maxWidth=Math.max(360,window.innerWidth-state.x-8);
        const maxHeight=Math.max(260,window.innerHeight-Math.max(commandbarBottom+8,state.y)-8);
        setState(current=>({...current,width:Math.min(maxWidth,Math.max(420,startWidth+moveEvent.clientX-startX)),height:Math.min(maxHeight,Math.max(280,startHeight+moveEvent.clientY-startY))}));
      };
      const finish=(upEvent:PointerEvent)=>{
        if(upEvent.pointerId!==pointerId)return;
        window.removeEventListener("pointermove",move);
        window.removeEventListener("pointerup",finish);
        window.removeEventListener("pointercancel",finish);
      };
      window.addEventListener("pointermove",move);
      window.addEventListener("pointerup",finish);
      window.addEventListener("pointercancel",finish);
    }} aria-hidden="true" />}
  </div>;
  return <>
    <div className="dockWindowSlot" data-window-slot={id}>{state.pinned?shell:null}</div>
    {!state.pinned&&createPortal(shell,document.body)}
    {dockPreview&&createPortal(<div className={`dockPreview dockPreview-${dockPreview}`} style={dockPreview==="left"||dockPreview==="right"?{top:commandbarBottom,bottom:0}:dockPreview==="top"?{top:commandbarBottom}:undefined} aria-hidden="true"/>,document.body)}
  </>;
}

function App() {
  const [lines, setLines] = useState<Line[]>([]);
  const [project, setProject] = useState<ProjectContext | null>(null);
  const [calculationTitle, setCalculationTitle] = useState("BREBO Calculatie");
  const [classificationScheme,setClassificationScheme]=useState<ClassificationScheme>("nl_sfb");
  const [versionStatus,setVersionStatus]=useState<"draft"|"established">("draft");
  const [versionNo,setVersionNo]=useState(1);
  const [versionHistory,setVersionHistory]=useState<CalcVersionHistoryItem[]>([]);
  const [publicationReadiness,setPublicationReadiness]=useState<PublicationReadiness|null>(null);
  const [publicationFreshness,setPublicationFreshness]=useState<PublicationFreshness|null>(null);
  const [versionDiff,setVersionDiff]=useState<VersionDiff|null>(null);
  const [status, setStatus] = useState("Laden…");
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [nextId, setNextId] = useState(-1);
  const [priceWorkspaceOpen, setPriceWorkspaceOpen] = useState(false);
  const [recipeWorkspaceOpen, setRecipeWorkspaceOpen] = useState(false);
  const [recipeLibraryOpen, setRecipeLibraryOpen] = useState(false);
  const [recipeTreeCollapsed,setRecipeTreeCollapsed]=useState(false);
  const [recipeTreeQuery,setRecipeTreeQuery]=useState("");
  const [recipeTreeExpansion,setRecipeTreeExpansion]=useState<"default"|"all"|"none">("default");
  const [recipeTreeOpenState,setRecipeTreeOpenState]=useState<Record<string,boolean>>({});
  const [recipeDropTargetId,setRecipeDropTargetId]=useState<number|null>(null);
  const [subcalculationOpen, setSubcalculationOpen] = useState(false);
  const [recipes, setRecipes] = useState<CalcRecipe[]>([]);
  const [subcalculations, setSubcalculations] = useState<CalcSubcalculation[]>([]);
  const [subcalculationResults,setSubcalculationResults]=useState<CalcSubcalculationResult[]>([]);
  const [activeSubcalculationId,setActiveSubcalculationId]=useState<number|null>(null);
  const [activeScopeType,setActiveScopeType]=useState<ScopeFilterType>("position");
  const [activeScopeRef,setActiveScopeRef]=useState("");
  const [selectedRecipeVersionId, setSelectedRecipeVersionId] = useState<number | null>(null);
  const [recipeDraft, setRecipeDraft] = useState({ recipeKey:"", name:"", description:"", nlSfbPath:"", stabuPath:"" });
  const [recipeClassificationDraft,setRecipeClassificationDraft]=useState({nlSfbPath:"",stabuPath:""});
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
  const [recipeReviewBusyKey,setRecipeReviewBusyKey]=useState("");
  const [recipeRefreshDelta,setRecipeRefreshDelta]=useState<null|{
    positionRef:string;recipeLabel:string;
    old:{lines:number;quantity:number;labour:number;material:number;equipment:number;subcontracting:number;other:number};
    next:{lines:number;quantity:number;labour:number;material:number;equipment:number;subcontracting:number;other:number};
    lineChanges:Array<{
      key:string;
      kind:"added"|"removed"|"changed";
      description:string;
      oldQuantity:number|null;
      nextQuantity:number|null;
      oldDirect:number|null;
      nextDirect:number|null;
      impact:"higher"|"lower"|"neutral";
    }>;
  }>(null);
  const [structureProposalStatus,setStructureProposalStatus]=useState("");
  const [documentTriageStatus,setDocumentTriageStatus]=useState("");
  const [priceSearch, setPriceSearch] = useState("");
  const [articleResults, setArticleResults] = useState<ArticleSearchItem[]>([]);
  const [articleSearchStatus, setArticleSearchStatus] = useState("Zoek in de centrale Office-artikelstam.");
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [collapsedStructureIds,setCollapsedStructureIds]=useState<Set<number>>(()=>new Set());
  const collapseStateKey=project?.id ? `brebo.calc.structure-collapse.v1.${project.id}.${versionNo}` : null;
  useEffect(()=>{
    if(!collapseStateKey){setCollapsedStructureIds(new Set());return;}
    try{
      const parsed=JSON.parse(localStorage.getItem(collapseStateKey)??"[]");
      setCollapsedStructureIds(new Set(Array.isArray(parsed)?parsed.map(Number).filter(Number.isFinite):[]));
    }catch{setCollapsedStructureIds(new Set());}
  },[collapseStateKey]);
  useEffect(()=>{
    if(!collapseStateKey)return;
    localStorage.setItem(collapseStateKey,JSON.stringify([...collapsedStructureIds]));
  },[collapseStateKey,collapsedStructureIds]);
  const [selectedLineIds, setSelectedLineIds] = useState<number[]>([]);
  const [manualScopeType,setManualScopeType]=useState<ScopeFilterType>("position");
  const [manualScopeRef,setManualScopeRef]=useState("");
  const [allocations, setAllocations] = useState<LineAllocation[]>([]);
  const [quoteStatus, setQuoteStatus] = useState("Selecteer eerst een calculatieregel.");
  const [quoteProposal, setQuoteProposal] = useState<QuoteProposal | null>(null);
  const [quoteCarrier, setQuoteCarrier] = useState<CostCarrier>("subcontracting");
  const [selectedQuotePositions, setSelectedQuotePositions] = useState<string[]>([]);
  const [columnSettings, setColumnSettings] = useState<ColumnSetting[]>(() => loadColumnSettings());
  const [columnPreferencesLoaded,setColumnPreferencesLoaded]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [helpOpen,setHelpOpen]=useState(false);
  const [helpQuery,setHelpQuery]=useState("");
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
  const [labourRatesOpen,setLabourRatesOpen]=useState(false);
  const [labourRates,setLabourRates]=useState<LabourRateRecord[]>([]);
  const [labourRateStatus,setLabourRateStatus]=useState("");
  const [labourRateDraft,setLabourRateDraft]=useState({
    roleRef:"",
    label:"",
    hourlyCostRate:0,
    sourceRef:"",
    active:true,
    isDefault:false,
    validFrom:"",
    validTo:""
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
  const [financialIntegrityStatus,setFinancialIntegrityStatus]=useState("");
  const quoteFileRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(() => {
    const direct = lines.filter(line => lineContributesToTotals(line)).reduce((sum, line) => sum + lineDirect(line), 0);
    const tailCost = tailCostTotal;
    return { direct, markupAmount: tailCost, sales: direct + tailCost };
  }, [lines, tailCostTotal]);

  const liveVatTotals = useMemo(() => {
    const byRegime=new Map<number,{regime:VatRegime;taxableBase:number;vatAmount:number}>();
    const add=(vatRegimeId:number|null|undefined,amount:number)=>{
      if(vatRegimeId==null||!Number.isFinite(amount)||Math.abs(amount)<0.000001)return;
      const regime=vatRegimes.find(item=>item.id===vatRegimeId);
      if(!regime)return;
      const current=byRegime.get(vatRegimeId)??{regime,taxableBase:0,vatAmount:0};
      current.taxableBase+=amount;
      current.vatAmount=regime.treatment==="normal"
        ? current.taxableBase*((regime.rate??0)/100)
        : 0;
      byRegime.set(vatRegimeId,current);
    };
    const incoming=new Map<number,number>();
    const outgoing=new Map<number,number>();
    for(const allocation of allocations){
      incoming.set(allocation.targetLineId,(incoming.get(allocation.targetLineId)??0)+allocation.amount);
      outgoing.set(allocation.sourceLineId,(outgoing.get(allocation.sourceLineId)??0)+allocation.amount);
    }
    for(const line of lines){
      if(lineContributesToTotals(line)){
        const effective=lineDirect(line)-(outgoing.get(line.id)??0)+(incoming.get(line.id)??0);
        add(line.vatRegimeId,effective);
      }
    }
    for(const tail of evaluatedTailCosts)add(tail.vatRegimeId,tail.amount);
    const breakdown=[...byRegime.values()]
      .map(item=>({
        code:item.regime.code,
        label:item.regime.label,
        rate:item.regime.rate,
        treatment:item.regime.treatment,
        taxableBase:item.taxableBase,
        vatAmount:item.vatAmount
      }))
      .sort((a,b)=>a.label.localeCompare(b.label,"nl"));
    const vat=breakdown.reduce((sum,item)=>sum+item.vatAmount,0);
    return{breakdown,vat,totalInclVat:totals.sales+vat};
  },[lines,allocations,evaluatedTailCosts,vatRegimes,totals.sales]);

  const unresolvedLines = useMemo(
    () => lines.filter(line => line.resolutionStatus === "unresolved"),
    [lines]
  );
  const incompleteLabourLines = useMemo(
    () => lines.filter(line =>
      isCostLine(line) &&
      line.lineType !== "option" &&
      line.labour > 0 &&
      line.labourTotalHours == null
    ),
    [lines]
  );
  const calculationReady = unresolvedLines.length === 0 && incompleteLabourLines.length === 0;

  const activeSubcalculationResult = useMemo(
    () => activeSubcalculationId == null ? null : subcalculationResults.find(row => row.id === activeSubcalculationId) ?? null,
    [activeSubcalculationId, subcalculationResults]
  );

  const availableScopeValues=useMemo(()=>{
    const values=new Set<string>();
    for(const line of lines){
      for(const value of lineTrace(line).scopes[activeScopeType]??[])values.add(value);
    }
    return [...values].sort((a,b)=>a.localeCompare(b,"nl"));
  },[lines,activeScopeType]);

  useEffect(()=>{
    if(activeScopeRef&&!availableScopeValues.includes(activeScopeRef))setActiveScopeRef("");
  },[activeScopeRef,availableScopeValues]);

  const activeScopeCoverage=useMemo(()=>{
    if(activeScopeType==="position")return null;
    return aggregate?.scopeCoverage.find(item=>item.scopeType===activeScopeType)??null;
  },[aggregate,activeScopeType]);

  const scopeOverview=useMemo(()=>{
    const incoming=new Map<number,number>();
    const outgoing=new Map<number,number>();
    for(const allocation of allocations){
      incoming.set(allocation.targetLineId,(incoming.get(allocation.targetLineId)??0)+allocation.amount);
      outgoing.set(allocation.sourceLineId,(outgoing.get(allocation.sourceLineId)??0)+allocation.amount);
    }
    return availableScopeValues.map(scopeRef=>{
      const scopedCostLines=lines.filter(line=>lineContributesToTotals(line)&&(lineTrace(line).scopes[activeScopeType]??[]).includes(scopeRef));
      const directCost=scopedCostLines.reduce((sum,line)=>sum+lineDirect(line)-(outgoing.get(line.id)??0)+(incoming.get(line.id)??0),0);
      const subcalculation=subcalculations.find(item=>item.scopes.some(scope=>scope.scopeType===activeScopeType&&scope.scopeRef===scopeRef))??null;
      const result=subcalculation?subcalculationResults.find(item=>item.id===subcalculation.id)??null:null;
      return{
        scopeRef,
        lineCount:scopedCostLines.length,
        directCost,
        subcalculationId:subcalculation?.id??null,
        salesPrice:result?.salesPrice??null,
        tailCost:result?.allocatedTailCost??null
      };
    });
  },[availableScopeValues,lines,allocations,activeScopeType,subcalculations,subcalculationResults]);

  const workbenchLines = useMemo(() => {
    let base=lines;
    if (activeSubcalculationResult) {
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
      base=lines.filter(line => included.has(line.id));
    }
    if(!activeScopeRef)return base;
    const included=new Set(base.filter(line=>(lineTrace(line).scopes[activeScopeType]??[]).includes(activeScopeRef)).map(line=>line.id));
    const lineById=new Map(base.map(line=>[line.id,line]));
    for(const id of [...included]){
      let parentId=lineById.get(id)?.parentId??null;
      while(parentId!=null){
        if(included.has(parentId))break;
        included.add(parentId);
        parentId=lineById.get(parentId)?.parentId??null;
      }
    }
    return base.filter(line=>included.has(line.id));
  }, [lines, activeSubcalculationResult,activeScopeType,activeScopeRef]);

  const visibleWorkbenchLines=useMemo(()=>{
    const byId=new Map(workbenchLines.map(line=>[line.id,line]));
    return workbenchLines.filter(line=>{
      let parentId=line.parentId;
      const seen=new Set<number>();
      while(parentId!=null&&!seen.has(parentId)){
        if(collapsedStructureIds.has(parentId))return false;
        seen.add(parentId);
        parentId=byId.get(parentId)?.parentId??null;
      }
      return true;
    });
  },[workbenchLines,collapsedStructureIds]);

  const collapsibleStructureIds=useMemo(
    ()=>workbenchLines.filter(line=>line.lineType==="chapter"||line.lineType==="paragraph").map(line=>line.id),
    [workbenchLines]
  );
  useEffect(()=>{
    const valid=new Set(collapsibleStructureIds);
    setCollapsedStructureIds(current=>{
      const next=new Set([...current].filter(id=>valid.has(id)));
      if(next.size===current.size&&[...next].every(id=>current.has(id)))return current;
      return next;
    });
  },[collapsibleStructureIds]);
  const collapseAllStructure=()=>setCollapsedStructureIds(new Set(collapsibleStructureIds));
  const expandAllStructure=()=>setCollapsedStructureIds(new Set());

  const structureMetrics=useMemo(()=>{
    const lineById=new Map(workbenchLines.map(line=>[line.id,line]));
    const children=new Map<number|null,Line[]>();
    const incomingByLine=new Map<number,number>();
    const outgoingByLine=new Map<number,number>();
    for(const allocation of allocations){
      // Allocations move financial ownership between lines. A filtered view may
      // therefore legitimately import/export cost from a line outside the filter.
      incomingByLine.set(allocation.targetLineId,(incomingByLine.get(allocation.targetLineId)??0)+allocation.amount);
      outgoingByLine.set(allocation.sourceLineId,(outgoingByLine.get(allocation.sourceLineId)??0)+allocation.amount);
    }
    const effectiveDirect=(line:Line)=>
      lineDirect(line)-(outgoingByLine.get(line.id)??0)+(incomingByLine.get(line.id)??0);
    for(const line of workbenchLines){
      const list=children.get(line.parentId)??[];
      list.push(line);
      children.set(line.parentId,list);
    }
    const depthOf=(line:Line)=>{
      let depth=1;
      let parentId=line.parentId;
      const seen=new Set<number>();
      while(parentId!=null&&!seen.has(parentId)){
        seen.add(parentId);
        const parent=lineById.get(parentId);
        if(!parent)break;
        depth+=1;
        parentId=parent.parentId;
      }
      return depth;
    };
    const subtotal=(id:number,seen=new Set<number>()):number=>{
      if(seen.has(id))return 0;
      seen.add(id);
      return(children.get(id)??[]).reduce((sum,child)=>{
        if(isCostLine(child)&&child.lineType!=="option")return sum+effectiveDirect(child);
        if(child.lineType==="chapter"||child.lineType==="paragraph")return sum+subtotal(child.id,seen);
        return sum;
      },0);
    };
    const result=new Map<number,{depth:number;subtotal:number}>();
    for(const line of workbenchLines){
      if(line.lineType==="chapter"||line.lineType==="paragraph"){
        result.set(line.id,{depth:depthOf(line),subtotal:subtotal(line.id)});
      }
    }
    return result;
  },[workbenchLines,allocations]);

  const maxStructureDepth=useMemo(
    ()=>Math.max(1,...[...structureMetrics.values()].map(metric=>metric.depth)),
    [structureMetrics]
  );
  const showStructureThroughLevel=(level:number)=>{
    const collapseIds=workbenchLines
      .filter(line=>{
        if(line.lineType!=="chapter"&&line.lineType!=="paragraph")return false;
        const depth=structureMetrics.get(line.id)?.depth??1;
        return depth>=level;
      })
      .map(line=>line.id);
    setCollapsedStructureIds(new Set(collapseIds));
  };

  const displayedTotals = activeSubcalculationResult
    ? {
        direct: activeSubcalculationResult.directCost,
        markupAmount: activeSubcalculationResult.allocatedTailCost,
        sales: activeSubcalculationResult.salesPrice
      }
    : totals;
  const classificationLabel:Record<ClassificationScheme,string>={nl_sfb:"NL-SfB",stabu:"STABU",custom:"Vrij"};
  type ClassificationFolder={code:string;label:string;children?:ClassificationFolder[]};
  const nlSfbFolders:ClassificationFolder[]=[
    {code:"1-",label:"Funderingen",children:[
      {code:"10",label:"Onderbouw"},{code:"11",label:"Bodemvoorzieningen"},{code:"13",label:"Vloeren op grondslag"},{code:"16",label:"Funderingsconstructie"},{code:"17",label:"Paalfundering"},{code:"19",label:"Onderbouw algemeen"}
    ]},
    {code:"2-",label:"Bovenbouw",children:[
      {code:"20",label:"Bovenbouw"},{code:"21",label:"Buitenwanden"},{code:"22",label:"Binnenwanden"},{code:"23",label:"Vloeren, galerijen"},{code:"24",label:"Trappen, hellingen"},{code:"27",label:"Daken"},{code:"28",label:"Hoofddraagconstructies"},{code:"29",label:"Bovenbouw algemeen"}
    ]},
    {code:"3-",label:"Afbouw",children:[
      {code:"30",label:"Afbouw"},{code:"31",label:"Wandopeningen, buiten"},{code:"32",label:"Wandopeningen, binnen"},{code:"33",label:"Vloeropeningen"},{code:"34",label:"Balustrades e.d."},{code:"35",label:"Plafonds"},{code:"37",label:"Dakopeningen"},{code:"38",label:"Inbouwpakketten"},{code:"39",label:"Afbouw algemeen"}
    ]},
    {code:"4-",label:"Afwerkingen",children:[
      {code:"40",label:"Afwerkingen"},{code:"41",label:"Buitenwandafwerkingen"},{code:"42",label:"Binnenwandafwerkingen"},{code:"43",label:"Vloerafwerkingen"},{code:"44",label:"Trap- en hellingafwerkingen"},{code:"45",label:"Plafondafwerkingen"},{code:"47",label:"Dakafwerkingen"},{code:"48",label:"Afwerkingspakketten"},{code:"49",label:"Afwerking algemeen"}
    ]},
    {code:"5-",label:"Installaties werktuigbouwkundig",children:[
      {code:"50",label:"Mechanische installaties"},{code:"51",label:"Warmteopwerkingsinstallaties"},{code:"52",label:"Rioleringsinstallaties"},{code:"53",label:"Waterinstallaties"},{code:"54",label:"Gasinstallaties"},{code:"55",label:"Koelinstallaties"},{code:"56",label:"Warmtedistributie-installaties"},{code:"57",label:"Luchtbehandelingsinstallaties"},{code:"58",label:"Klimaatregelingsinstallaties"},{code:"59",label:"Mechanische installaties algemeen"}
    ]},
    {code:"6-",label:"Installaties elektrotechnisch",children:[
      {code:"60",label:"Elektrische installaties"},{code:"61",label:"Centrale elektrotechnische installaties"},{code:"62",label:"Krachtstroominstallaties"},{code:"63",label:"Verlichtingsinstallaties"},{code:"64",label:"Communicatie-installaties"},{code:"65",label:"Beveiligingsinstallaties"},{code:"66",label:"Transportinstallaties"},{code:"67",label:"Gebouwmanagement systeem"},{code:"69",label:"Elektrische installaties algemeen"}
    ]},
    {code:"7-",label:"Vaste inrichtingen",children:[
      {code:"70",label:"Vaste inrichtingen"},{code:"71",label:"Vaste verkeersvoorzieningen"},{code:"72",label:"Vaste gebruikersvoorzieningen"},{code:"73",label:"Vaste keukenvoorzieningen"},{code:"74",label:"Vaste sanitaire voorzieningen"},{code:"75",label:"Vaste onderhoudsvoorzieningen"},{code:"76",label:"Vaste opslagvoorzieningen"},{code:"79",label:"Vaste inrichtingen algemeen"}
    ]},
    {code:"8-",label:"Losse inrichting",children:[
      {code:"80",label:"Losse inrichting"},{code:"81",label:"Losse inventaris verkeersruimten"},{code:"82",label:"Losse inventaris gebruiksruimten"},{code:"83",label:"Losse keukeninventaris"},{code:"84",label:"Losse sanitaire inventaris"},{code:"85",label:"Losse schoonmaakinventaris"},{code:"86",label:"Losse opberginventaris"},{code:"89",label:"Losse inventaris algemeen"}
    ]},
    {code:"9-",label:"Terrein",children:[
      {code:"90",label:"Terrein"},{code:"91",label:"Grondvoorzieningen"},{code:"92",label:"Opstallen"},{code:"93",label:"Omheiningen"},{code:"94",label:"Terreinafwerkingen"},{code:"95",label:"Terreininstallaties werktuigkundig"},{code:"96",label:"Terreininstallaties elektrotechnisch"},{code:"97",label:"Terreininrichting standaard"},{code:"98",label:"Terreininrichting bijzonder"},{code:"99",label:"Terrein algemeen"}
    ]}
  ];
  const stabuFolders:ClassificationFolder[]=[
    {code:"00",label:"Algemeen"},{code:"01",label:"Voor het werk geldende voorwaarden"},{code:"05",label:"Bouwplaatsvoorzieningen"},{code:"06",label:"Door de aannemer aan te leveren documenten"},
    {code:"10",label:"Stut- en sloopwerk"},{code:"12",label:"Grondwerk"},{code:"14",label:"Buitenriolering en drainage"},{code:"15",label:"Terreinverhardingen"},{code:"16",label:"Beplanting"},{code:"17",label:"Terreininrichting"},
    {code:"20",label:"Funderingspalen en damwanden"},{code:"21",label:"Betonwerk"},{code:"22",label:"Metselwerk"},{code:"23",label:"Vooraf vervaardigde steenachtige elementen"},{code:"24",label:"Ruwbouwtimmerwerk"},{code:"25",label:"Metaalconstructiewerk"},{code:"26",label:"Bouwkundige kanaalelementen"},
    {code:"30",label:"Kozijnen, ramen en deuren"},{code:"31",label:"Systeembekledingen"},{code:"32",label:"Trappen en balustraden"},{code:"33",label:"Dakbedekkingen"},{code:"34",label:"Beglazing"},{code:"35",label:"Natuur- en kunststeen"},{code:"36",label:"Voegvulling"},{code:"37",label:"Na-isolatie"},{code:"38",label:"Gevelschermen"},
    {code:"40",label:"Stukadoorwerk"},{code:"41",label:"Tegelwerk"},{code:"42",label:"Dekvloeren en vloersystemen"},{code:"43",label:"Metaal- en kunststofwerk"},{code:"44",label:"Plafond- en wandsystemen"},{code:"45",label:"Afbouwtimmerwerk"},{code:"46",label:"Schilderwerk"},{code:"47",label:"Binneninrichting"},{code:"48",label:"Behangwerk, vloerbedekking en stoffering"},
    {code:"50",label:"Dakgoten en hemelwaterafvoeren"},{code:"51",label:"Binnenriolering"},{code:"52",label:"Waterinstallaties"},{code:"53",label:"Sanitair"},{code:"54",label:"Brandbestrijdingsinstallaties"},{code:"55",label:"Gasinstallaties"},{code:"56",label:"Perslucht- en vacuüminstallaties"},{code:"57",label:"Technische inrichting"},
    {code:"60",label:"Verwarmingsinstallaties"},{code:"61",label:"Ventilatie- en luchtbehandelingsinstallaties"},{code:"62",label:"Koelinstallaties"},{code:"68",label:"Regelinstallaties"},
    {code:"70",label:"Elektrotechnische installaties"},{code:"75",label:"Communicatie- en beveiligingsinstallaties"},{code:"78",label:"Gebouwenbeheersystemen"},
    {code:"80",label:"Liftinstallaties"},{code:"81",label:"Roltrappen en rolpaden"},{code:"82",label:"Hijs- en hefinstallaties"},{code:"83",label:"Goederentransport- en distributiesystemen"},{code:"84",label:"Gevelonderhoudinstallaties"}
  ];

  const classificationCode=(value:string)=>value.split("·",1)[0].trim();
  const canonicalClassificationCode=(value:string)=>classificationCode(value).replace(/\s+/g,"");
  const classificationPartLabel=(value:string)=>{
    const parts=value.split("·");
    return parts.length>1?parts.slice(1).join("·").trim():"";
  };
  const classificationFolderAt=(scheme:ClassificationScheme,path:string[],index:number):ClassificationFolder|null=>{
    if(scheme==="custom")return null;
    let folders=scheme==="nl_sfb"?nlSfbFolders:stabuFolders;
    let match:ClassificationFolder|null=null;
    for(let depth=0;depth<=index;depth++){
      const wanted=canonicalClassificationCode(path[depth]??"");
      match=folders.find(folder=>canonicalClassificationCode(folder.code)===wanted)??null;
      if(!match)return null;
      folders=match.children??[];
    }
    return match;
  };

  const recipeClassificationPath=(recipe:CalcRecipe,scheme:ClassificationScheme):string[]=>{
    if(scheme==="custom"){
      const category=typeof recipe.applicability?.category==="string"?String(recipe.applicability.category).trim():"";
      const keyParts=recipe.recipeKey.split(/[\\/:>]+/).map(item=>item.trim()).filter(Boolean);
      return(category?category.split(/[\\/:>]+/):keyParts.slice(0,-1)).map(item=>item.trim()).filter(Boolean);
    }
    const applicability=recipe.applicability??{};
    const classification=applicability.classification&&typeof applicability.classification==="object"&&!Array.isArray(applicability.classification)
      ? applicability.classification as Record<string,unknown>
      : {};
    const schemeValue=classification[scheme];
    const raw=typeof schemeValue==="string"
      ? schemeValue
      : schemeValue&&typeof schemeValue==="object"&&!Array.isArray(schemeValue)
        ? String((schemeValue as Record<string,unknown>).path??(schemeValue as Record<string,unknown>).code??"")
        : "";
    return raw.split(/[\\/>]+/).map(item=>item.trim()).filter(Boolean);
  };
  const recipeClassificationPaths=(recipe:CalcRecipe)=>{
    const applicability=recipe.applicability??{};
    const classification=applicability.classification&&typeof applicability.classification==="object"&&!Array.isArray(applicability.classification)
      ? applicability.classification as Record<string,unknown>
      : {};
    const read=(scheme:"nl_sfb"|"stabu")=>{
      const value=classification[scheme];
      return typeof value==="string"?value:value&&typeof value==="object"&&!Array.isArray(value)?String((value as Record<string,unknown>).path??""):"";
    };
    return{nlSfbPath:read("nl_sfb"),stabuPath:read("stabu")};
  };

  type RecipeTreeNode={name:string;path:string;children:RecipeTreeNode[];items:CalcRecipe[]};
  const seedClassificationFolders=(root:RecipeTreeNode,folders:ClassificationFolder[],prefix="")=>{
    for(const folder of folders){
      const name=`${folder.code} · ${folder.label}`;
      const path=prefix?`${prefix} / ${name}`:name;
      let node=root.children.find(item=>item.path===path);
      if(!node){
        node={name,path,children:[],items:[]};
        root.children.push(node);
      }
      if(folder.children?.length)seedClassificationFolders(node,folder.children,path);
    }
  };
  const recipeTree=useMemo(()=>{
    const root:RecipeTreeNode={name:"",path:"",children:[],items:[]};
    const query=recipeTreeQuery.trim().toLocaleLowerCase("nl");
    if(!query){
      if(classificationScheme==="nl_sfb")seedClassificationFolders(root,nlSfbFolders);
      if(classificationScheme==="stabu")seedClassificationFolders(root,stabuFolders);
    }
    const source=recipes.filter(recipe=>{
      if(recipe.status==="archived")return false;
      if(!query)return true;
      const classifications=recipeClassificationPaths(recipe);
      return [recipe.name,recipe.recipeKey,recipe.description??"",classifications.nlSfbPath,classifications.stabuPath]
        .some(value=>value.toLocaleLowerCase("nl").includes(query));
    });
    for(const recipe of source){
      const pathParts=recipeClassificationPath(recipe,classificationScheme);
      const parts=pathParts.length?pathParts:[classificationScheme==="custom"?"Algemeen":"Niet geclassificeerd"];
      let node=root;
      for(const part of parts){
        const normalizedPart=part.trim();
        let child=node.children.find(item=>item.name===normalizedPart||item.name.startsWith(normalizedPart+" · "));
        if(!child){
          const path=node.path?`${node.path} / ${normalizedPart}`:normalizedPart;
          child={name:normalizedPart,path,children:[],items:[]};
          node.children.push(child);
        }
        node=child;
      }
      node.items.push(recipe);
    }
    const sortNode=(node:RecipeTreeNode)=>{
      node.children.sort((a,b)=>a.name.localeCompare(b.name,"nl"));
      node.items.sort((a,b)=>a.name.localeCompare(b.name,"nl"));
      node.children.forEach(sortNode);
    };
    sortNode(root);
    return root;
  },[recipes,recipeTreeQuery,classificationScheme]);

  const recipeTreeItemCount=(node:RecipeTreeNode):number=>
    node.items.length+node.children.reduce((sum,child)=>sum+recipeTreeItemCount(child),0);
  const recipeTreePaths=(nodes:RecipeTreeNode[]):string[]=>
    nodes.flatMap(node=>[node.path,...recipeTreePaths(node.children)]);
  const recipeTreeDepth=(node:RecipeTreeNode):number=>node.path?node.path.split(" / ").length:0;
  const renderRecipeTreeNodes=(nodes:RecipeTreeNode[]):React.ReactNode=>nodes.map(node=>{
    const depth=recipeTreeDepth(node);
    const forcedBySearch=recipeTreeQuery.trim().length>0;
    const openByDefault=recipeTreeExpansion==="all"?true:recipeTreeExpansion==="none"?false:(recipeTreeOpenState[node.path]??depth===1);
    const isOpen=forcedBySearch||openByDefault;
    return(
    <details className="recipeTreeGroup" open={isOpen} key={node.path} onToggle={event=>{
      if(forcedBySearch)return;
      const open=event.currentTarget.open;
      setRecipeTreeOpenState(current=>current[node.path]===open?current:{...current,[node.path]:open});
      if(recipeTreeExpansion!=="default")setRecipeTreeExpansion("default");
    }}>
      <summary title={classificationScheme==="custom"?"":versionStatus==="established"?"Start een nieuwe conceptversie om structuur toe te voegen":"Dubbelklik om deze classificatiestructuur aan de calculatie toe te voegen"} onDoubleClick={event=>{event.preventDefault();event.stopPropagation();addClassificationPathToCalculation(node.path);}}><span>{node.name}</span><small>{recipeTreeItemCount(node)}</small></summary>
      <div className="recipeTreeBranch">
        {renderRecipeTreeNodes(node.children)}
        <div className="recipeTreeItems">{node.items.map(recipe=>
          <button
            type="button"
            className="recipeTreeItem"
            key={recipe.id}
            draggable={versionStatus!=="established"}
            title="Sleep dit recept naar een paragraaf in de calculatie"
            onDragStart={event=>{
              event.dataTransfer.effectAllowed="copy";
              event.dataTransfer.setData(recipeDragMime,String(recipe.id));
              event.dataTransfer.setData("text/plain",recipe.name);
              setSelectedRecipeVersionId(recipe.id);
            }}
            onDoubleClick={()=>{
              setSelectedRecipeVersionId(recipe.id);
              setRecipeWorkspaceOpen(true);
              setRecipeActionStatus(`${recipe.name} geselecteerd. Kies een doelparagraaf en bronpositie.`);
            }}
          >
            <span className="recipeTreeGrip" aria-hidden="true">⋮⋮</span>
            <span><strong>{recipe.name}</strong><small>{recipe.recipeKey} · v{recipe.versionNo}</small></span>
          </button>
        )}</div>
      </div>
    </details>
    );
  });

  const directCostMix = useMemo(() => {
    const amounts=activeSubcalculationResult
      ? {...activeSubcalculationResult.costs}
      : lines.filter(line=>lineContributesToTotals(line)).reduce((sum,line)=>{
          sum.labour+=(line.labourTotalHours??0)*line.labour;
          sum.material+=line.quantity*line.material;
          sum.equipment+=line.quantity*line.equipment;
          sum.subcontracting+=line.quantity*line.subcontracting;
          sum.other+=line.quantity*line.other;
          return sum;
        },{labour:0,material:0,equipment:0,subcontracting:0,other:0});
    const total=Object.values(amounts).reduce((sum,value)=>sum+value,0);
    const rows=[
      {key:"labour",label:"Arbeid",amount:amounts.labour},
      {key:"material",label:"Materiaal",amount:amounts.material},
      {key:"equipment",label:"Materieel",amount:amounts.equipment},
      {key:"subcontracting",label:"Onderaanneming",amount:amounts.subcontracting},
      {key:"other",label:"Overig",amount:amounts.other}
    ].filter(item=>item.amount>0.000001).map(item=>({
      ...item,
      percentage:total>0?(item.amount/total)*100:0
    }));
    let offset=0;
    const segments=rows.map(item=>{
      const segment={...item,offset};
      offset+=item.percentage;
      return segment;
    });
    return{total,rows,segments};
  },[lines,activeSubcalculationResult]);

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
        if(!response.ok)throw new Error("BTW-keuzes konden niet worden geladen.");
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
    setVatSettingsStatus("BTW-instellingen laden…");
    try{
      const response=await fetch("/api/settings/vat-regimes",{headers:{Accept:"application/json"}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(payload.error??"BTW-instellingen konden niet worden geladen."));
      setVatRegimes(Array.isArray(payload.regimes)?payload.regimes:[]);
      setVatSettingsStatus("");
    }catch(error){
      setVatSettingsStatus(error instanceof Error?error.message:"BTW-instellingen konden niet worden geladen.");
    }
  };

  const openSettings=async()=>{
    setSettingsOpen(true);
    await Promise.all([loadVatRegimes(),loadLabourRates()]);
  };

  const loadLabourRates=async()=>{
    setLabourRateStatus("Uurtarieven laden…");
    try{
      const response=await fetch("/api/settings/labour-rates",{headers:{Accept:"application/json"}});
      const payload=await response.json().catch(()=>({})) as {rates?:LabourRateRecord[];error?:string};
      if(!response.ok)throw new Error(String(payload.error??"Uurtarieven konden niet worden geladen."));
      setLabourRates(Array.isArray(payload.rates)?payload.rates:[]);
      setLabourRateStatus("");
    }catch(error){
      setLabourRateStatus(error instanceof Error?error.message:"Uurtarieven konden niet worden geladen.");
    }
  };

  const openLabourRates=async()=>{
    setLabourRatesOpen(true);
    await loadLabourRates();
  };

  const createLabourRateSetting=async()=>{
    setLabourRateStatus("Uurtarief opslaan…");
    try{
      const response=await fetch("/api/settings/labour-rates",{
        method:"POST",
        headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({
          ...labourRateDraft,
          sourceRef:labourRateDraft.sourceRef||null,
          validFrom:labourRateDraft.validFrom||null,
          validTo:labourRateDraft.validTo||null
        })
      });
      const payload=await response.json().catch(()=>({})) as LabourRateRecord&{error?:string};
      if(!response.ok)throw new Error(String(payload.error??"Uurtarief kon niet worden opgeslagen."));
      setLabourRateDraft({roleRef:"",label:"",hourlyCostRate:0,sourceRef:"",active:true,isDefault:false,validFrom:"",validTo:""});
      await loadLabourRates();
    }catch(error){
      setLabourRateStatus(error instanceof Error?error.message:"Uurtarief kon niet worden opgeslagen.");
    }
  };

  const patchLabourRate=async(id:number,patch:Partial<LabourRateRecord>)=>{
    setLabourRateStatus("Uurtarief bijwerken…");
    try{
      const response=await fetch(`/api/settings/labour-rates/${id}`,{
        method:"PUT",
        headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify(patch)
      });
      const payload=await response.json().catch(()=>({})) as LabourRateRecord&{error?:string};
      if(!response.ok)throw new Error(String(payload.error??"Uurtarief kon niet worden bijgewerkt."));
      await loadLabourRates();
    }catch(error){
      setLabourRateStatus(error instanceof Error?error.message:"Uurtarief kon niet worden bijgewerkt.");
    }
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
    const direct=directCost ?? lines.filter(line=>lineContributesToTotals(line)).reduce((sum,line)=>sum+lineDirect(line),0);
    const evalResponse=await fetch("/api/workbench/current/tail-costs/evaluate",{
      method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({directCost:direct})
    });
    if(evalResponse.ok){
      const evaluated=await evalResponse.json() as {calculationComponents:EvaluatedTailCost[];tailCost:number;mainDirectCost:number};
      setEvaluatedTailCosts(Array.isArray(evaluated.calculationComponents)?evaluated.calculationComponents:[]);
      setTailCostTotal(Number(evaluated.tailCost??0));
      setMainDirectCost(Number(evaluated.mainDirectCost??0));
      setFinancialIntegrityStatus("");
    }else{
      const errorPayload=await evalResponse.json().catch(()=>({})) as {error?:string};
      const message=String(errorPayload.error??"Staartkosten konden niet veilig worden berekend.");
      setEvaluatedTailCosts([]);
      setTailCostTotal(0);
      setMainDirectCost(0);
      setTailCostStatus(message);
      setFinancialIntegrityStatus(message);
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
    if(!response.ok){
      const payload=await response.json().catch(()=>({})) as {error?:string};
      const message=String(payload.error??"Deelcalculaties konden niet veilig worden berekend.");
      setSubcalculationResults([]);
      setManagementStatus(message);
      setFinancialIntegrityStatus(message);
      return;
    }
    const payload=await response.json() as {results:CalcSubcalculationResult[]};
    setSubcalculationResults(Array.isArray(payload.results)?payload.results:[]);
    setFinancialIntegrityStatus("");
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
      setRecipeDraft({recipeKey:"",name:"",description:"",nlSfbPath:"",stabuPath:""});
      await loadRecipeLibrary();
      setManagementStatus("Recept aangemaakt in Calc.");
    } catch(error) { setManagementStatus(error instanceof Error?error.message:"Recept kon niet worden aangemaakt."); }
  };

  const saveRecipeClassification=async()=>{
    if(!selectedRecipeVersionId){setManagementStatus("Kies eerst een recept.");return;}
    setManagementStatus("Receptclassificatie opslaan…");
    try{
      const response=await fetch(`/api/recipes/${selectedRecipeVersionId}/classification`,{
        method:"PUT",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify(recipeClassificationDraft)
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(payload.error??"Receptclassificatie kon niet worden opgeslagen."));
      await loadRecipeLibrary();
      setManagementStatus("Receptclassificatie opgeslagen.");
    }catch(error){setManagementStatus(error instanceof Error?error.message:"Receptclassificatie kon niet worden opgeslagen.");}
  };

  const changeClassificationScheme=async(scheme:ClassificationScheme)=>{
    setClassificationScheme(scheme);
    try{
      const response=await fetch("/api/workbench/current/classification-scheme",{
        method:"PUT",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({classificationScheme:scheme})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(payload.error??"Classificatiestelsel kon niet worden opgeslagen."));
      setStatus(`Classificatie: ${classificationLabel[scheme]}`);
    }catch(error){
      setStatus(error instanceof Error?error.message:"Classificatiestelsel kon niet worden opgeslagen.");
    }
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

  const scopeLabels:Record<ScopeFilterType,string>={
    building:"Gebouw",
    facade:"Gevel",
    dwelling:"Woning",
    dwelling_type:"Woningtype",
    building_part:"Bouwdeel",
    position:"Positie"
  };

  const createSubcalculationForScope=async(scopeType:ScopeFilterType,scopeRef:string)=>{
    const ref=scopeRef.trim();
    if(!ref)return;
    const label=scopeLabels[scopeType];
    const existing=subcalculations.find(item=>item.scopes.some(scope=>scope.scopeType===scopeType&&scope.scopeRef===ref));
    if(existing){
      setActiveSubcalculationId(existing.id);
      setManagementStatus(label+" "+ref+" is al gekoppeld aan deelcalculatie "+existing.description+".");
      return;
    }
    setManagementStatus("Deelcalculatie voor "+label.toLowerCase()+" "+ref+" aanmaken…");
    try{
      const prefix={
        building:"GEBOUW",
        facade:"GEVEL",
        dwelling:"WONING",
        dwelling_type:"WONINGTYPE",
        building_part:"BOUWDEEL",
        position:"POS"
      }[scopeType];
      const createResponse=await fetch("/api/workbench/current/subcalculations/scoped",{
        method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({ref:prefix+"-"+ref,description:label+" "+ref,scopeType,scopeRef:ref})
      });
      const created=await createResponse.json().catch(()=>({})) as {subcalculationId?:number;error?:string};
      if(!createResponse.ok||!created.subcalculationId)throw new Error(String(created.error??"Deelcalculatie kon niet worden aangemaakt."));
      await Promise.all([loadSubcalculations(),loadSubcalculationResults()]);
      setActiveSubcalculationId(created.subcalculationId);
      setManagementStatus("Deelcalculatie "+label+" "+ref+" aangemaakt. Regels met deze scope vallen er automatisch onder.");
    }catch(error){
      setManagementStatus(error instanceof Error?error.message:"Deelcalculatie voor scope kon niet worden aangemaakt.");
    }
  };

  const createAllSubcalculationsForScope=async()=>{
    const label=scopeLabels[activeScopeType];
    const existingRefs=new Set(
      subcalculations.flatMap(item=>item.scopes.filter(scope=>scope.scopeType===activeScopeType).map(scope=>scope.scopeRef))
    );
    const pending=availableScopeValues.filter(ref=>!existingRefs.has(ref));
    if(!pending.length){
      setManagementStatus("Alle gevonden "+label.toLowerCase()+"-waarden hebben al een deelcalculatie.");
      return;
    }
    const coverageWarning=activeScopeCoverage&&activeScopeCoverage.covered<activeScopeCoverage.total
      ? " · "+activeScopeCoverage.missingPositionRefs.length+" positie(s) zonder "+label.toLowerCase()+": "+activeScopeCoverage.missingPositionRefs.join(", ")
      : "";
    setManagementStatus(pending.length+" deelcalculatie(s) voor "+label.toLowerCase()+" aanmaken…"+coverageWarning);
    const prefix={
      building:"GEBOUW",
      facade:"GEVEL",
      dwelling:"WONING",
      dwelling_type:"WONINGTYPE",
      building_part:"BOUWDEEL",
      position:"POS"
    }[activeScopeType];
    const createdRefs:string[]=[];
    const failedRefs:string[]=[];
    for(const ref of pending){
      try{
        const createResponse=await fetch("/api/workbench/current/subcalculations/scoped",{
          method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
          body:JSON.stringify({ref:prefix+"-"+ref,description:label+" "+ref,scopeType:activeScopeType,scopeRef:ref})
        });
        const created=await createResponse.json().catch(()=>({})) as {subcalculationId?:number;error?:string};
        if(!createResponse.ok||!created.subcalculationId)throw new Error(String(created.error??"Deelcalculatie kon niet worden aangemaakt."));
        createdRefs.push(ref);
      }catch{
        failedRefs.push(ref);
      }
    }
    await Promise.all([loadSubcalculations(),loadSubcalculationResults()]);
    const parts=[createdRefs.length+" deelcalculatie(s) aangemaakt"];
    if(existingRefs.size)parts.push(existingRefs.size+" bestonden al");
    if(failedRefs.length)parts.push("mislukt: "+failedRefs.join(", "));
    if(activeScopeCoverage&&activeScopeCoverage.covered<activeScopeCoverage.total){
      parts.push(activeScopeCoverage.missingPositionRefs.length+" positie(s) zonder "+label.toLowerCase()+" blijven buiten deze doorsnede: "+activeScopeCoverage.missingPositionRefs.join(", "));
    }
    setManagementStatus(parts.join(" · "));
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
          if (current==="__auto__"&&nextAggregate.structureProposal.ready) return current;
          if (current && nextAggregate.structure.some(node => node.node_key === current)) return current;
          if(nextAggregate.structureProposal.ready) return "__auto__";
          const paragraph = nextAggregate.structure.find(node => node.node_type === "paragraph");
          return paragraph?.node_key ?? "";
        });
      }
      else setAggregate(null);
    } catch {
      setAggregate(null);
    }
    const [historyResponse,readinessResponse,freshnessResponse,diffResponse]=await Promise.all([
      fetch("/api/workbench/current/versions",{headers:{Accept:"application/json"}}),
      fetch("/api/workbench/current/publication-readiness",{headers:{Accept:"application/json"}}),
      fetch("/api/workbench/current/publication-freshness",{headers:{Accept:"application/json"}}),
      fetch("/api/workbench/current/version-diff",{headers:{Accept:"application/json"}})
    ]);
    if(historyResponse.ok){
      const historyPayload=await historyResponse.json() as {versions?:CalcVersionHistoryItem[]};
      setVersionHistory(Array.isArray(historyPayload.versions)?historyPayload.versions:[]);
    }else setVersionHistory([]);
    if(readinessResponse.ok){
      const readinessPayload=await readinessResponse.json() as PublicationReadiness;
      setPublicationReadiness(readinessPayload);
    }else setPublicationReadiness(null);
    if(freshnessResponse.ok){
      const freshnessPayload=await freshnessResponse.json() as PublicationFreshness;
      setPublicationFreshness(freshnessPayload);
    }else setPublicationFreshness(null);
    if(diffResponse.ok){
      const diffPayload=await diffResponse.json() as VersionDiff;
      setVersionDiff(diffPayload);
    }else setVersionDiff(null);

    setLines(Array.isArray(data.lines) ? data.lines.map((line: Record<string, unknown>) => mapServerLine(line)) : []);
    setSelectedLineIds([]);
    setAllocations(Array.isArray(data.allocations) ? data.allocations.map((row: Record<string,unknown>) => ({
      sourceLineId:Number(row.source_line_id), targetLineId:Number(row.target_line_id), method:String(row.allocation_method) as LineAllocation["method"], share:Number(row.share ?? 0), amount:Number(row.amount ?? 0)
    })) : []);
    setProject(data.project as ProjectContext);
    setCalculationTitle(String(data.calculation?.title ?? "BREBO Calculatie"));
    const loadedClassification=String(data.calculation?.classification_scheme??"nl_sfb");
    setClassificationScheme(loadedClassification==="stabu"?"stabu":loadedClassification==="custom"?"custom":"nl_sfb");
    const loadedVersionStatus=String(data.version?.status??"draft")==="established"?"established":"draft";
    setVersionStatus(loadedVersionStatus);
    setVersionNo(Number(data.version?.version_no??1));
    setAuthorized(true);
    setStatus(loadedVersionStatus==="established"?"Vastgesteld · gepubliceerd naar Office":"Opgeslagen");
  };

  const setDocumentDecision=async(documentId:number,decision:"primary"|"supporting"|"review"|"excluded")=>{
    setDocumentTriageStatus("Documentkeuze opslaan…");
    try{
      const response=await fetch(`/api/workbench/current/document-triage/${documentId}`,{
        method:"PUT",
        headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({decision})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(payload.error??"Documentkeuze kon niet worden opgeslagen."));
      await loadWorkbench();
      setDocumentTriageStatus("Documentkeuze opgeslagen.");
    }catch(error){
      setDocumentTriageStatus(error instanceof Error?error.message:"Documentkeuze kon niet worden opgeslagen.");
    }
  };

  const refreshDocumentCandidates=async()=>{
    setDocumentTriageStatus("Kandidaatbronnen verversen…");
    try{
      const response=await fetch("/api/workbench/current/document-candidates/refresh",{
        method:"POST",
        headers:{Accept:"application/json"}
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(payload.error??"Kandidaatbronnen konden niet worden ververst."));
      await loadWorkbench();
      setDocumentTriageStatus("Kandidaatbronnen ververst; Calc-triage opnieuw uitgevoerd.");
    }catch(error){
      setDocumentTriageStatus(error instanceof Error?error.message:"Kandidaatbronnen konden niet worden ververst.");
    }
  };

  const resetDocumentDecision=async(documentId:number)=>{
    setDocumentTriageStatus("Automatische documentkeuze herstellen…");
    try{
      const response=await fetch(`/api/workbench/current/document-triage/${documentId}`,{method:"DELETE",headers:{Accept:"application/json"}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(payload.error??"Documentkeuze kon niet worden hersteld."));
      await loadWorkbench();
      setDocumentTriageStatus("Automatische documentkeuze hersteld.");
    }catch(error){
      setDocumentTriageStatus(error instanceof Error?error.message:"Documentkeuze kon niet worden hersteld.");
    }
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

  async function persistWorkbenchDraft(linesToSave:Line[]){
    setStatus("Opslaan…");
    const response = await fetch("/api/workbench/current", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allocations,
        lines: linesToSave.map((line, index) => ({
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
          sourceOfferSummary: line.sourceOfferSummary,
          manualScopes: line.manualScopes ?? []
        }))
      })
    });
    const payload = await response.json().catch(() => ({})) as {directCost?:number;publication?:{status?:"draft_only"};error?:string};
    if (!response.ok) throw new Error(String(payload.error??"Opslaan mislukt"));
    setStatus("Concept opgeslagen in Calc");
    await loadWorkbench();
    await Promise.all([loadTailCosts(payload.directCost),loadSubcalculationResults()]);
    return payload;
  }

  const applyStructureProposal=()=>{
    if(!aggregate?.structureProposal.ready){
      setStructureProposalStatus("Er is nog geen bruikbaar structuurvoorstel.");
      return;
    }
    let id=nextId;
    const created:Line[]=[];
    const chapterLabel=aggregate.structureProposal.chapter.label;
    const existingChapter=lines.find(line=>line.lineType==="chapter"&&line.description.trim().toLocaleLowerCase("nl-NL")===chapterLabel.trim().toLocaleLowerCase("nl-NL"))??null;
    let chapterId=existingChapter?.id??null;
    if(chapterId==null){
      chapterId=id--;
      created.push({
        id:chapterId,parentId:null,structureKey:"auto-concept",lineType:"chapter",code:"",description:chapterLabel,
        unit:"",quantity:0,labourNorm:null,labourTotalHours:null,labourHoursInputMode:null,
        labour:0,material:0,equipment:0,subcontracting:0,other:0,
        priceSourceType:"manual",officeSourceId:null,sourceReference:null,sourceSupplier:null,
        sourceUnitPrice:null,sourcePriceDate:null,sourceDocumentId:null,sourceDetails:null,sourceVisualPage:null,
        sourcePositionBounds:null,sourceVisualCrop:null,sourceVisualSearchRegion:null,sourceTextRegions:null,sourceOfferSummary:null
      });
    }
    for(const group of aggregate.structureProposal.groups){
      const key=("auto-"+group.key).slice(0,36);
      const exists=lines.some(line=>line.lineType==="paragraph"&&line.parentId===chapterId&&(
        line.structureKey===key||
        line.description.trim().toLocaleLowerCase("nl-NL")===group.label.trim().toLocaleLowerCase("nl-NL")
      ))||created.some(line=>line.lineType==="paragraph"&&line.parentId===chapterId&&line.description===group.label);
      if(exists)continue;
      created.push({
        id:id--,parentId:chapterId,structureKey:key,lineType:"paragraph",code:"",description:group.label,
        unit:"",quantity:0,labourNorm:null,labourTotalHours:null,labourHoursInputMode:null,
        labour:0,material:0,equipment:0,subcontracting:0,other:0,
        priceSourceType:"manual",officeSourceId:null,sourceReference:null,sourceSupplier:null,
        sourceUnitPrice:null,sourcePriceDate:null,sourceDocumentId:null,sourceDetails:null,sourceVisualPage:null,
        sourcePositionBounds:null,sourceVisualCrop:null,sourceVisualSearchRegion:null,sourceTextRegions:null,sourceOfferSummary:null
      });
    }
    if(!created.length){
      setStructureProposalStatus("De voorgestelde structuur staat al in de calculatie.");
      return;
    }
    setNextId(id);
    setLines(current=>[...current,...created]);
    setStatus("Concept — niet opgeslagen");
    if(aggregate.structureProposal.groups.some(group=>group.recipeRef!==null))setRecipeParagraphKey("__auto__");
    setStructureProposalStatus(created.length+" structuurregel(s) toegevoegd aan het concept. Controleer en sla daarna de calculatie op.");
  };
  const generatedRecipeIdentityFromLine=(line:Line)=>{
    if(line.priceSourceType!=="recipe"||!line.sourceDetails)return null;
    try{
      const details=JSON.parse(line.sourceDetails);
      const positionRef=String(details?.position_ref??"").trim();
      const recipeVersionId=Number(details?.recipe?.version_id??0);
      const officeVersion=details?.context_binding?.officeVersion==null?null:String(details.context_binding.officeVersion);
      const selectionVersion=details?.context_binding?.selectionVersion==null?null:String(details.context_binding.selectionVersion);
      if(!positionRef||!Number.isInteger(recipeVersionId)||recipeVersionId<=0)return null;
      return{positionRef,recipeVersionId,officeVersion,selectionVersion};
    }catch{return null;}
  };

  const generateUnambiguousRecipes=async()=>{
    if(!aggregate){setRecipeActionStatus("Calc-concept is nog niet geladen.");return;}
    const allowed=new Set(aggregate.autoBuildEligibility.eligiblePositionRefs);
    const eligible=aggregate.structureProposal.groups
      .filter(group=>group.recipeRef!==null)
      .flatMap(group=>group.positionRefs.filter(positionRef=>allowed.has(positionRef)).map(positionRef=>({
        group,
        proposal:aggregate.recipeProposals.find(item=>item.positionRef===positionRef&&item.recipeRef===group.recipeRef)
      })))
      .filter((item):item is {group:WorkbenchAggregate["structureProposal"]["groups"][number];proposal:WorkbenchAggregate["recipeProposals"][number]}=>Boolean(item.proposal));
    if(!eligible.length){
      const blocked=aggregate.autoBuildEligibility.blocked.map(item=>item.positionRef+": "+item.reasons.join(", ")).join(" · ");
      setRecipeActionStatus(blocked?("Geen veilige posities om automatisch op te bouwen · "+blocked):"Geen eenduidige receptvoorstellen om op te bouwen.");
      return;
    }

    setRecipeActionStatus("Calc-concept opbouwen…");
    let id=nextId;
    const createdStructure:Line[]=[];
    const createdRecipeLines:Line[]=[];
    const skipped:string[]=aggregate.autoBuildEligibility.blocked.map(item=>item.positionRef+" geblokkeerd ("+item.reasons.join(", ")+")");
    let incomplete=0;

    const chapterLabel=aggregate.structureProposal.chapter.label;
    let chapterLine=lines.find(line=>line.lineType==="chapter"&&line.description.trim().toLocaleLowerCase("nl-NL")===chapterLabel.trim().toLocaleLowerCase("nl-NL"));
    if(!chapterLine){
      chapterLine={
        id:id--,parentId:null,structureKey:"auto-concept",lineType:"chapter",code:"",description:chapterLabel,
        unit:"",quantity:0,labourNorm:null,labourTotalHours:null,labourHoursInputMode:null,
        labour:0,material:0,equipment:0,subcontracting:0,other:0,
        priceSourceType:"manual",officeSourceId:null,sourceReference:null,sourceSupplier:null,
        sourceUnitPrice:null,sourcePriceDate:null,sourceDocumentId:null,sourceDetails:null,sourceVisualPage:null,
        sourcePositionBounds:null,sourceVisualCrop:null,sourceVisualSearchRegion:null,sourceTextRegions:null,sourceOfferSummary:null
      };
      createdStructure.push(chapterLine);
    }

    const paragraphByGroupKey=new Map<string,Line>();
    for(const group of aggregate.structureProposal.groups){
      const key=("auto-"+group.key).slice(0,36);
      let paragraphLine=lines.find(line=>line.lineType==="paragraph"&&(
        line.structureKey===key||
        (line.parentId===chapterLine.id&&line.description.trim().toLocaleLowerCase("nl-NL")===group.label.trim().toLocaleLowerCase("nl-NL"))
      ));
      if(!paragraphLine){
        paragraphLine={
          id:id--,parentId:chapterLine.id,structureKey:key,lineType:"paragraph",code:"",description:group.label,
          unit:"",quantity:0,labourNorm:null,labourTotalHours:null,labourHoursInputMode:null,
          labour:0,material:0,equipment:0,subcontracting:0,other:0,
          priceSourceType:"manual",officeSourceId:null,sourceReference:null,sourceSupplier:null,
          sourceUnitPrice:null,sourcePriceDate:null,sourceDocumentId:null,sourceDetails:null,sourceVisualPage:null,
          sourcePositionBounds:null,sourceVisualCrop:null,sourceVisualSearchRegion:null,sourceTextRegions:null,sourceOfferSummary:null
        };
        createdStructure.push(paragraphLine);
      }
      paragraphByGroupKey.set(group.key,paragraphLine);
    }

    for(const {group,proposal} of eligible){
      const existingIdentities=[...lines,...createdRecipeLines]
        .map(line=>({line,identity:generatedRecipeIdentityFromLine(line)}))
        .filter(item=>item.identity?.positionRef===proposal.positionRef);
      const currentExisting=existingIdentities.some(item=>
        item.identity?.recipeVersionId===Number(proposal.recipeRef)&&
        item.identity?.officeVersion===aggregate.officeVersion&&
        (item.identity?.selectionVersion??null)===(aggregate.concept.sourceSelectionVersion??null)
      );
      if(currentExisting){skipped.push(proposal.positionRef+" bestaat al en is actueel");continue;}
      if(existingIdentities.length){
        skipped.push(proposal.positionRef+" heeft bestaande receptregels uit andere recept-/broncontext; eerst review/verversen");
        continue;
      }
      const takeoffs=aggregate.takeoffs.filter(row=>row.position_ref.trim()===proposal.positionRef);
      if(takeoffs.length>1&&!selectedTakeoffByPosition[proposal.positionRef]){
        skipped.push(proposal.positionRef+" heeft meerdere geometrieën");
        continue;
      }
      const paragraphLine=paragraphByGroupKey.get(group.key);
      if(!paragraphLine){skipped.push(proposal.positionRef+" mist voorgestelde paragraaf");continue;}

      try{
        const response=await fetch("/api/workbench/current/concept/recipe-proposals/accept",{
          method:"POST",
          headers:{"Content-Type":"application/json",Accept:"application/json"},
          body:JSON.stringify({
            positionRef:proposal.positionRef,
            recipeVersionId:Number(proposal.recipeRef),
            takeoffId:selectedTakeoffByPosition[proposal.positionRef]??undefined,
            passes:1,
            parameters:{}
          })
        });
        const payload=await response.json().catch(()=>({})) as {
          error?:string;recipeName?:string;
          lines?:Array<{
            code:string;description:string;unit:string;quantity:number;
            labourNorm:number|null;labourTotalHours:number|null;labourHoursInputMode:"norm"|"total_hours"|null;
            labour:number;material:number;equipment:number;subcontracting:number;other:number;
            priceSourceType:"recipe";officeSourceId:string|null;sourceReference:string;sourceUnitPrice:number|null;sourceDetails:string;
            resolutionStatus:"resolved"|"unresolved";resolutionReason:string|null;
          }>;
        };
        if(!response.ok||!Array.isArray(payload.lines)||payload.lines.length===0){
          skipped.push(proposal.positionRef+" kon niet worden gegenereerd");
          continue;
        }
        for(const generated of payload.lines){
          if(generated.resolutionStatus==="unresolved")incomplete++;
          createdRecipeLines.push({
            id:id--,parentId:paragraphLine.id,lineType:"item",code:generated.code,description:generated.description,
            unit:generated.unit,quantity:generated.quantity,labourNorm:generated.labourNorm,labourTotalHours:generated.labourTotalHours,
            labourHoursInputMode:generated.labourHoursInputMode,labour:generated.labour,material:generated.material,equipment:generated.equipment,
            subcontracting:generated.subcontracting,other:generated.other,priceSourceType:"recipe",officeSourceId:generated.officeSourceId,
            sourceReference:generated.sourceReference,sourceSupplier:null,sourceUnitPrice:generated.sourceUnitPrice,sourcePriceDate:null,
            sourceDocumentId:null,sourceDetails:generated.sourceDetails,sourceVisualPage:null,sourcePositionBounds:null,sourceVisualCrop:null,
            sourceVisualSearchRegion:null,sourceTextRegions:null,sourceOfferSummary:(payload.recipeName??proposal.label)+" · "+proposal.positionRef,
            resolutionStatus:generated.resolutionStatus,resolutionReason:generated.resolutionReason
          });
        }
      }catch{
        skipped.push(proposal.positionRef+" gaf een bronfout");
      }
    }

    const created=[...createdStructure,...createdRecipeLines];
    if(created.length){
      setNextId(id);
      setLines(current=>[...current,...created]);
      setStatus("Concept — niet opgeslagen");
      setRecipeParagraphKey("__auto__");
    }
    if(createdStructure.length){
      setStructureProposalStatus(createdStructure.length+" structuurregel(s) automatisch opgebouwd door Calc.");
    }
    const parts=[
      createdStructure.length+" structuurregel(s)",
      createdRecipeLines.length+" Calc-regel(s) gegenereerd"
    ];
    if(incomplete)parts.push(incomplete+" regel(s) met ontbrekende bron");
    if(skipped.length)parts.push("overgeslagen: "+skipped.join(", "));

    const autoSaveSafe=
      created.length>0 &&
      incomplete===0 &&
      skipped.length===0 &&
      aggregate.automationReadiness.canAutoSaveConcept;

    if(autoSaveSafe){
      try{
        await persistWorkbenchDraft([...lines,...created]);
        parts.push("concept automatisch opgeslagen");
      }catch(error){
        const message=error instanceof Error?error.message:"automatisch opslaan mislukt";
        parts.push("automatisch opslaan geblokkeerd: "+message);
        if(message.includes("Staartkosten kunnen niet veilig worden berekend"))setFinancialIntegrityStatus(message);
      }
    }else if(created.length){
      const reason=aggregate.automationReadiness.reasons[0];
      parts.push(reason?("menselijke controle nodig: "+reason):"menselijke controle nodig vóór opslaan");
    }
    setRecipeActionStatus(parts.join(" · ")+".");
  };
  const summarizeRecipeLines=(rows:Line[])=>rows.reduce((sum,line)=>({
    lines:sum.lines+1,
    quantity:sum.quantity+Number(line.quantity||0),
    labour:sum.labour+Number(line.labour||0),
    material:sum.material+Number(line.material||0),
    equipment:sum.equipment+Number(line.equipment||0),
    subcontracting:sum.subcontracting+Number(line.subcontracting||0),
    other:sum.other+Number(line.other||0)
  }),{lines:0,quantity:0,labour:0,material:0,equipment:0,subcontracting:0,other:0});

  type RecipeRefreshLineChange={
    key:string;
    kind:"added"|"removed"|"changed";
    description:string;
    oldQuantity:number|null;
    nextQuantity:number|null;
    oldDirect:number|null;
    nextDirect:number|null;
    impact:"higher"|"lower"|"neutral";
  };
  const recipeRefreshImpact=(oldDirect:number|null,nextDirect:number|null):RecipeRefreshLineChange["impact"]=>{
    const delta=(nextDirect??0)-(oldDirect??0);
    if(delta>0.005)return "higher";
    if(delta<-0.005)return "lower";
    return "neutral";
  };
  const recipeLineDiff=(oldRows:Line[],nextRows:Line[]):RecipeRefreshLineChange[]=>{
    const keyOf=(line:Line)=>String(line.sourceReference??line.code??line.description).trim();
    const oldByKey=new Map(oldRows.map(line=>[keyOf(line),line]));
    const nextByKey=new Map(nextRows.map(line=>[keyOf(line),line]));
    const keys=[...new Set([...oldByKey.keys(),...nextByKey.keys()])].sort((a,b)=>a.localeCompare(b,"nl"));
    const changes:RecipeRefreshLineChange[]=[];
    for(const key of keys){
      const oldLine=oldByKey.get(key)??null;
      const nextLine=nextByKey.get(key)??null;
      if(!oldLine&&nextLine){
        const nextDirect=lineDirect(nextLine); changes.push({key,kind:"added",description:nextLine.description,oldQuantity:null,nextQuantity:nextLine.quantity,oldDirect:null,nextDirect,impact:recipeRefreshImpact(null,nextDirect)});
        continue;
      }
      if(oldLine&&!nextLine){
        const oldDirect=lineDirect(oldLine); changes.push({key,kind:"removed",description:oldLine.description,oldQuantity:oldLine.quantity,nextQuantity:null,oldDirect,nextDirect:null,impact:recipeRefreshImpact(oldDirect,null)});
        continue;
      }
      if(!oldLine||!nextLine)continue;
      const oldDirect=lineDirect(oldLine),nextDirect=lineDirect(nextLine);
      const changed=
        Math.abs(Number(oldLine.quantity)-Number(nextLine.quantity))>0.000001||
        Math.abs(oldDirect-nextDirect)>0.005||
        oldLine.description!==nextLine.description;
      if(changed)changes.push({key,kind:"changed",description:nextLine.description,oldQuantity:oldLine.quantity,nextQuantity:nextLine.quantity,oldDirect,nextDirect,impact:recipeRefreshImpact(oldDirect,nextDirect)});
    }
    return changes.sort((a,b)=>{
      const impactA=Math.abs((a.nextDirect??0)-(a.oldDirect??0));
      const impactB=Math.abs((b.nextDirect??0)-(b.oldDirect??0));
      return impactB-impactA||a.description.localeCompare(b.description,"nl");
    });
  };

  const acceptRecipeProposal = async (
    proposal: WorkbenchAggregate["recipeProposals"][number],
    paragraphKeyOverride?:string,
    paragraphLineOverride?:Line,
    startingIdOverride?:number,
    replaceExistingPosition=false
  ) => {
    const targetParagraphKey=paragraphKeyOverride??recipeParagraphKey;
    if (!targetParagraphKey || !aggregate) {
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

      let paragraphLine:Line|undefined=paragraphLineOverride;
      if(!paragraphLine&&targetParagraphKey==="__auto__"){
        const group=aggregate.structureProposal.groups.find(item=>
          item.recipeRef===proposal.recipeRef&&item.positionRefs.includes(proposal.positionRef)
        );
        if(!group)throw new Error("Voor deze positie is de receptplaatsing niet eenduidig. Kies handmatig een Calc-paragraaf.");
        const key=("auto-"+group.key).slice(0,36);
        paragraphLine=lines.find(line=>line.lineType==="paragraph"&&(
          line.structureKey===key||
          line.description.trim().toLocaleLowerCase("nl-NL")===group.label.trim().toLocaleLowerCase("nl-NL")
        ));
        if(!paragraphLine)throw new Error("Pas eerst het Calc-structuurvoorstel toe.");
      }else if(!paragraphLine){
        paragraphLine=targetParagraphKey.startsWith("local:")
          ? lines.find(line=>line.lineType==="paragraph"&&line.id===Number(targetParagraphKey.slice(6)))
          : lines.find(line=>line.lineType==="paragraph"&&line.structureKey===targetParagraphKey);
      }
      if (!paragraphLine) throw new Error("De gekozen Calc-paragraaf is niet meer beschikbaar.");

      let id = startingIdOverride??nextId;
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

      if(replaceExistingPosition){
        const oldRows=lines.filter(line=>generatedRecipeIdentityFromLine(line)?.positionRef===proposal.positionRef);
        setRecipeRefreshDelta({
          positionRef:proposal.positionRef,
          recipeLabel:payload.recipeName??proposal.label,
          old:summarizeRecipeLines(oldRows),
          next:summarizeRecipeLines(created),
          lineChanges:recipeLineDiff(oldRows,created)
        });
      }
      setNextId(id);
      setLines(current => {
        const base=replaceExistingPosition
          ? current.filter(line=>generatedRecipeIdentityFromLine(line)?.positionRef!==proposal.positionRef)
          : current;
        return [...base,...created];
      });
      setStatus("Concept — niet opgeslagen");
      setAggregate(current=>{
        if(!current)return current;
        const recipeVersionId=Number(proposal.recipeRef);
        const filtered=current.recipeProposalDecisions.filter(item=>!(
          item.positionRef===proposal.positionRef&&
          item.recipeVersionId===recipeVersionId&&
          item.current
        ));
        return{
          ...current,
          recipeProposalDecisions:[
            ...filtered,
            {
              positionRef:proposal.positionRef,
              recipeVersionId,
              decision:"accepted",
              reason:"Receptvoorstel geaccepteerd en gegenereerd.",
              sourceSelectionVersion:current.concept.sourceSelectionVersion,
              decidedBy:0,
              current:true
            }
          ]
        };
      });
      const unresolvedCount=payload.lines.filter(line=>line.resolutionStatus==="unresolved").length;
      setRecipeActionStatus(unresolvedCount
        ? `${payload.recipeName ?? proposal.label}: ${unresolvedCount} bron(nen) ontbreken. Regels zijn zichtbaar, maar de calculatie kan zo niet worden opgeslagen.`
        : replaceExistingPosition
          ? `${payload.recipeName ?? proposal.label}: bestaande receptregels voor ${proposal.positionRef} vervangen door ${payload.lines.length} actuele Calc-regel(s). Nog opslaan.`
          : `${payload.recipeName ?? proposal.label}: ${payload.lines.length} Calc-regel(s) gegenereerd. Nog opslaan.`);
    } catch (error) {
      setRecipeActionStatus(error instanceof Error ? error.message : "Recept kon niet worden gegenereerd.");
    }
  };

  const normalizedStructureCode=(value:string)=>value.trim().toLocaleLowerCase("nl-NL").replace(/\s+/g,"");
  const emptyStructureLine=(input:{id:number;parentId:number|null;lineType:"chapter"|"paragraph";code:string;description:string}):Line=>({
    id:input.id,parentId:input.parentId,lineType:input.lineType,code:input.code,description:input.description,
    unit:"",quantity:0,labourNorm:null,labourTotalHours:null,labourHoursInputMode:null,
    labour:0,material:0,equipment:0,subcontracting:0,other:0,
    priceSourceType:"manual",officeSourceId:null,sourceReference:null,sourceSupplier:null,
    sourceUnitPrice:null,sourcePriceDate:null,sourceDocumentId:null,sourceDetails:null,
    sourceVisualPage:null,sourcePositionBounds:null,sourceVisualCrop:null,sourceVisualSearchRegion:null,
    sourceTextRegions:null,sourceOfferSummary:null,manualScopes:[]
  });

  const addClassificationPathToCalculation=(treePath:string)=>{
    if(versionStatus==="established"||classificationScheme==="custom")return;
    const path=treePath.split(" / ").map(part=>part.trim()).filter(Boolean);
    if(!path.length)return;
    const working=[...lines];
    const created:Line[]=[];
    let id=nextId;
    let parent:Line|null=null;
    for(let index=0;index<path.length;index++){
      const raw=path[index];
      const code=canonicalClassificationCode(raw);
      const folder=classificationFolderAt(classificationScheme,path,index);
      const lineType:"chapter"|"paragraph"=index===0?"chapter":"paragraph";
      const parentId:number|null=index===0?null:(parent as Line|null)?.id??null;
      const existing:Line|undefined=working.find((line:Line)=>line.lineType===lineType&&line.parentId===parentId&&canonicalClassificationCode(line.code)===code);
      if(existing){parent=existing;continue;}
      const createdLine=emptyStructureLine({id:id--,parentId,lineType,code,description:folder?.label??(classificationPartLabel(raw)||`${classificationLabel[classificationScheme]} ${code}`)});
      working.push(createdLine);created.push(createdLine);parent=createdLine;
    }
    if(!created.length){setStatus("Deze classificatiestructuur staat al in de calculatie.");return;}
    setLines(current=>[...current,...created]);
    setNextId(id);
    setStatus(`${created.length} structuurregel(s) uit ${classificationLabel[classificationScheme]} toegevoegd — nog opslaan`);
  };

  const ensureRecipeClassificationTarget=(recipe:CalcRecipe):{
    paragraph:Line|null;
    created:Line[];
    nextAvailableId:number;
    message:string|null;
  }=>{
    if(classificationScheme==="custom")return{paragraph:null,created:[],nextAvailableId:nextId,message:null};
    const path=recipeClassificationPath(recipe,classificationScheme);
    if(path.length<2){
      return{
        paragraph:null,created:[],nextAvailableId:nextId,
        message:`${recipe.name} heeft nog geen volledige ${classificationLabel[classificationScheme]}-indeling. Vul minimaal hoofdgroep en paragraafcode in bij Recepten beheren.`
      };
    }

    const working=[...lines];
    const created:Line[]=[];
    let id=nextId;
    let parent:Line|null=null;

    for(let index=0;index<path.length;index++){
      const rawPathPart=path[index].trim();
      const code=canonicalClassificationCode(rawPathPart);
      const folder=classificationFolderAt(classificationScheme,path,index);
      const lineType=index===0?"chapter":"paragraph";
      let parentId:number|null=null;
      if(index>0&&parent!==null)parentId=(parent as Line).id;
      const existing:Line|undefined=working.find((line:Line)=>
        line.lineType===lineType&&
        line.parentId===parentId&&
        canonicalClassificationCode(line.code)===code
      );
      if(existing){
        parent=existing;
        continue;
      }
      const createdLine=emptyStructureLine({
        id:id--,
        parentId,
        lineType,
        code,
        description:folder?.label??(classificationPartLabel(rawPathPart)||`${classificationLabel[classificationScheme]} ${code}`)
      });
      working.push(createdLine);
      created.push(createdLine);
      parent=createdLine;
    }

    return{
      paragraph:parent?.lineType==="paragraph"?parent:null,
      created,
      nextAvailableId:id,
      message:null
    };
  };

  const recipeDragMime="application/x-brebo-calc-recipe";
  const paragraphForDrop=(line:Line):Line|null=>{
    if(line.lineType==="paragraph")return line;
    const byId=new Map(lines.map(item=>[item.id,item]));
    let parentId=line.parentId;
    const seen=new Set<number>();
    while(parentId!=null&&!seen.has(parentId)){
      seen.add(parentId);
      const parent=byId.get(parentId)??null;
      if(!parent)return null;
      if(parent.lineType==="paragraph")return parent;
      parentId=parent.parentId;
    }
    return null;
  };
  const paragraphKey=(line:Line)=>line.structureKey??("local:"+line.id);

  const dropRecipeOnLine=async(event:React.DragEvent<HTMLDivElement>,targetLine:Line)=>{
    event.preventDefault();
    setRecipeDropTargetId(null);
    if(versionStatus==="established"){
      setRecipeActionStatus("Start eerst een nieuwe conceptversie om een recept toe te passen.");
      return;
    }
    const recipeId=Number(event.dataTransfer.getData(recipeDragMime));
    const recipe=recipes.find(item=>item.id===recipeId);
    if(!recipe)return;
    const classifiedTarget=ensureRecipeClassificationTarget(recipe);
    if(classifiedTarget.message){
      setSelectedRecipeVersionId(recipe.id);
      setRecipeLibraryOpen(true);
      setRecipeActionStatus(classifiedTarget.message);
      setManagementStatus(classifiedTarget.message);
      return;
    }

    let paragraph=classifiedTarget.paragraph??paragraphForDrop(targetLine);
    if(!paragraph){
      setRecipeActionStatus("Sleep het recept op een paragraaf of vul eerst de classificatie van het recept aan.");
      return;
    }

    if(classifiedTarget.created.length){
      setLines(current=>[...current,...classifiedTarget.created]);
      setNextId(classifiedTarget.nextAvailableId);
      setStatus("Concept — classificatiestructuur toegevoegd, nog niet opgeslagen");
    }

    const targetKey=paragraphKey(paragraph);
    setSelectedRecipeVersionId(recipe.id);
    setRecipeParagraphKey(targetKey);

    const proposals=(aggregate?.recipeProposals??[]).filter(proposal=>Number(proposal.recipeRef)===recipe.id);
    const tracedPosition=lineTrace(targetLine).position;
    const preferredPosition=activeScopeType==="position"&&activeScopeRef?activeScopeRef:tracedPosition;
    const candidates=preferredPosition
      ? proposals.filter(proposal=>proposal.positionRef===preferredPosition)
      : proposals;

    if(candidates.length===1){
      const proposal=candidates[0];
      const takeoffs=aggregate?.takeoffs.filter(row=>row.position_ref.trim()===proposal.positionRef)??[];
      if(takeoffs.length<=1||selectedTakeoffByPosition[proposal.positionRef]){
        const placement=classificationScheme==="custom"
          ? paragraph.description
          : `${classificationLabel[classificationScheme]} ${paragraph.code}`;
        setRecipeActionStatus(`${recipe.name} wordt in ${placement} geplaatst…`);
        await acceptRecipeProposal(
          proposal,
          targetKey,
          classifiedTarget.paragraph??undefined,
          classifiedTarget.created.length?classifiedTarget.nextAvailableId:undefined
        );
        return;
      }
    }

    setRecipeWorkspaceOpen(true);
    const placementLabel=classificationScheme==="custom"?paragraph.description:`${classificationLabel[classificationScheme]} ${paragraph.code}`;
    setRecipeActionStatus(candidates.length===0
      ? `${recipe.name} is gekoppeld aan ${placementLabel}. Kies in Recept toepassen de bronpositie waarmee dit recept moet worden doorgerekend.`
      : `${recipe.name} is gekoppeld aan ${placementLabel}. Er zijn meerdere mogelijke bronposities; kies de juiste en bevestig.`);
  };

  const resetRecipeIssue=async(issue:WorkbenchAggregate["recipeSelectionIssues"][number])=>{
    if(!aggregate?.editable)return;
    try{
      if(issue.code==="no_match"){
        setActiveScopeType("position");
        setActiveScopeRef(issue.positionRef);
        setRecipeLibraryOpen(true);
        setRecipeActionStatus(`${issue.positionRef}: kies of maak een passend recept.`);
        return;
      }
      if(issue.code==="all_rejected"){
        for(const recipeRef of issue.candidateRecipeRefs){
          const response=await fetch(`/api/workbench/current/concept/recipe-proposals/${encodeURIComponent(issue.positionRef)}/${encodeURIComponent(recipeRef)}/decision`,{
            method:"PUT",headers:{"Content-Type":"application/json",Accept:"application/json"},
            body:JSON.stringify({decision:"reset",reason:"Eerdere afwijzing heropend vanuit Nog te bepalen."})
          });
          const payload=await response.json().catch(()=>({}));
          if(!response.ok)throw new Error(String(payload?.error??"Afwijzing kon niet worden heropend."));
        }
        setRecipeActionStatus(`${issue.positionRef}: afgewezen voorstellen opnieuw geopend.`);
        await loadWorkbench();
        return;
      }
      setActiveScopeType("position");
      setActiveScopeRef(issue.positionRef);
      const first=issue.candidateRecipeRefs[0];
      if(first){
        requestAnimationFrame(()=>document.getElementById(`recipe-proposal-${issue.positionRef}-${first}`)?.scrollIntoView({behavior:"smooth",block:"center"}));
      }
      setRecipeActionStatus(issue.code==="multiple_accepted"
        ? `${issue.positionRef}: kies één geaccepteerd recept en wijs de overige af.`
        : `${issue.positionRef}: kies één van de actuele receptvoorstellen.`);
    }catch(error){
      setRecipeActionStatus(error instanceof Error?error.message:"Herstelactie kon niet worden uitgevoerd.");
    }
  };

  const reviewRecipeProposal=async(proposal:WorkbenchAggregate["recipeProposals"][number],decision:"accepted"|"rejected")=>{
    if(!aggregate?.editable)return;
    const key=proposal.positionRef+"::"+proposal.recipeRef;
    setRecipeReviewBusyKey(key);
    try{
      if(decision==="accepted"){
        await acceptRecipeProposal(proposal);
        return;
      }
      const response=await fetch(`/api/workbench/current/concept/recipe-proposals/${encodeURIComponent(proposal.positionRef)}/${encodeURIComponent(proposal.recipeRef)}/decision`,{
        method:"PUT",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({decision:"rejected",reason:"Receptvoorstel afgewezen in Calc-review."})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(payload?.error??"Reviewbeslissing kon niet worden opgeslagen."));
      setRecipeActionStatus(`${proposal.label} voor ${proposal.positionRef} afgewezen.`);
      await loadWorkbench();
    }catch(error){
      setRecipeActionStatus(error instanceof Error?error.message:"Reviewbeslissing kon niet worden opgeslagen.");
    }finally{
      setRecipeReviewBusyKey("");
    }
  };

  const patchLine = (id: number, patch: Partial<Line>) => {
    if(versionStatus==="established")return;
    setLines(current => current.map(line => line.id === id ? { ...line, ...patch } : line));
    setStatus("Concept — niet opgeslagen");
  };

  const incomingAllocation = (lineId:number) => allocations.filter(item => item.targetLineId === lineId).reduce((sum,item)=>sum+item.amount,0);
  const outgoingAllocation = (lineId:number) => allocations.filter(item => item.sourceLineId === lineId).reduce((sum,item)=>sum+item.amount,0);
  const effectiveLineDirect = (line:Line) => lineDirect(line) - outgoingAllocation(line.id) + incomingAllocation(line.id);
  const allocateLine = (sourceLineId:number, method:"quantity"|"value") => {
    const source=lines.find(line=>line.id===sourceLineId); if(!source||!lineContributesToTotals(source))return;
    const targets=lines.filter(line=>selectedLineIds.includes(line.id)&&line.id!==sourceLineId&&lineContributesToTotals(line));
    if(!targets.length){setStatus("Selecteer eerst minimaal één doelregel voor de verdeling.");return;}
    const sourceAmount=lineDirect(source); if(sourceAmount<=0){setStatus("Deze kostenregel heeft geen bedrag om te verdelen.");return;}
    const weights=targets.map(line=>method==="quantity"?Math.max(0,line.quantity):Math.max(0,lineDirect(line)));
    const totalWeight=weights.reduce((sum,value)=>sum+value,0); if(totalWeight<=0){setStatus("De geselecteerde doelregels hebben geen bruikbare verdeelbasis.");return;}
    let allocated=0; const next=targets.map((line,index)=>{const share=weights[index]/totalWeight;const amount=index===targets.length-1?sourceAmount-allocated:Math.round(sourceAmount*share*10000)/10000;allocated+=amount;return{sourceLineId,targetLineId:line.id,method,share,amount} as LineAllocation;});
    setAllocations(current=>[...current.filter(item=>item.sourceLineId!==sourceLineId),...next]); setStatus(`${source.description||"Kostenregel"} verdeeld over ${targets.length} regel(s). Nog opslaan.`);
  };
  const clearAllocation=(sourceLineId:number)=>{setAllocations(current=>current.filter(item=>item.sourceLineId!==sourceLineId));setStatus("Kostenverdeling opgeheven — nog opslaan");};

  const addLine = (lineType: LineType, initialScope?:{scopeType:ScopeFilterType;scopeRef:string}) => {
    if(versionStatus==="established")return;
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
      sourceSupplier: null, sourceUnitPrice: null, sourcePriceDate: null, sourceDocumentId: null, sourceDetails: null, sourceVisualPage: null, sourcePositionBounds: null, sourceVisualCrop: null, sourceVisualSearchRegion: null, sourceTextRegions: null, sourceOfferSummary: null,
      manualScopes: initialScope&&initialScope.scopeRef.trim() ? [{scopeType:initialScope.scopeType,scopeRef:initialScope.scopeRef.trim()}] : []
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
    const childIds = new Set<number>();
    const collect=(id:number)=>{
      if(childIds.has(id))return;
      childIds.add(id);
      for(const child of lines.filter(line=>line.parentId===id))collect(child.id);
    };
    collect(lineId);
    const count = childIds.size;
    if (count > 1 && !window.confirm(`Dit verwijdert ook ${count - 1} onderliggende regel(s) op alle niveaus. Doorgaan?`)) return;
    setLines(current => current.filter(line => !childIds.has(line.id)));
    setSelectedLineId(current => current != null && childIds.has(current) ? null : current);
    setSelectedLineIds(current=>current.filter(id=>!childIds.has(id)));
    setAllocations(current=>current.filter(item=>!childIds.has(item.sourceLineId)&&!childIds.has(item.targetLineId)));
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
        {lineContributesToTotals(line) && <>
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

  const addManualScopeToSelected=()=>{
    const ref=manualScopeRef.trim();
    if(!ref||!selectedLineIds.length)return;
    const selected=new Set(selectedLineIds);
    let changed=0;
    setLines(current=>current.map(line=>{
      if(!selected.has(line.id)||!isCostLine(line))return line;
      const existing=line.manualScopes??[];
      if(existing.some(item=>item.scopeType===manualScopeType&&item.scopeRef===ref))return line;
      changed++;
      return{...line,manualScopes:[...existing,{scopeType:manualScopeType,scopeRef:ref}]};
    }));
    if(changed){
      setStatus("Concept — niet opgeslagen");
      setManagementStatus(changed+" regel(s) gekoppeld aan "+scopeLabels[manualScopeType]+" "+ref+".");
    }
  };

  const removeManualScopeFromSelected=()=>{
    const ref=manualScopeRef.trim();
    if(!ref||!selectedLineIds.length)return;
    const selected=new Set(selectedLineIds);
    let changed=0;
    setLines(current=>current.map(line=>{
      if(!selected.has(line.id))return line;
      const before=line.manualScopes??[];
      const after=before.filter(item=>!(item.scopeType===manualScopeType&&item.scopeRef===ref));
      if(after.length===before.length)return line;
      changed++;
      return{...line,manualScopes:after};
    }));
    if(changed){
      setStatus("Concept — niet opgeslagen");
      setManagementStatus(changed+" handmatige scope(s) verwijderd.");
    }
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
      description: quoteProposal.target.description || compactQuoteLineDescription(candidate.text,quoteProposal.filename),
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
    try {
      await persistWorkbenchDraft(lines);
    } catch(error) {
      const message=error instanceof Error?error.message:"Opslaan mislukt";
      setStatus(message);
      if(message.includes("Staartkosten kunnen niet veilig worden berekend"))setFinancialIntegrityStatus(message);
    }
  };

  const publish = async () => {
    try{
      if(versionStatus==="draft"){
        await persistWorkbenchDraft(lines);
        setStatus("Vaststellen en publiceren naar Office…");
      }else{
        setStatus("Vastgestelde versie opnieuw publiceren naar Office…");
      }
      const response=await fetch("/api/workbench/current/publish",{
        method:"POST",
        headers:{Accept:"application/json"}
      });
      const payload=await response.json().catch(()=>({})) as {status?:string;contentHash?:string;error?:string};
      if(!response.ok)throw new Error(String(payload.error??"Publiceren mislukt"));
      setVersionStatus("established");
      await loadWorkbench();
      setStatus("Vastgesteld · gepubliceerd naar Office");
    }catch(error){
      const message=error instanceof Error?error.message:"Publiceren mislukt";
      try{await loadWorkbench();}catch{}
      setStatus(message);
    }
  };

  const startNewVersion = async () => {
    if(versionStatus!=="established"){
      setStatus("Maak eerst de huidige versie definitief.");
      return;
    }
    try{
      setStatus("Nieuwe conceptversie maken…");
      const response=await fetch("/api/workbench/current/versions",{
        method:"POST",
        headers:{Accept:"application/json"}
      });
      const payload=await response.json().catch(()=>({})) as {versionNo?:number;error?:string};
      if(!response.ok)throw new Error(String(payload.error??"Nieuwe versie kon niet worden gestart."));
      await loadWorkbench();
      await Promise.all([loadSubcalculations(),loadSubcalculationResults(),loadTailCosts()]);
      setStatus(`Nieuwe conceptversie v${payload.versionNo??""} gestart`);
    }catch(error){
      setStatus(error instanceof Error?error.message:"Nieuwe versie kon niet worden gestart.");
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

      <div className="commandbar commandbarTop" role="toolbar" aria-label="Calculatie acties">
        <button className="command" type="button" onClick={() => window.history.back()} title="Terug naar BREBO Office"><Icon name="office" /><span>Office</span></button>
        <details className="columnChooser structureChooser">
          <summary className="command" title="Structuurniveaus tonen"><Icon name="paragraph" /><span>Niveaus</span></summary>
          <div className="columnChooserMenu structureChooserMenu" onClick={event=>event.stopPropagation()}>
            <div className="columnChooserHead"><strong>Niveaus</strong><small>{classificationLabel[classificationScheme]}</small></div>
            <div className="structureChooserList">
              <button type="button" onClick={event=>{collapseAllStructure();event.currentTarget.closest("details")?.removeAttribute("open");}}>Alles inklappen</button>
              {Array.from({length:maxStructureDepth},(_,index)=>index+1).map(level=><button type="button" key={level} onClick={event=>{showStructureThroughLevel(level);event.currentTarget.closest("details")?.removeAttribute("open");}}>T/m niveau {level}</button>)}
              <button type="button" onClick={event=>{expandAllStructure();event.currentTarget.closest("details")?.removeAttribute("open");}}>Alles uitklappen</button>
              <small>Open of sluit één tak altijd op de structuurregel zelf.</small>
            </div>
          </div>
        </details>
        <button className="command" type="button"
          disabled={versionStatus==="established"||(activeSubcalculationId!=null&&!activeScopeRef)}
          onClick={() => addLine("item",activeScopeRef?{scopeType:activeScopeType,scopeRef:activeScopeRef}:undefined)}
          title={activeScopeRef?"Nieuwe regel in "+scopeLabels[activeScopeType]+" "+activeScopeRef:activeSubcalculationId!=null?"Kies eerst een scope om een regel in deze deelcalculatie toe te voegen":"Nieuwe calculatieregel"}>
          <Icon name="line" /><span>Regel</span>
        </button>
        <div className="commandDivider" />
        <button className={"command commandBuilder" + (recipeWorkspaceOpen ? " commandActive" : "")} type="button" title="Builder: projectbronnen controleren en calculatieconcept opbouwen" onClick={()=>setRecipeWorkspaceOpen(true)}><Icon name="builder" /><span>Builder</span></button>
        <div className="commandDivider" />
        <button className={"command commandSecondary" + (subcalculationOpen ? " commandActive" : "")} type="button" disabled={versionStatus==="established"} title={versionStatus==="established"?"Start een nieuwe versie om deelcalculaties te wijzigen":"Deelcalculaties beheren in Calc"} onClick={() => setSubcalculationOpen(open => !open)}><Icon name="subcalc" /><span>Deelcalc</span></button>
        <button className={"command commandSecondary" + (tailCostOpen ? " commandActive" : "")} type="button" disabled={versionStatus==="established"} title={versionStatus==="established"?"Start een nieuwe versie om staartkosten te wijzigen":"Staartkosten beheren in Calc"} onClick={() => setTailCostOpen(open=>!open)}><Icon name="tail" /><span>Staartkosten</span></button>
        <button className={"command commandSecondary" + (priceWorkspaceOpen ? " commandActive" : "")} type="button" disabled={versionStatus==="established"} title={versionStatus==="established"?"Start een nieuwe versie om prijsbronnen te wijzigen":"Artikelen, prijzen en prijsbronnen"} onClick={() => setPriceWorkspaceOpen(open => !open)}><Icon name="prices" /><span>Prijzen</span></button>
        <button className="command commandSecondary" type="button" disabled={versionStatus==="established"} title={versionStatus==="established"?"Start een nieuwe versie om een offerte in te lezen":"Leveranciersofferte inlezen en overnemen"} onClick={()=>{setPriceWorkspaceOpen(true);openQuoteUpload();}}><Icon name="quote" /><span>Offerte</span></button>
        <button className={"command commandSecondary" + (labourRatesOpen ? " commandActive" : "")} type="button" title="Uurtarieven beheren" onClick={()=>void openLabourRates()}><Icon name="rates" /><span>Uurtarieven</span></button>
        <details className="columnChooser">
          <summary className="command commandSecondary" title="Kolommen kiezen"><span>Kolommen</span><small>{columnSettings.filter(column=>column.visible).length}</small></summary>
          <div className="columnChooserMenu" onClick={event=>event.stopPropagation()}>
            <div className="columnChooserHead"><strong>Kolommen kiezen</strong><button type="button" onClick={resetColumns}>Standaard</button></div>
            <div className="columnChooserList">
              {columnSettings.map((column,index)=><div className="columnChooserRow" key={column.key}>
                <label><input type="checkbox" checked={column.visible} onChange={event=>patchColumn(column.key,{visible:event.target.checked})}/><span>{column.label}</span></label>
                <div className="columnChooserMove"><button type="button" disabled={index===0} onClick={()=>moveColumn(column.key,-1)}>↑</button><button type="button" disabled={index===columnSettings.length-1} onClick={()=>moveColumn(column.key,1)}>↓</button></div>
              </div>)}
            </div>
          </div>
        </details>
        <span className="commandSpacer" />
        <button className="command commandUtility" type="button" onClick={()=>void openSettings()} title="Instellingen" aria-label="Instellingen"><Icon name="settings" /></button>
        <button className="command commandUtility" type="button" onClick={()=>setHelpOpen(true)} title="Help" aria-label="Help"><Icon name="help" /></button>
        <div className="commandDivider" />
        {versionStatus==="established"
          ? <>
              {publicationFreshness&&publicationFreshness.status!=="current"&&publicationFreshness.status!=="office_changed"&&<button className="command commandSave" type="button" onClick={()=>void publish()} title="De vastgestelde Calc-versie opnieuw naar Office publiceren"><Icon name="office" /><span>Publiceren</span></button>}
              <button className="command commandSave" type="button" onClick={startNewVersion} title="Nieuwe conceptversie starten vanuit de vastgestelde snapshot"><Icon name="save" /><span>Nieuwe versie</span></button>
            </>
          : <>
              <button className="command commandSave" type="button" onClick={save} disabled={!calculationReady} title={calculationReady ? "Concept opslaan in Calc" : "Los eerst de onvolledige calculatieregels op"}><Icon name="save" /><span>Opslaan</span></button>
              <button className="command commandSave" type="button" onClick={publish} disabled={!calculationReady} title={calculationReady?"Vaststellen en commerciële samenvatting naar Office publiceren":"Los eerst de onvolledige calculatieregels op"}><Icon name="office" /><span>Publiceren</span></button>
            </>}
      </div>
      <input ref={quoteFileRef} className="hiddenFile" type="file" accept=".pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={event => void uploadQuote(event.target.files?.[0])} />

    <main>
      <div className="calcCompactHeader">
        <div className="calcCompactIdentity">
          <strong>{calculationTitle}</strong>
          <span>{project?.code??"Project"}{project?.client_name?` · ${project.client_name}`:""}</span>
        </div>
        <div className="calcCompactState">
          <span>v{versionNo} · {versionStatus==="established"?"vastgesteld":"concept"} · {status}</span>
          {versionHistory.length>0&&<details className="versionHistory"><summary>{versionHistory.length} versie{versionHistory.length===1?"":"s"}</summary><div className="versionHistoryList">{versionHistory.map(item=><div key={item.id}><strong>v{item.versionNo}</strong><span>{item.status==="established"?"vastgesteld":"concept"} · verkoop {money.format(item.salesPrice)}</span>{item.establishedAt&&<small>{new Date(item.establishedAt).toLocaleString("nl-NL")}</small>}</div>)}</div></details>}
        </div>
      </div>

      <DockableWindow id="kpis" label="KPI's" collapsible><section className="kpis">
        <div><span>Directe kostprijs</span><strong>{money.format(displayedTotals.direct)}</strong></div>
        <div><span>Staartkosten</span><strong>{money.format(displayedTotals.markupAmount)}</strong></div>
        <div className="primary"><span>Verkoopprijs excl. BTW</span><strong>{money.format(displayedTotals.sales)}</strong></div>
        <div className="primary vatInclusiveKpi"><span>Verkoopprijs incl. BTW</span><strong>{money.format(activeSubcalculationResult?.salesPriceInclVat??liveVatTotals.totalInclVat)}</strong>{(activeSubcalculationResult?.vatBreakdown??liveVatTotals.breakdown).length>0&&<div className="vatInclusiveBreakdown">{(activeSubcalculationResult?.vatBreakdown??liveVatTotals.breakdown).map(item=><small key={item.code}><b>{item.label}</b><em>{"reverseCharged" in item&&item.reverseCharged?"verlegd":"treatment" in item&&item.treatment==="exempt"?"vrijgesteld":item.rate==null?"—":String(item.rate)+"%"}</em><strong>{money.format(item.vatAmount)}</strong></small>)}</div>}</div>
        <div className="costMixKpi">
          <div className="costMixHeading"><span>Kostenverhouding directe kosten</span>{directCostMix.total>0&&<strong>{money.format(directCostMix.total)}</strong>}</div>
          {directCostMix.total>0?<div className="costMixBody">
            <div className="costMixChart" aria-label="Verdeling directe kosten">
              <svg viewBox="0 0 42 42" role="img">
                <circle className="costMixTrack" cx="21" cy="21" r="15.9155" fill="transparent" pathLength="100"/>
                {directCostMix.segments.map(item=><circle
                  key={item.key}
                  className={`costMixSegment costMix-${item.key}`}
                  cx="21" cy="21" r="15.9155" fill="transparent" pathLength="100"
                  strokeDasharray={`${item.percentage} ${100-item.percentage}`}
                  strokeDashoffset={-item.offset}
                ><title>{item.label}: {item.percentage.toFixed(1)}% · {money.format(item.amount)}</title></circle>)}
              </svg>
            </div>
            <div className="costMixLegend">
              {directCostMix.rows.map(item=><div key={item.key}><i className={`costMixDot costMix-${item.key}`}></i><span>{item.label}</span><b>{item.percentage.toFixed(1)}%</b><small>{money.format(item.amount)}</small></div>)}
            </div>
          </div>:<small className="muted">Nog geen directe kosten.</small>}
        </div>
      </section></DockableWindow>



      {versionStatus==="established" && <div className="readinessBanner establishedBanner" role="status"><div><strong>Versie vastgesteld</strong><span>Deze Calc-versie is immutable. Start een nieuwe versie om wijzigingen aan te brengen.</span></div></div>}
      {publicationFreshness&&["office_changed","version_mismatch"].includes(publicationFreshness.status)&&<div className="readinessBanner publicationFreshnessWarning" role="alert"><div><strong>Office-publicatie niet meer actueel</strong><span>{publicationFreshness.message}</span></div>{versionStatus==="established"&&(publicationFreshness.status==="version_mismatch"?<button type="button" onClick={()=>void publish()}>Vastgestelde versie opnieuw publiceren</button>:<button type="button" onClick={()=>void startNewVersion()}>Nieuwe Calc-versie starten</button>)}</div>}
      {publicationFreshness?.status==="draft_pending"&&<div className="readinessBanner publicationFreshnessInfo" role="status"><div><strong>Nieuw Calc-concept in bewerking</strong><span>{publicationFreshness.message}</span></div></div>}
      {publicationFreshness?.status==="publish_recovery"&&<div className="readinessBanner publicationFreshnessWarning" role="alert"><div><strong>Publicatie kan veilig worden hersteld</strong><span>{publicationFreshness.message}</span></div><button type="button" onClick={()=>void publish()}>Publicatie afronden</button></div>}
      {publicationFreshness?.status==="never_published"&&<div className="readinessBanner publicationFreshnessInfo" role="status"><div><strong>Nog niet gepubliceerd</strong><span>{publicationFreshness.message}</span></div>{versionStatus==="established"&&<button type="button" onClick={()=>void publish()}>Naar Office publiceren</button>}</div>}
      {versionStatus==="draft"&&versionDiff?.baselineVersionNo!=null&&<details className="versionDiffPanel">
        <summary>
          <strong>Wijzigingen sinds v{versionDiff.baselineVersionNo}</strong>
          <span>{versionDiff.counts.added} toegevoegd · {versionDiff.counts.changed} gewijzigd · {versionDiff.counts.removed} verwijderd</span>
          {versionDiff.commercialDelta&&<small>Verkoop {versionDiff.commercialDelta.salesPrice>=0?"+":""}{money.format(versionDiff.commercialDelta.salesPrice)}</small>}
        </summary>
        <div className="versionDiffTotals">
          {versionDiff.commercialDelta&&<>
            <span>Directe kost <b>{versionDiff.commercialDelta.directCost>=0?"+":""}{money.format(versionDiff.commercialDelta.directCost)}</b></span>
            <span>Staartkosten <b>{versionDiff.commercialDelta.markupAmount>=0?"+":""}{money.format(versionDiff.commercialDelta.markupAmount)}</b></span>
            <span>Verkoop <b>{versionDiff.commercialDelta.salesPrice>=0?"+":""}{money.format(versionDiff.commercialDelta.salesPrice)}</b></span>
          </>}
        </div>
        <div className="versionDiffChanges">
          {versionDiff.changes.length===0?<span>Geen regelwijzigingen ten opzichte van de vorige vastgestelde versie.</span>:versionDiff.changes.map(change=><div key={change.structureKey}>
            <b>{change.kind==="added"?"Toegevoegd":change.kind==="removed"?"Verwijderd":"Gewijzigd"}</b>
            <span>{change.description}</span>
            {change.changedFields.length>0&&<small>{change.changedFields.join(", ")}</small>}
          </div>)}
        </div>
      </details>}

      {versionStatus==="draft"&&publicationReadiness&&!publicationReadiness.canPublish&&(()=>{
        const unsavedReason=publicationReadiness.reasons.find(reason=>reason.startsWith("Er zijn wijzigingen in de calculatie die nog niet zijn opgeslagen."));
        const blockingReasons=publicationReadiness.reasons.filter(reason=>reason!==unsavedReason);
        const onlyUnsaved=Boolean(unsavedReason)&&blockingReasons.length===0;
        return <div className={"readinessBanner"+(onlyUnsaved?" unsavedBanner":"")} role="status">
          <div>
            <strong>{onlyUnsaved?"Wijzigingen nog niet opgeslagen":"Nog niet publiceerbaar"}</strong>
            <span>{onlyUnsaved
              ?"Sla de calculatie op. Calc rekent daarna de totalen opnieuw door en controleert of publiceren mogelijk is."
              :(blockingReasons[0]??unsavedReason??"Controleer de calculatie.")}</span>
          </div>
          {!onlyUnsaved&&blockingReasons.slice(1).map((reason,index)=><div className="readinessItems" key={index}><span><small>{reason}</small></span></div>)}
          {!onlyUnsaved&&unsavedReason&&<div className="readinessItems"><span><small>Sla daarna de calculatie op om de publicatiecontrole opnieuw uit te voeren.</small></span></div>}
        </div>;
      })()}
      {!calculationReady && <div className="readinessBanner" role="alert">
        <div><strong>Calculatie onvolledig</strong><span>{
          unresolvedLines.length && incompleteLabourLines.length
            ? `${unresolvedLines.length} prijs- of normbron(nen) en ${incompleteLabourLines.length} arbeidsregel(s) zijn onvolledig.`
            : unresolvedLines.length
              ? `${unresolvedLines.length} prijs- of normbron(nen) ontbreken.`
              : `${incompleteLabourLines.length} arbeidsregel(s) hebben een uurprijs maar geen norm/totaaluren.`
        } Publiceren en opslaan zijn geblokkeerd totdat de regels compleet zijn.</span></div>
        <div className="readinessItems">
          {unresolvedLines.map(line=><button type="button" key={`source-${line.id}`} onClick={()=>setSelectedLineId(line.id)}><b>{line.code || "Regel"}</b><span>{line.description}</span><small>{line.resolutionReason || "Bron niet beschikbaar."}</small></button>)}
          {incompleteLabourLines.map(line=><button type="button" key={`labour-${line.id}`} onClick={()=>setSelectedLineId(line.id)}><b>{line.code || "Regel"}</b><span>{line.description}</span><small>Uurprijs ingevuld, maar norm/totaaluren ontbreken.</small></button>)}
        </div>
      </div>}

      {helpOpen&&<div className="settingsOverlay helpOverlay" role="dialog" aria-modal="true" aria-label="Calc-help">
        <div className="settingsPanel helpPanel">
          <div className="settingsHead">
            <div><span className="eyebrow">BREBO CALC</span><h2>Help</h2><p>Zoek op onderwerp of open een onderdeel van de handleiding.</p></div>
            <button type="button" className="panelClose" onClick={()=>setHelpOpen(false)} aria-label="Sluiten">×</button>
          </div>
          <div className="helpSearch"><Icon name="help"/><input autoFocus value={helpQuery} onChange={event=>setHelpQuery(event.target.value)} placeholder="Zoeken in Calc-help…" /></div>
          <div className="helpContents">
            {[
              {title:"Starten met een calculatie",keywords:"start project office calculatie builder bronnen documenten structuur nlsfb stabu vrij",body:"Open Builder bovenin om projectbronnen te controleren en een calculatieconcept op te bouwen. Bij NL-SfB of STABU bouw je de calculatiestructuur vanuit de zoekboom; dubbelklik op een classificatiemap om de ontbrekende structuur toe te voegen. Bij Vrij maak je hoofdgroepen en paragrafen direct in het rekenblad. Gewone calculatieregels voeg je altijd vrij toe."},
              {title:"Hoofdstukken en paragrafen",keywords:"hoofdstuk paragraaf niveau structuur nlsfb stabu zoekboom",body:"De calculatie gebruikt één stelsel: NL-SfB, STABU of Vrij. Bij NL-SfB/STABU komen hoofdgroepen, paragrafen, codes en omschrijvingen uit de zoekboom en zijn ze niet vrij wijzigbaar. De echte calculatiehiërarchie staat in het rekenblad tussen de calculatieregels. Gebruik Niveaus voor de globale weergave; open of sluit één tak met het pijltje op die structuurregel. Alleen bij Vrij beheer je hoofdgroepen en paragrafen handmatig in het rekenblad. Iedere structuurregel toont zijn niveau en eigen subtotaal."},
              {title:"Calculatieregels",keywords:"regel aantal norm uren uurprijs materiaal materieel onderaanneming btw",body:"Vul hoeveelheid, norm of totaaluren en de kostendragers in. Arbeid rekent met totaaluren × uurprijs; materiaal, materieel, onderaanneming en overig rekenen per hoeveelheid."},
              {title:"BTW",keywords:"btw hoog laag verlegd vrijgesteld",body:"Kies per verkoopregel de BTW-keuze Hoog, Laag, Verlegd of Vrijgesteld. De KPI-zone totaliseert de grondslag en het BTW-bedrag en toont totaal excl. en incl. BTW."},
              {title:"Recepten",keywords:"recept boom slepen toepassen",body:"Gebruik de receptenboom links. Sleep een recept naar een paragraaf of regel binnen die paragraaf. Bij een eenduidige bron wordt het recept direct toegepast; anders opent Recept toepassen voor controle."},
              {title:"Recepten beheren",keywords:"recept beheren bibliotheek samenstellen",body:"Open Recepten beheren via de Vensters-sectie links. Recepten worden in Calc samengesteld uit regels en verwijzen naar actuele brondata/tarieven."},
              {title:"Deelcalculaties",keywords:"deelcalculatie scope positie",body:"Een calculatieregel of positie kan aan meerdere deelcalculaties gekoppeld zijn. Deelcalculaties gebruiken dezelfde centrale kostlogica als de hoofdcalculatie en voorkomen dubbele staartkosten."},
              {title:"Staartkosten",keywords:"staartkosten percentage vast bedrag opslag",body:"Staartkosten worden bovenop de directe kosten berekend. De standaardbasis is owner direct cost; deelcalculatiestaartkosten worden niet nogmaals in de hoofdcalculatie belast."},
              {title:"Uurtarieven",keywords:"uurtarief arbeid rol standaard tarief",body:"Beheer concrete arbeidskosttarieven in het venster Uurtarieven. In Instellingen leg je per rol het standaardtarief vast. Handmatige regels zonder rol krijgen nooit stilletjes een tarief toegewezen."},
              {title:"Prijzen en artikelen",keywords:"prijzen artikelen prijsbron office",body:"Open Prijzen om artikelen uit Office te zoeken of een prijsbron te verwerken. Een gekozen bron blijft aan de calculatieregel gekoppeld voor herleidbaarheid."},
              {title:"Offerte inlezen en overnemen",keywords:"offerte pdf leverancier upload overnemen",body:"Open Prijzen en kies Offerte inlezen. Calc stuurt het bestand naar Office voor extractie, toont de originele offerte naast de herkende regels en laat geselecteerde offerteregels overnemen naar de calculatie."},
              {title:"Kolommen",keywords:"kolommen tonen verbergen breedte volgorde",body:"Kies welke kolommen zichtbaar zijn in de calculatie. De voorkeur is persoonlijk. Kolombreedte en volgorde kunnen worden aangepast zonder de calculatie-inhoud te wijzigen."},
              {title:"KPI's",keywords:"kpi kostenverhouding taart btw marge",body:"De KPI-zone toont directe kosten, staartkosten, verkoop, kostenmix en BTW-totalisatie. De zone is inklapbaar en dockbaar."},
              {title:"Vensters en docken",keywords:"venster dock pin slepen links rechts boven onder",body:"Werkvensters kunnen vast in Calc staan, zweven of aan een schermrand worden gedockt. Gebruik de pin om terug te keren naar Calc; sleep een los venster naar links, rechts, boven of onder om te docken."},
              {title:"Opslaan en publiceren",keywords:"opslaan publiceren office vastgesteld",body:"Opslaan bewaart het concept. Publiceren controleert de calculatie, maakt een immutable snapshot en stuurt de commerciële samenvatting naar Office. Onvolledige arbeidsregels of andere blokkades verhinderen publiceren."},
              {title:"Versies en historie",keywords:"versie historie snapshot verschil",body:"Iedere vastgestelde versie bewaart totalen, BTW, kostenmix en regelvolgorde. Start een nieuwe versie om verder te rekenen zonder de vorige waarheid te wijzigen."}
            ].filter(item=>{
              const q=helpQuery.trim().toLocaleLowerCase("nl-NL");
              return !q||(`${item.title} ${item.keywords} ${item.body}`).toLocaleLowerCase("nl-NL").includes(q);
            }).map((item,index)=><details className="helpTopic" key={item.title} open={Boolean(helpQuery.trim())}>
              <summary><strong>{item.title}</strong><span>{index+1}</span></summary>
              <p>{item.body}</p>
            </details>)}
          </div>
        </div>
      </div>}

      {settingsOpen && <div className="settingsOverlay" role="dialog" aria-modal="true" aria-label="Calc-instellingen">
        <div className="settingsPanel">
          <div className="settingsHead">
            <div><span className="eyebrow">CALC CONFIGURATIE</span><h2>Instellingen</h2><p>Centraal beheer van calculatie-instellingen. BTW-keuzes zijn hier configureerbaar en niet hardcoded.</p></div>
            <button type="button" className="panelClose" onClick={()=>setSettingsOpen(false)} aria-label="Sluiten">×</button>
          </div>
          <div className="settingsSection">
            <div className="settingsSectionHead"><div><h3>BTW-keuzes</h3><p>Gebruik eigen keuzes voor bijvoorbeeld verschillende tarieven, verlegging of vrijstelling.</p></div></div>
            <div className="vatRegimeList">
              {vatRegimes.map(regime=><div className="vatRegimeRow" key={regime.id}>
                <input value={regime.label} onChange={event=>setVatRegimes(current=>current.map(item=>item.id===regime.id?{...item,label:event.target.value}:item))} onBlur={()=>void patchVatSetting(regime.id,{label:regime.label})} aria-label="Omschrijving" />
                <input value={regime.code} onChange={event=>setVatRegimes(current=>current.map(item=>item.id===regime.id?{...item,code:event.target.value}:item))} onBlur={()=>void patchVatSetting(regime.id,{code:regime.code})} aria-label="Code" />
                <select value={regime.treatment} onChange={event=>void patchVatSetting(regime.id,{treatment:event.target.value as VatRegime["treatment"]})} aria-label="Behandeling">
                  <option value="normal">Normaal</option>
                  <option value="reverse_charge">Verlegd</option>
                  <option value="exempt">Vrijgesteld</option>
                </select>
                <DecimalInput value={regime.rate} min={0} max={100} allowEmpty onChange={next=>setVatRegimes(current=>current.map(item=>item.id===regime.id?{...item,rate:next}:item))} className="" />
                <label className="toggleLabel"><input type="checkbox" checked={regime.active} onChange={event=>void patchVatSetting(regime.id,{active:event.target.checked})} /> Actief</label>
              </div>)}
              {vatRegimes.length===0 && <p className="muted">Nog geen BTW-keuzes ingesteld.</p>}
            </div>
            <div className="vatRegimeCreate">
              <input placeholder="Omschrijving" value={vatRegimeDraft.label} onChange={event=>setVatRegimeDraft(current=>({...current,label:event.target.value}))} />
              <input placeholder="Code" value={vatRegimeDraft.code} onChange={event=>setVatRegimeDraft(current=>({...current,code:event.target.value}))} />
              <select value={vatRegimeDraft.treatment} onChange={event=>setVatRegimeDraft(current=>({...current,treatment:event.target.value as VatRegime["treatment"],rate:event.target.value==="normal"?current.rate:null}))}>
                <option value="normal">Normaal</option>
                <option value="reverse_charge">Verlegd</option>
                <option value="exempt">Vrijgesteld</option>
              </select>
              <DecimalInput value={vatRegimeDraft.rate} min={0} max={100} allowEmpty onChange={next=>setVatRegimeDraft(current=>({...current,rate:next}))} className="" />
              <button type="button" onClick={()=>void createVatSetting()}>BTW-keuze toevoegen</button>
            </div>
            {vatSettingsStatus && <p className="settingsStatus">{vatSettingsStatus}</p>}
          </div>
          <div className="settingsSection">
            <div className="settingsSectionHead"><div><h3>Classificatie calculatie</h3><p>De receptenboom volgt automatisch het gekozen coderingsstelsel. Recepten blijven hetzelfde; alleen de mapstructuur verandert.</p></div></div>
            <div className="classificationSchemeChoices">
              <label><input type="radio" name="classification-scheme" checked={classificationScheme==="nl_sfb"} onChange={()=>void changeClassificationScheme("nl_sfb")} /> <span><strong>NL-SfB</strong><small>Toon recepten onder NL-SfB-mapcodes.</small></span></label>
              <label><input type="radio" name="classification-scheme" checked={classificationScheme==="stabu"} onChange={()=>void changeClassificationScheme("stabu")} /> <span><strong>STABU</strong><small>Toon recepten onder STABU-mapcodes.</small></span></label>
              <label><input type="radio" name="classification-scheme" checked={classificationScheme==="custom"} onChange={()=>void changeClassificationScheme("custom")} /> <span><strong>Vrij</strong><small>Gebruik de vrije receptcategorie/receptcode.</small></span></label>
            </div>
          </div>
          <div className="settingsSection">
            <div className="settingsSectionHead"><div><h3>Standaard uurtarieven</h3><p>Per rol gebruikt Calc één standaardtarief als uitgangspunt. De volledige tariefkaart beheer je in het venster Uurtarieven.</p></div><button type="button" className="secondary" onClick={()=>void openLabourRates()}>Uurtarieven openen</button></div>
            <div className="labourDefaultList">
              {labourRates.filter(rate=>rate.isDefault).map(rate=><div key={rate.id} className="labourDefaultRow"><span><strong>{rate.label}</strong><small>{rate.roleRef}</small></span><b>{money.format(rate.hourlyCostRate)}/uur</b></div>)}
              {labourRates.filter(rate=>rate.isDefault).length===0&&<p className="muted">Nog geen standaard uurtarieven ingesteld.</p>}
            </div>
          </div>
          <div className="settingsSection">
            <div className="settingsSectionHead">
              <div><h3>Vensters</h3><p>Zet alle dockbare Calc-vensters terug naar hun veilige standaardpositie.</p></div>
              <button type="button" className="secondary" onClick={()=>{
                for(const key of Object.keys(localStorage))if(key.startsWith("brebo-calc-window-"))localStorage.removeItem(key);
                window.dispatchEvent(new Event("brebo-calc-reset-windows"));
                setStatus("Vensters hersteld");
              }}>Vensters herstellen</button>
            </div>
          </div>
        </div>
      </div>}

      <div className={"calcWorkspaceShell"+(recipeTreeCollapsed?" recipeTreeCollapsed":"")}>
        <DockableWindow id="recipe-tree" label="Recepten" collapsible>
          <aside className="recipeTreeSidebar isDockableRecipeTree" aria-label="Recepten en vensters">
          {!recipeTreeCollapsed&&<>
            <div className="recipeTreeScheme"><span>Indeling</span><strong>{classificationLabel[classificationScheme]}</strong></div>
            <div className="recipeTreeSearch">
              <span aria-hidden="true">⌕</span>
              <input value={recipeTreeQuery} onChange={event=>setRecipeTreeQuery(event.target.value)} placeholder="Zoek recept…" aria-label="Zoek recept" />
              {recipeTreeQuery&&<button type="button" onClick={()=>setRecipeTreeQuery("")} aria-label="Zoekopdracht wissen">×</button>}
            </div>
            <div className="recipeTreeExpandActions" aria-label="Boomweergave">
              <button type="button" title="Alles inklappen" aria-label="Alles inklappen" onClick={()=>{
                setRecipeTreeOpenState(Object.fromEntries(recipeTreePaths(recipeTree.children).map(path=>[path,false])));
                setRecipeTreeExpansion("default");
              }}><span aria-hidden="true">▴</span></button>
              <button type="button" title="Alles uitklappen" aria-label="Alles uitklappen" onClick={()=>{
                setRecipeTreeOpenState(Object.fromEntries(recipeTreePaths(recipeTree.children).map(path=>[path,true])));
                setRecipeTreeExpansion("default");
              }}><span aria-hidden="true">▾</span></button>
            </div>
            <div className="recipeTreeBody">
              {recipeTree.children.length===0?<p className="muted">{recipeTreeQuery?"Geen recepten gevonden.":"Nog geen recepten."}</p>:renderRecipeTreeNodes(recipeTree.children)}
            </div>
            <div className="recipeTreeActions">
              <strong>Vensters</strong>
              <button type="button" onClick={()=>setRecipeWorkspaceOpen(true)}>Recept toepassen</button>
              <button type="button" onClick={()=>setRecipeLibraryOpen(true)}>Recepten beheren</button>
              <button type="button" onClick={()=>setSubcalculationOpen(true)}>Deelcalculaties</button>
              <button type="button" onClick={()=>setTailCostOpen(true)}>Staartkosten</button>
              <button type="button" onClick={()=>setPriceWorkspaceOpen(true)}>Prijzen</button>
              <button type="button" onClick={()=>void openLabourRates()}>Uurtarieven</button>
            </div>
          </>}
          </aside>
        </DockableWindow>
        <section className="workbench">

        {labourRatesOpen&&<DockableWindow id="hour-rates" label="Uurtarieven" defaultFloating><div className="managementWorkspace labourRateWorkspace">
          <div className="recipeWorkspaceHead">
            <div><span className="eyebrow">CALC TARIEVEN</span><h2>Uurtarieven</h2><p>Beheer concrete arbeidskosttarieven. Eén tarief per rol kan als standaard worden gemarkeerd.</p></div>
            <button className="panelClose" type="button" onClick={()=>setLabourRatesOpen(false)} aria-label="Sluiten">×</button>
          </div>
          <div className="managementGrid">
            <section className="managementCard">
              <h3>Nieuw uurtarief</h3>
              <label><span>Rol/code</span><input value={labourRateDraft.roleRef} onChange={event=>setLabourRateDraft(current=>({...current,roleRef:event.target.value}))} placeholder="bijv. timmerman" /></label>
              <label><span>Naam</span><input value={labourRateDraft.label} onChange={event=>setLabourRateDraft(current=>({...current,label:event.target.value}))} placeholder="Timmerman" /></label>
              <label><span>Tarief per uur</span><DecimalInput value={labourRateDraft.hourlyCostRate} min={0} onChange={next=>setLabourRateDraft(current=>({...current,hourlyCostRate:next??0}))} className="" /></label>
              <label><span>Bron/referentie</span><input value={labourRateDraft.sourceRef} onChange={event=>setLabourRateDraft(current=>({...current,sourceRef:event.target.value}))} placeholder="cao / kostprijsblad / leverancier" /></label>
              <label><span>Geldig vanaf</span><input type="date" value={labourRateDraft.validFrom} onChange={event=>setLabourRateDraft(current=>({...current,validFrom:event.target.value}))} /></label>
              <label><span>Geldig tot</span><input type="date" value={labourRateDraft.validTo} onChange={event=>setLabourRateDraft(current=>({...current,validTo:event.target.value}))} /></label>
              <label className="toggleLabel"><input type="checkbox" checked={labourRateDraft.isDefault} onChange={event=>setLabourRateDraft(current=>({...current,isDefault:event.target.checked}))} /> Standaard voor deze rol</label>
              <button type="button" onClick={()=>void createLabourRateSetting()}>Uurtarief toevoegen</button>
            </section>
            <section className="managementCard managementWide">
              <h3>Tariefkaart</h3>
              <div className="labourRateList">{labourRates.length===0?<p className="muted">Nog geen uurtarieven.</p>:labourRates.map(rate=><div className={"labourRateRow"+(!rate.active?" is-inactive":"")} key={rate.id}>
                <div><strong>{rate.label}</strong><span>{rate.roleRef}{rate.sourceRef?` · ${rate.sourceRef}`:""}</span><small>{rate.validFrom??"geen startdatum"} → {rate.validTo??"doorlopend"}</small></div>
                <b>{money.format(rate.hourlyCostRate)}/uur</b>
                <label className="toggleLabel"><input type="checkbox" checked={rate.isDefault} onChange={event=>void patchLabourRate(rate.id,{isDefault:event.target.checked})} /> Standaard</label>
                <label className="toggleLabel"><input type="checkbox" checked={rate.active} onChange={event=>void patchLabourRate(rate.id,{active:event.target.checked})} /> Actief</label>
              </div>)}</div>
            </section>
          </div>
          {labourRateStatus&&<div className="managementStatus" role="status">{labourRateStatus}</div>}
        </div></DockableWindow>}

        {recipeWorkspaceOpen && <DockableWindow id="recipe-workspace" label="Builder" defaultFloating><div className="recipeWorkspace">
          <div className="recipeWorkspaceHead">
            <div><span className="eyebrow">OFFICE → CALC</span><h2>Builder</h2><p>{aggregate ? `Office-context ${aggregate.officeVersion} · Office blijft bronhouder` : "Office-context wordt nog niet geleverd."}</p></div>
            <button className="panelClose" type="button" onClick={() => setRecipeWorkspaceOpen(false)} aria-label="Sluiten">×</button>
          </div>
          {!aggregate ? <p className="muted">De bestaande calculatie blijft beschikbaar. De nieuwe Office-workbenchcontext is nog niet geladen.</p> : <>
            <section className="conceptBuilder">
              <div className="conceptBuilderIntro">
                <div><span className="eyebrow">PROJECTBRONNEN UIT OFFICE</span><h3>Calculatie bouwen vanuit Office</h3><p>Builder begint met de documenten die Office al aan dit project heeft gekoppeld. Calc bewaart geen tweede documentwaarheid.</p></div>
                <div className="conceptBuilderActions"><button type="button" onClick={()=>void refreshDocumentCandidates()}>Office-bronnen vernieuwen</button><button className="conceptBuilderPrimary" type="button" disabled={!aggregate.editable || aggregate.autoBuildEligibility.eligiblePositionRefs.length===0} onClick={()=>void generateUnambiguousRecipes()}>Concept opbouwen</button></div>
              </div>
              <div className="conceptBuilderSteps">
                <div className={aggregate.documentTriage.some(item=>item.status==="primary")?"is-ready":"is-review"}><b>1</b><span>Bronnen<strong>{aggregate.documentTriage.filter(item=>item.status==="primary").length} primair · {aggregate.documentTriage.filter(item=>item.status==="review").length} review</strong></span></div>
                <div className={aggregate.takeoffs.length>0?"is-ready":"is-review"}><b>2</b><span>Uittrekken<strong>{aggregate.takeoffs.length} uitgetrokken positie{aggregate.takeoffs.length===1?"":"s"}</strong></span></div>
                <div className={aggregate.structureProposal.ready?"is-ready":"is-review"}><b>3</b><span>Voorstel<strong>{aggregate.concept.positions.length} posities · {aggregate.recipeProposals.length} recepten</strong></span></div>
                <div className={aggregate.automationReadiness.canAutoSaveConcept?"is-ready":"is-review"}><b>4</b><span>Review<strong>{aggregate.automationReadiness.canAutoSaveConcept?"eenduidig op te bouwen":(aggregate.automationReadiness.reasons[0]??"controle nodig")}</strong></span></div>
              </div>
              {aggregate.concept.sourceDecisions.length>0&&<div className="sourceDecisionPanel">
                <div className="sourceDecisionHead"><strong>Broncontrole</strong><span>{aggregate.concept.sourceDecisions.filter(item=>item.status==="conflict").length} blokkade(s) · {aggregate.concept.sourceDecisions.filter(item=>item.status==="superseded").length} vervangen revisie(s)</span></div>
                <div className="sourceDecisionList">
                  {[...aggregate.concept.sourceDecisions].sort((a,b)=>(a.status==="conflict"?0:a.status==="superseded"?1:2)-(b.status==="conflict"?0:b.status==="superseded"?1:2)||a.positionRef.localeCompare(b.positionRef,"nl")).map((decision,index)=><div className={"sourceDecisionItem is-"+decision.status} key={decision.positionRef+"-"+decision.factType+"-"+String(decision.measurementKind)+"-"+index}>
                    <span className="sourceDecisionBadge">{decision.status==="conflict"?"Actueel conflict":decision.status==="superseded"?"Oude revisie vervangen":decision.status==="different_measurement_kind"?"Andere maatsoort":"Consistent"}</span>
                    <div><strong>{decision.positionRef} · {decision.factType}{decision.measurementKind?" · "+decision.measurementKind:""}</strong><small>{decision.reason}{decision.leadingDocumentId!==null?` · leidend document #${decision.leadingDocumentId}${decision.leadingValue!==null?" · waarde "+decision.leadingValue:""}`:""}</small></div>
                  </div>)}
                </div>
              </div>}
            </section>
            <section className="takeoffWorkspace">
              <div className="takeoffWorkspaceHead"><div><span className="eyebrow">UITTREKSTAAT</span><h3>Uitgetrokken uit Office-bronnen</h3><p>Deze maatstaat is de controlelaag tussen broninformatie en recepten. Bronconflicten blijven zichtbaar en worden niet stil overschreven.</p></div><button type="button" onClick={()=>window.print()} disabled={aggregate.takeoffs.length===0}>Uittrekstaat printen</button></div>
              {aggregate.takeoffs.length===0?<p className="muted">Nog geen uitgetrokken posities beschikbaar. Office moet eerst bruikbare maat- en positiegegevens uit de projectbronnen leveren.</p>:<div className="takeoffTableWrap"><table className="takeoffTable"><thead><tr><th>Positie</th><th>Aantal</th><th>Maatsoort</th><th>Breedte</th><th>Hoogte</th><th>Oppervlak</th><th>Omtrek</th><th>Broncontrole</th></tr></thead><tbody>{aggregate.takeoffs.map(row=>{const decisions=aggregate.concept.sourceDecisions.filter(item=>item.positionRef===row.position_ref);const conflict=decisions.some(item=>item.status==="conflict");return <tr key={row.id} className={conflict?"has-conflict":""}><td><strong>{row.position_ref}</strong></td><td>{row.quantity}</td><td>{row.measurement_kind||"—"}</td><td>{row.width_mm==null?"—":row.width_mm+" mm"}</td><td>{row.height_mm==null?"—":row.height_mm+" mm"}</td><td>{row.area_m2==null?"—":row.area_m2.toFixed(3)+" m²"}</td><td>{row.perimeter_m==null?"—":row.perimeter_m.toFixed(3)+" m"}</td><td>{conflict?<span className="takeoffConflict">Conflict</span>:aggregate.derivedTakeoffPositionRefs?.includes(row.position_ref)?"Zelf uitgetrokken":decisions.some(item=>item.status==="superseded")?"Revisie verwerkt":"OK"}</td></tr>})}</tbody></table></div>}
            </section>
            <div className="recipeControls">
              <label><span>Recepten plaatsen in</span><select value={recipeParagraphKey} onChange={event => setRecipeParagraphKey(event.target.value)}>
                {aggregate.structureProposal.ready&&<option value="__auto__">Automatisch volgens structuurvoorstel</option>}
                <option value="">Kies paragraaf…</option>
                {lines.filter(line=>line.lineType==="paragraph").map(line => {
                  const key=line.structureKey??("local:"+line.id);
                  return <option key={key} value={key}>{line.code ? line.code+" · " : ""}{line.description}</option>;
                })}
              </select></label>
              <span className="recipeActionStatus" role="status" aria-live="polite">{recipeActionStatus || (aggregate.editable ? "Office-brondata beschikbaar voor Calc." : "Office-brondata is alleen-lezen; Calc kan er wel mee rekenen.")}</span>
            </div>
            <div className="recipeSummary">
              <div><span>Primaire documenten</span><strong>{aggregate.documentTriage.filter(item=>item.status==="primary").length}</strong></div>
              <div><span>Conceptposities</span><strong>{aggregate.concept.positions.length}</strong></div>
              <div><span>Receptvoorstellen</span><strong>{aggregate.recipeProposals.length}</strong></div><div><span>Veilig automatisch</span><strong>{aggregate.autoBuildEligibility.eligiblePositionRefs.length}</strong></div>
              <div><span>Calc-regels uit recept</span><strong>{lines.filter(line => line.priceSourceType === "recipe").length}</strong></div>
              <div><span>Directe kost Calc</span><strong>{money.format(totals.direct)}</strong></div>
            </div>
            <div className="documentTriagePanel">
              <div className="documentTriageHead"><div><strong>Projectdocumenten uit Office</strong><span>Office beheert documentidentiteit, revisies, projectkoppeling en broninformatie. Builder bepaalt alleen welke Office-bronnen voor deze calculatie bruikbaar zijn.</span></div><div className="documentTriageHeadActions"><small>{aggregate.documentTriage.length} document(en)</small><button type="button" onClick={()=>void refreshDocumentCandidates()}>Office-bronnen vernieuwen</button></div></div>
              <div className="documentTriageList">
                {aggregate.documentTriage.length===0?<p className="muted">Office heeft nog geen projectdocumenten aan deze calculatiecontext geleverd. Voeg documenten eerst in Office toe of laat Office de projectbronnen opnieuw beoordelen.</p>:aggregate.documentTriage.map(item=>
                  <div className={"documentTriageItem status-"+item.status} key={item.documentId}>
                    <div><strong>{item.title}</strong><span>{item.documentFamily||item.documentType||"onbekend type"} · bron #{item.documentId}</span></div>
                    <div className="documentTriageScore"><b>{item.score}</b><small>{item.status==="primary"?"primair":item.status==="supporting"?"ondersteunend":item.status==="excluded"?"uitgesloten":"review"}</small></div>
                    <div className="documentTriageSignals">{item.signals.map((signal,index)=><small key={index}>{signal}</small>)}{item.overridden&&<small><b>Handmatig:</b> automatisch was {item.automaticStatus}.</small>}</div>
                    <div className="documentTriageChoice">
                      <select value={item.status} onChange={event=>void setDocumentDecision(item.documentId,event.target.value as "primary"|"supporting"|"review"|"excluded")}>
                        <option value="primary">Primair</option>
                        <option value="supporting">Ondersteunend</option>
                        <option value="review">Review nodig</option>
                        <option value="excluded">Uitsluiten</option>
                      </select>
                      {item.overridden&&<button type="button" onClick={()=>void resetDocumentDecision(item.documentId)}>Auto</button>}
                    </div>
                    {item.positionRefs.length>0&&<div className="documentTriagePositions">{item.positionRefs.map(ref=><span key={ref}>{ref}</span>)}</div>}
                  </div>
                )}
              </div>
            </div>
            {documentTriageStatus&&<div className="managementStatus">{documentTriageStatus}</div>}
            {aggregate.scopeCoverage.length>0&&<div className="scopeCoveragePanel">
              <div className="scopeCoverageHead"><div><strong>Scopecontext-dekking</strong><span>Controle op aangeleverde gebouwcontext per calculatiepositie; informatief, niet blokkerend.</span></div></div>
              <div className="scopeCoverageList">
                {aggregate.scopeCoverage.map(item=>{
                  const label=scopeLabels[item.scopeType];
                  const complete=item.covered===item.total;
                  return <div className={"scopeCoverageItem"+(complete?" is-complete":"")} key={item.scopeType}>
                    <div><strong>{label}</strong><span>{item.covered} / {item.total} posities</span></div>
                    <div className="scopeCoverageBar"><span style={{width:(item.total?Math.round(item.covered/item.total*100):0)+"%"}} /></div>
                    <b>{item.total?Math.round(item.covered/item.total*100):0}%</b>
                    <small>{complete?"Volledig":("Ontbreekt bij "+item.missingPositionRefs.join(", "))}</small>
                  </div>;
                })}
              </div>
            </div>}
            <div className="structureProposalPanel">
              <div className="structureProposalHead">
                <div><strong>Calc-structuurvoorstel</strong><span>Alleen eenduidige receptmatches worden automatisch gegroepeerd; twijfel blijft apart zichtbaar.</span></div>
                <div className="structureProposalActions">
                  <button type="button" disabled={!aggregate.structureProposal.ready} onClick={applyStructureProposal}>Structuur toepassen</button>
                  <button type="button" disabled={aggregate.autoBuildEligibility.eligiblePositionRefs.length===0} onClick={()=>void generateUnambiguousRecipes()}>Concept opbouwen</button>
                </div>
              </div>
              {aggregate.structureProposal.groups.length===0?<p className="muted">Nog geen structuurvoorstel mogelijk.</p>:
                <div className="structureProposalGroups">{aggregate.structureProposal.groups.map(group=>
                  <div className={"structureProposalGroup"+(group.recipeRef===null?" is-review":"")} key={group.key}>
                    <div><strong>{group.label}</strong><span>{group.recipeRef?("Recept #"+group.recipeRef):"Handmatige keuze nodig"}</span></div>
                    <div>{group.positionRefs.map(ref=><span className="structurePosition" key={ref}>{ref}</span>)}</div>
                  </div>
                )}</div>
              }
              {structureProposalStatus&&<div className="managementStatus">{structureProposalStatus}</div>}
            </div>
            {!aggregate.automationReadiness.canAutoSaveConcept && aggregate.automationReadiness.reasons.length>0 && <div className="recipeWarnings"><strong>Automatische conceptopslag geblokkeerd</strong>{aggregate.automationReadiness.reasons.map((reason,index)=><span key={index}>{reason}</span>)}</div>}
            {aggregate.concept.unresolved.length > 0 && <div className="recipeWarnings"><strong>Open punten</strong>{aggregate.concept.unresolved.map((warning,index)=><span key={index}>{warning}</span>)}</div>}
            <div className="recipeColumns">
              <div className="recipePanel"><h3>Posities</h3>{aggregate.concept.positions.length === 0 ? <p className="muted">Nog geen complete posities.</p> : aggregate.concept.positions.map((position,index) => {
                const candidates = aggregate.takeoffs.filter(row => row.position_ref.trim() === position.positionRef);
                const selectedTakeoffId = selectedTakeoffByPosition[position.positionRef];
                return <div className="conceptPosition" key={`${position.positionRef}-${index}`}><div><strong>{position.positionRef}</strong><span>{position.quantity} × {position.widthMm} × {position.heightMm} mm</span></div><span className={"reviewBadge " + position.reviewStatus}>{position.reviewStatus}</span>{position.description && <p>{position.description}</p>}{position.warnings.map((warning,warningIndex)=><small key={warningIndex}>{warning}</small>)}
                  {candidates.length > 1 && <div className="takeoffReview"><strong>Meerdere geometrieën gevonden</strong>{candidates.map(candidate => <label key={candidate.id} className={selectedTakeoffId === candidate.id ? "is-selected" : ""}><input type="radio" name={`takeoff-${position.positionRef}`} checked={selectedTakeoffId === candidate.id} onChange={() => setSelectedTakeoffByPosition(current => ({...current,[position.positionRef]:candidate.id}))} /><span><b>Take-off #{candidate.id}</b><small>{candidate.quantity} × {candidate.width_mm ?? "—"} × {candidate.height_mm ?? "—"} mm · {candidate.area_m2 ?? "—"} m² · omtrek {candidate.perimeter_m ?? "—"} m</small></span></label>)}</div>}
                </div>;
              })}</div>
              <div className="recipePanel"><h3>Voorstellen</h3>{recipeRefreshDelta&&<div className="recipeRefreshDelta"><div><strong>Verversing {recipeRefreshDelta.positionRef}</strong><span>{recipeRefreshDelta.recipeLabel}</span></div><div className="recipeRefreshDeltaGrid"><span>Regels <b>{recipeRefreshDelta.old.lines} → {recipeRefreshDelta.next.lines}</b></span><span>Hoeveelheid <b>{recipeRefreshDelta.old.quantity.toLocaleString("nl-NL",{maximumFractionDigits:3})} → {recipeRefreshDelta.next.quantity.toLocaleString("nl-NL",{maximumFractionDigits:3})}</b></span><span>Arbeid <b>{money.format(recipeRefreshDelta.old.labour)} → {money.format(recipeRefreshDelta.next.labour)}</b><em>Δ {money.format(recipeRefreshDelta.next.labour-recipeRefreshDelta.old.labour)}</em></span><span>Materiaal <b>{money.format(recipeRefreshDelta.old.material)} → {money.format(recipeRefreshDelta.next.material)}</b><em>Δ {money.format(recipeRefreshDelta.next.material-recipeRefreshDelta.old.material)}</em></span><span>Materieel <b>{money.format(recipeRefreshDelta.old.equipment)} → {money.format(recipeRefreshDelta.next.equipment)}</b><em>Δ {money.format(recipeRefreshDelta.next.equipment-recipeRefreshDelta.old.equipment)}</em></span><span>OA <b>{money.format(recipeRefreshDelta.old.subcontracting)} → {money.format(recipeRefreshDelta.next.subcontracting)}</b><em>Δ {money.format(recipeRefreshDelta.next.subcontracting-recipeRefreshDelta.old.subcontracting)}</em></span><span>Overig <b>{money.format(recipeRefreshDelta.old.other)} → {money.format(recipeRefreshDelta.next.other)}</b><em>Δ {money.format(recipeRefreshDelta.next.other-recipeRefreshDelta.old.other)}</em></span><span className="recipeRefreshNet">Directe kost <b>{money.format(recipeRefreshDelta.old.labour+recipeRefreshDelta.old.material+recipeRefreshDelta.old.equipment+recipeRefreshDelta.old.subcontracting+recipeRefreshDelta.old.other)} → {money.format(recipeRefreshDelta.next.labour+recipeRefreshDelta.next.material+recipeRefreshDelta.next.equipment+recipeRefreshDelta.next.subcontracting+recipeRefreshDelta.next.other)}</b></span><span className="recipeRefreshNet">Netto impact <b>{money.format((recipeRefreshDelta.next.labour+recipeRefreshDelta.next.material+recipeRefreshDelta.next.equipment+recipeRefreshDelta.next.subcontracting+recipeRefreshDelta.next.other)-(recipeRefreshDelta.old.labour+recipeRefreshDelta.old.material+recipeRefreshDelta.old.equipment+recipeRefreshDelta.old.subcontracting+recipeRefreshDelta.old.other))}</b></span></div>{recipeRefreshDelta.lineChanges.length>0&&<details className="recipeRefreshLineDiff"><summary>Regelwijzigingen ({recipeRefreshDelta.lineChanges.length})</summary><div>{recipeRefreshDelta.lineChanges.map(change=><div className={"recipeRefreshLineChange is-"+change.kind} key={change.key}><div className="recipeRefreshLineLabels"><span className="recipeRefreshLineBadge">{change.kind==="added"?"Toegevoegd":change.kind==="removed"?"Verwijderd":"Gewijzigd"}</span>{change.kind==="changed"&&<span className={"recipeRefreshImpact is-"+change.impact}>{change.impact==="higher"?"Hoger":change.impact==="lower"?"Lager":"Neutraal"}</span>}</div><div><strong>{change.description}</strong><small>{change.oldQuantity===null?"—":change.oldQuantity.toLocaleString("nl-NL",{maximumFractionDigits:3})} → {change.nextQuantity===null?"—":change.nextQuantity.toLocaleString("nl-NL",{maximumFractionDigits:3})} · {change.oldDirect===null?"—":money.format(change.oldDirect)} → {change.nextDirect===null?"—":money.format(change.nextDirect)}</small></div></div>)}</div></details>}<button type="button" onClick={()=>setRecipeRefreshDelta(null)}>Sluiten</button></div>}{aggregate.recipeSelectionIssues.length>0&&<div className="recipeSelectionIssues">{aggregate.recipeSelectionIssues.map(issue=><div key={issue.positionRef} className={"recipeSelectionIssue is-"+issue.code}><div><strong>{issue.positionRef}</strong><small>{issue.message}{issue.candidateRecipeRefs.length?" · recept "+issue.candidateRecipeRefs.join(", "):""}</small></div><button type="button" disabled={!aggregate.editable} onClick={()=>void resetRecipeIssue(issue)}>{issue.code==="no_match"?"Recept kiezen":issue.code==="all_rejected"?"Afwijzingen herstellen":"Keuzes tonen"}</button></div>)}</div>}{aggregate.recipeProposals.length === 0 ? <p className="muted">Geen toepasselijke receptvoorstellen.</p> : aggregate.recipeProposals.map((proposal,index) =>
                <div className="recipeProposalCard" id={`recipe-proposal-${proposal.positionRef}-${proposal.recipeRef}`} key={`${proposal.positionRef}-${proposal.recipeRef}-${index}`}>{(()=>{
                  const decision=aggregate.recipeProposalDecisions.find(item=>item.current&&item.decision!=="reset"&&item.positionRef===proposal.positionRef&&item.recipeVersionId===Number(proposal.recipeRef));
                  const stale=aggregate.recipeProposalDecisions.some(item=>!item.current&&item.positionRef===proposal.positionRef&&item.recipeVersionId===Number(proposal.recipeRef));
                  const busy=recipeReviewBusyKey===proposal.positionRef+"::"+proposal.recipeRef;
                  const existingForPosition=lines.map(line=>generatedRecipeIdentityFromLine(line)).filter(identity=>identity?.positionRef===proposal.positionRef);
                  const currentExisting=existingForPosition.some(identity=>
                    identity?.recipeVersionId===Number(proposal.recipeRef)&&
                    identity?.officeVersion===aggregate.officeVersion&&
                    (identity?.selectionVersion??null)===(aggregate.concept.sourceSelectionVersion??null)
                  );
                  const staleExisting=existingForPosition.length>0&&!currentExisting;
                  return <><div><strong>{proposal.label}</strong><span>{proposal.positionRef} · {Math.round(proposal.confidence*100)}%</span></div>{decision&&<span className={"recipeReviewStatus is-"+decision.decision}>{decision.decision==="accepted"?"Geaccepteerd":"Afgewezen"}</span>}{!decision&&stale&&<span className="recipeReviewStatus is-stale">Oude review — bronselectie gewijzigd</span>}{proposal.reasons.map((reason,i)=><small key={i}>{reason}</small>)}{proposal.evidence.length>0&&<div className="recipeEvidence">{proposal.evidence.map((item,i)=><small key={item.term+"-"+i}><b>{item.term}</b>{item.documentId!==null?` · bron #${item.documentId}${item.sourcePage!==null?" · p."+item.sourcePage:""}`:" · bron niet specifiek"}{item.sourceFragment?" · "+item.sourceFragment:""}</small>)}</div>}<div className="recipeReviewActions"><button type="button" disabled={busy||!aggregate.editable} onClick={()=>void reviewRecipeProposal(proposal,"rejected")}>Afwijzen</button>{staleExisting&&<button type="button" disabled={busy||!aggregate.editable || !recipeParagraphKey || (aggregate.takeoffs.filter(row => row.position_ref.trim() === proposal.positionRef).length > 1 && !selectedTakeoffByPosition[proposal.positionRef])} onClick={()=>void acceptRecipeProposal(proposal,undefined,undefined,undefined,true)}>Verversen</button>}<button type="button" disabled={busy||!aggregate.editable || currentExisting || !recipeParagraphKey || (aggregate.takeoffs.filter(row => row.position_ref.trim() === proposal.positionRef).length > 1 && !selectedTakeoffByPosition[proposal.positionRef])} onClick={()=>void reviewRecipeProposal(proposal,"accepted")}>{currentExisting?"Actueel opgebouwd":"Bevestigen & doorrekenen"}</button></div></>;
                })()}</div>
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
        </div></DockableWindow>}

        {recipeLibraryOpen && <DockableWindow id="recipe-library" label="Recepten beheren" defaultFloating><div className="managementWorkspace">
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
              <label><span>NL-SfB mapcode</span><input value={recipeDraft.nlSfbPath} onChange={event=>setRecipeDraft(current=>({...current,nlSfbPath:event.target.value}))} placeholder="bijv. 31 / 31.2" /></label>
              <label><span>STABU mapcode</span><input value={recipeDraft.stabuPath} onChange={event=>setRecipeDraft(current=>({...current,stabuPath:event.target.value}))} placeholder="bijv. 30 / 30.20" /></label>
              <small className="fieldHint">Gebruik / tussen niveaus. De boom toont automatisch het pad van het gekozen calculatiestelsel.</small>
              <button type="button" onClick={() => void createRecipe()}>Recept aanmaken</button>
            </section>
            <section className="managementCard">
              <h3>Recepten</h3>
              <div className="managementList">{recipes.length===0?<p className="muted">Nog geen Calc-recepten.</p>:recipes.map(recipe=>
                <button type="button" className={"managementListItem"+(selectedRecipeVersionId===recipe.id?" is-selected":"")} key={recipe.id} onClick={()=>{setSelectedRecipeVersionId(recipe.id);setRecipeClassificationDraft(recipeClassificationPaths(recipe));}}>
                  <strong>{recipe.name}</strong><span>{recipe.recipeKey} · v{recipe.versionNo} · {recipe.status}</span><small>{recipe.lines.length} regel(s)</small>
                </button>
              )}</div>
            </section>
            {selectedRecipeVersionId&&<section className="managementCard managementWide recipeClassificationEditor">
              <h3>Classificatie recept</h3>
              <p className="muted">Hetzelfde recept kan onder beide coderingsstelsels worden teruggevonden.</p>
              <div className="managementFields">
                <label><span>NL-SfB mapcode</span><input value={recipeClassificationDraft.nlSfbPath} onChange={event=>setRecipeClassificationDraft(current=>({...current,nlSfbPath:event.target.value}))} placeholder="31 / 31.2" /></label>
                <label><span>STABU mapcode</span><input value={recipeClassificationDraft.stabuPath} onChange={event=>setRecipeClassificationDraft(current=>({...current,stabuPath:event.target.value}))} placeholder="30 / 30.20" /></label>
              </div>
              <button type="button" onClick={()=>void saveRecipeClassification()}>Classificatie opslaan</button>
            </section>}
            <section className="managementCard managementWide">
              <h3>Regel toevoegen aan {recipes.find(recipe=>recipe.id===selectedRecipeVersionId)?.name ?? "recept"}</h3>
              <div className="managementFields">
                <label><span>Regelcode</span><input value={recipeLineDraft.lineRef} onChange={event=>setRecipeLineDraft(current=>({...current,lineRef:event.target.value}))} /></label>
                <label><span>Omschrijving</span><input value={recipeLineDraft.description} onChange={event=>setRecipeLineDraft(current=>({...current,description:event.target.value}))} /></label>
                <label><span>Kostensoort</span><select value={recipeLineDraft.costKind} onChange={event=>setRecipeLineDraft(current=>({...current,costKind:event.target.value}))}><option value="material">Materiaal</option><option value="labour">Arbeid</option><option value="equipment">Materieel</option><option value="subcontracting">OA</option><option value="other">Overig</option></select></label>
                <label><span>Eenheid</span><input value={recipeLineDraft.unit} onChange={event=>setRecipeLineDraft(current=>({...current,unit:event.target.value}))} /></label>
                <label><span>Uittrekbasis</span><select value={recipeLineDraft.takeoffBasis} onChange={event=>setRecipeLineDraft(current=>({...current,takeoffBasis:event.target.value}))}><option value="fixed">Vast</option><option value="area">Oppervlak</option><option value="perimeter">Omtrek</option><option value="two_sides_plus_head">2 zijden + bovendorpel</option><option value="width">Breedte</option><option value="height">Hoogte</option><option value="part_area">Vakoppervlak</option><option value="internal_joint">Interne koppeling</option></select></label>
                <label><span>Factor</span><DecimalInput value={recipeLineDraft.factor} onChange={next=>setRecipeLineDraft(current=>({...current,factor:next??0}))} className="" /></label>
                <label><span>Verlies %</span><DecimalInput value={recipeLineDraft.wastePct} onChange={next=>setRecipeLineDraft(current=>({...current,wastePct:next??0}))} className="" /></label>
                {recipeLineDraft.takeoffBasis==="fixed" && <label><span>Vaste hoeveelheid</span><DecimalInput value={recipeLineDraft.fixedQuantity} onChange={next=>setRecipeLineDraft(current=>({...current,fixedQuantity:next??0}))} className="" /></label>}
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
        </div></DockableWindow>}

        {subcalculationOpen && <DockableWindow id="subcalculations" label="Deelcalculaties" defaultFloating><div className="managementWorkspace">
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
        </div></DockableWindow>}
        {tailCostOpen && <DockableWindow id="tail-costs" label="Staartkosten" defaultFloating><div className="managementWorkspace">
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
              <label><span>Waarde</span><DecimalInput value={tailCostDraft.value} onChange={next=>setTailCostDraft(v=>({...v,value:next??0}))} className="" /></label>
              <label><span>Rekenbasis</span><select value={tailCostDraft.baseScope} onChange={e=>setTailCostDraft(v=>({...v,baseScope:e.target.value}))}>
                <option value="owner_direct_cost">{tailCostDraft.ownerType==="subcalculation"?"Directe kost van deze deelcalculatie":"Alleen hoofdregels"}</option>
                <option value="owner_running_total">{tailCostDraft.ownerType==="subcalculation"?"Lopend totaal van deze deelcalculatie":"Lopend totaal hoofdregels"}</option>
                {tailCostDraft.ownerType==="calculation"&&<><option value="consolidated_direct_cost">Alle unieke directe kosten</option><option value="consolidated_running_total">Geconsolideerd lopend totaal</option></>}
                <option value="quantity">Hoeveelheid</option>
              </select></label>
              {tailCostDraft.basis==="per_unit"&&<label><span>Hoeveelheid</span><DecimalInput value={tailCostDraft.quantity} allowEmpty onChange={next=>setTailCostDraft(v=>({...v,quantity:next}))} className="" /></label>}
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
        </div></DockableWindow>}
        {priceWorkspaceOpen && <DockableWindow id="prices" label="Prijzen" defaultFloating><div className="priceWorkspace">
          <div className="priceWorkspaceHead">
            <div><span className="eyebrow">OFFICE PRIJSBRONNEN</span><h2>Artikelen & prijzen</h2><p>Zoek brondata uit BREBO Office of verwerk een nieuwe prijsbron voor deze calculatie.</p></div>
            <button className="panelClose" type="button" onClick={() => setPriceWorkspaceOpen(false)} aria-label="Sluiten">×</button>
          </div>
          <div className="priceActions">
            <label className="priceSearch"><span>Zoeken in artikelen en prijzen</span><input value={priceSearch} onChange={event => setPriceSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void searchArticles(); }} placeholder="Artikelnummer, omschrijving, leverancier…" /></label>
            <button type="button" className="sourceAction" onClick={() => void searchArticles()}><strong>Artikel zoeken</strong><span>Zoek direct in de beheerde Office-artikelstam.</span></button>
            <button type="button" className="sourceAction" onClick={() => setStatus("Import wordt gekoppeld aan Office document-import")}><strong>Prijslijst importeren</strong><span>XML, Excel, PDF, Word of andere bron via Office laten herkennen.</span></button>
            <button type="button" className="sourceAction" onClick={openQuoteUpload}><strong>Offerte inlezen</strong><span>{selectedLineId == null ? "Kies een offertebestand; koppel daarna aan een regel." : `Inlezen voor geselecteerde regel #${selectedLineId}`}</span></button>
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
        </div></DockableWindow>}

        {financialIntegrityStatus&&<div className="financialIntegrityWarning" role="alert">
          <strong>Financiële overlap geblokkeerd</strong>
          <span>{financialIntegrityStatus}</span>
        </div>}

        <div className="subcalcWorkmode">
          <label><span>Weergave</span><select value={activeSubcalculationId ?? ""} onChange={event=>{setActiveSubcalculationId(event.target.value?Number(event.target.value):null);setSelectedLineIds([]);}}>
            <option value="">Volledige calculatie</option>
            {subcalculations.map(item=><option key={item.id} value={item.id}>{item.description}</option>)}
          </select></label>
          <label><span>Scope</span><select value={activeScopeType} onChange={event=>{setActiveScopeType(event.target.value as ScopeFilterType);setActiveScopeRef("");setSelectedLineIds([]);}}>
            <option value="position">Positie</option>
            <option value="building">Gebouw</option>
            <option value="facade">Gevel</option>
            <option value="dwelling">Woning</option>
            <option value="dwelling_type">Woningtype</option>
            <option value="building_part">Bouwdeel</option>
          </select></label>
          <label><span>{scopeLabels[activeScopeType]}</span><select value={activeScopeRef} onChange={event=>{setActiveScopeRef(event.target.value);setSelectedLineIds([]);}}>
            <option value="">Alle {scopeLabels[activeScopeType].toLowerCase()}s</option>
            {availableScopeValues.map(value=><option key={value} value={value}>{value}</option>)}
          </select></label>
          {availableScopeValues.length>1&&<button type="button" className="scopeBulkButton" onClick={()=>void createAllSubcalculationsForScope()}>
            Maak alle {scopeLabels[activeScopeType].toLowerCase()}s als deelcalculaties
          </button>}
          {activeScopeCoverage&&activeScopeCoverage.covered<activeScopeCoverage.total&&<div className="scopeCoverageWarning" role="status">
            <strong>Context niet volledig</strong>
            <span>{activeScopeCoverage.missingPositionRefs.length} positie(s) hebben geen {scopeLabels[activeScopeType].toLowerCase()}: {activeScopeCoverage.missingPositionRefs.join(", ")}. Deze vallen niet in de deelcalculaties van deze doorsnede.</span>
          </div>}
          {activeScopeRef&&<div className="positionFilterActions">
            <span className="positionFilterNotice">Alleen weergave · totalen blijven ongewijzigd</span>
            <button type="button" onClick={()=>void createSubcalculationForScope(activeScopeType,activeScopeRef)}>
              {subcalculations.some(item=>item.scopes.some(scope=>scope.scopeType===activeScopeType&&scope.scopeRef===activeScopeRef))
                ?"Open deelcalculatie"
                :"Maak deelcalculatie van "+scopeLabels[activeScopeType].toLowerCase()}
            </button>
          </div>}
          {activeSubcalculationResult && <div className="subcalcWorkmodeTotals">
            <span><small>Direct</small><strong>{money.format(activeSubcalculationResult.directCost)}</strong></span>
            <span><small>Staartkosten</small><strong>{money.format(activeSubcalculationResult.allocatedTailCost)}</strong></span>
            <span><small>Verkoop</small><strong>{money.format(activeSubcalculationResult.salesPrice)}</strong></span>
            <span><small>Regels</small><strong>{activeSubcalculationResult.lineIds.length}</strong></span>
          </div>}
        </div>

        {scopeOverview.length>0&&<div className="scopeOverview">
          <div className="scopeOverviewHead">
            <div><strong>{scopeLabels[activeScopeType]}-overzicht</strong><span>Werkoverzicht; verandert de calculatietotalen niet.</span></div>
            <small>{scopeOverview.length} gevonden</small>
          </div>
          <div className="scopeOverviewGrid">
            {scopeOverview.map(item=><button type="button" className={"scopeOverviewCard"+(activeScopeRef===item.scopeRef?" is-active":"")} key={item.scopeRef} onClick={()=>{setActiveScopeRef(item.scopeRef);setSelectedLineIds([]);}}>
              <strong>{item.scopeRef}</strong>
              <span>{item.lineCount} regel{item.lineCount===1?"":"s"}</span>
              <b>{money.format(item.directCost)}</b>
              {item.salesPrice!=null
                ? <small>Deelcalc · verkoop {money.format(item.salesPrice)}{item.tailCost!=null?" · staart "+money.format(item.tailCost):""}</small>
                : <small>Nog geen deelcalculatie</small>}
            </button>)}
          </div>
        </div>}

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
          <label>Scope
            <select value={manualScopeType} onChange={event=>setManualScopeType(event.target.value as ScopeFilterType)}>
              {Object.entries(scopeLabels).map(([type,label])=><option key={type} value={type}>{label}</option>)}
            </select>
          </label>
          <input className="bulkScopeRef" value={manualScopeRef} onChange={event=>setManualScopeRef(event.target.value)} placeholder="bijv. Type A, Noord, K1" />
          <button type="button" disabled={!manualScopeRef.trim()} onClick={addManualScopeToSelected}>Scope toevoegen</button>
          <button type="button" disabled={!manualScopeRef.trim()} onClick={removeManualScopeFromSelected}>Scope verwijderen</button>
          <button type="button" onClick={bulkDetachSource}>Bron loskoppelen</button>
          {activeSubcalculationId!=null && <button type="button" onClick={() => void removeSelectedLinesFromActiveSubcalculation()}>Uit deze deelcalc</button>}
          <button type="button" className="danger" onClick={bulkDelete}>Verwijderen</button>
          <button type="button" onClick={() => setSelectedLineIds([])}>Selectie wissen</button>
        </div>}
        <div className={"grid"+(versionStatus==="established"?" is-readonly":"")} aria-readonly={versionStatus==="established"}>
          <div className="row head configurableRow" style={{gridTemplateColumns}}>
            {visibleColumns.map(column => <b className={column.key === "code" ? "codeHead resizableHead" : "resizableHead"} key={column.key}>
              {column.key === "code" && <input type="checkbox" aria-label="Alle regels selecteren" checked={workbenchLines.length > 0 && selectedLineIds.length === workbenchLines.length} onChange={event => setSelectedLineIds(event.target.checked ? workbenchLines.map(line => line.id) : [])} />}
              <span>{column.label}</span>
              <span className="columnResizeHandle" role="separator" aria-orientation="vertical" title="Sleep om kolombreedte te wijzigen" onPointerDown={event => startColumnResize(event,column.key)} />
            </b>)}
          </div>
          {visibleWorkbenchLines.map(line => {
            if (line.lineType === "chapter" || line.lineType === "paragraph") {
              const metric=structureMetrics.get(line.id)??{depth:line.lineType==="chapter"?1:2,subtotal:0};
              const collapsed=collapsedStructureIds.has(line.id);
              return <div className={line.lineType} key={line.id} data-structure-depth={metric.depth}>
                <div className="bulkCodeCell" onClick={event => event.stopPropagation()}><input type="checkbox" checked={selectedLineIds.includes(line.id)} onChange={event => toggleBulkLine(line.id, event.target.checked)} />{classificationScheme==="custom"?<input value={line.code} onChange={e => patchLine(line.id, { code: e.target.value })} aria-label="Vrije structuurcode" />:<span className="structureCodeLocked">{line.code}</span>}</div>
                <button type="button" className="structureCollapseToggle" aria-label={collapsed?"Uitklappen":"Inklappen"} title={collapsed?"Uitklappen":"Inklappen"} onClick={()=>setCollapsedStructureIds(current=>{const next=new Set(current);if(next.has(line.id))next.delete(line.id);else next.add(line.id);return next;})}>{collapsed?"▸":"▾"}</button>
                <div className="structureDescription" style={{paddingLeft:Math.max(0,metric.depth-1)*14}}>{classificationScheme==="custom"?<input value={line.description} onChange={e => patchLine(line.id, { description: e.target.value })} />:<strong className="structureDescriptionLocked">{line.description}</strong>}<small>{line.lineType==="chapter"?"Hoofdgroep":"Paragraaf"} · niveau {metric.depth}{classificationScheme!=="custom"?" · "+classificationLabel[classificationScheme]:""}</small></div>
                <div className="structureSubtotal"><small>Subtotaal</small><strong>{money.format(metric.subtotal)}</strong></div>
                <LineActions line={line} />
              </div>;
            }
            const trace=lineTrace(line);
            const cells: Record<ColumnKey, React.ReactNode> = {
              code: <div className="bulkCodeCell cell" onClick={event => event.stopPropagation()}><input type="checkbox" checked={selectedLineIds.includes(line.id)} onChange={event => toggleBulkLine(line.id,event.target.checked)} /><input value={line.code} onChange={e => patchLine(line.id,{code:e.target.value})} placeholder="Vrije code" aria-label="Vrije code" /></div>,
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
              building: <span className="cell traceCell">{(trace.scopes.building??[]).join(", ")||"—"}</span>,
              facade: <span className="cell traceCell">{(trace.scopes.facade??[]).join(", ")||"—"}</span>,
              dwelling: <span className="cell traceCell">{(trace.scopes.dwelling??[]).join(", ")||"—"}</span>,
              dwelling_type: <span className="cell traceCell">{(trace.scopes.dwelling_type??[]).join(", ")||"—"}</span>,
              building_part: <span className="cell traceCell">{(trace.scopes.building_part??[]).join(", ")||"—"}</span>,
              position: <span className="cell traceCell">{trace.position??"—"}</span>,
              recipe: <span className="cell traceCell">{trace.recipe??"—"}</span>,
              source: <span className="cell traceCell" title={trace.source??""}>{trace.source??"—"}</span>,
              vat: <select className="cell" value={line.vatRegimeId ?? ""} onClick={event=>event.stopPropagation()} onChange={event=>patchLine(line.id,{vatRegimeId:event.target.value===""?null:Number(event.target.value)})}><option value="">—</option>{vatRegimes.filter(regime=>regime.active||regime.id===line.vatRegimeId).map(regime=><option key={regime.id} value={regime.id}>{regime.label}</option>)}</select>,
              total: <div className="lineTotalCell"><strong>{line.lineType==="note" ? "—" : money.format(effectiveLineDirect(line))}</strong><LineActions line={line} /></div>
            };
            const canReceiveRecipe=classificationScheme!=="custom"||paragraphForDrop(line)!=null;
            return <div
              className={`row data configurableRow type-${line.lineType}${selectedLineId===line.id?" is-selected":""}${selectedLineIds.includes(line.id)?" is-bulk-selected":""}${recipeDropTargetId===line.id?" is-recipe-drop-target":""}`}
              style={{gridTemplateColumns}}
              key={line.id}
              onDragOver={event=>{
                if(!canReceiveRecipe||!Array.from(event.dataTransfer.types).includes(recipeDragMime))return;
                event.preventDefault();
                event.dataTransfer.dropEffect="copy";
                setRecipeDropTargetId(line.id);
              }}
              onDragLeave={()=>{if(recipeDropTargetId===line.id)setRecipeDropTargetId(null);}}
              onDrop={event=>{if(canReceiveRecipe)void dropRecipeOnLine(event,line);}}
              onClick={() => {setSelectedLineId(line.id);setQuoteStatus(`Regel #${line.id} geselecteerd: ${line.description || "zonder omschrijving"}`);}}>
              {visibleColumns.map(column => <React.Fragment key={column.key}>{cells[column.key]}</React.Fragment>)}
            </div>;
          })}
          {classificationScheme==="custom"&&activeSubcalculationId==null&&versionStatus!=="established"&&<div className="structureInlineActions">
            <button type="button" onClick={()=>addLine("chapter")}>+ Hoofdgroep</button>
            <button type="button" onClick={()=>addLine("paragraph")}>+ Paragraaf</button>
          </div>}
          {activeScopeRef
            ? <button className="newrow" onClick={() => addLine("item",{scopeType:activeScopeType,scopeRef:activeScopeRef})}>+ Nieuwe regel in {scopeLabels[activeScopeType]} {activeScopeRef}</button>
            : activeSubcalculationId==null
              ? <button className="newrow" onClick={() => addLine("item")}>+ Nieuwe calculatieregel</button>
              : <div className="subcalcFilteredNotice">Je werkt nu in een deelcalculatie zonder actieve scope. Kies eerst een gebouw/gevel/woning/woningtype/bouwdeel/positie om een nieuwe regel veilig te koppelen.</div>}
        </div>
      </section>
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
