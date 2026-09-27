import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type LineType = "chapter" | "paragraph" | "item" | "allowance" | "adjustable" | "option" | "note";
type PriceSourceType = "manual" | "article" | "recipe" | "supplier_quote";
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
  priceSourceType: PriceSourceType;
  officeSourceId: string | null;
  sourceReference: string | null;
  sourceSupplier: string | null;
  sourceUnitPrice: number | null;
  sourcePriceDate: string | null;
  sourceDocumentId: string | null;
  sourceDetails: string | null;
  sourceVisualPage: number | null;
  sourceOfferSummary: string | null;
};
type QuoteCandidate = { value: number; score: number; line_no: number; text: string };
type QuoteLine = { position: string; quantity: number; unit: string; description: string; details?: string; detail_fields?: Record<string,string>; offer_summary?: string; source_page?: number | null; unit_price: number; line_total: number; line_no: number };
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

const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const isCostLine = (line: Line) => !["chapter", "paragraph", "note"].includes(line.lineType);
const lineDirect = (line: Line) => line.quantity * (line.labour + line.material + line.equipment + line.subcontracting + line.other);

const classificationScheme: ClassificationScheme = "custom";
const sourceDetailLabels = ["Systeem","Uw-waarde","Omschrijving deur","Kleur","Profielen","Beglazing","Beschläge","Deurbeslag","Deurbeslagpakket","Ontwatering","Gewicht positie","Ventilatierooster","Bovenste sluiter","Bander","Drukknop","Rozet","PZ-cilinder","Slot"];
function parseSourceDetails(details: string | null): Array<[string,string]> {
  if (!details?.trim()) return [];
  const escaped = sourceDetailLabels.map(label => label.replace(/[.*+?^$()|[\]\\]/g, "\\const classificationScheme: ClassificationScheme = "custom";")).join("|");
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
    other: Number(raw.other_unit_cost ?? 0),
    priceSourceType: String(raw.price_source_type ?? "manual") as PriceSourceType,
    officeSourceId: raw.office_source_id == null ? null : String(raw.office_source_id),
    sourceReference: raw.source_reference == null ? null : String(raw.source_reference),
    sourceSupplier: raw.source_supplier == null ? null : String(raw.source_supplier),
    sourceUnitPrice: raw.source_unit_price == null ? null : Number(raw.source_unit_price),
    sourcePriceDate: raw.source_price_date == null ? null : String(raw.source_price_date),
    sourceDocumentId: raw.source_document_id == null ? null : String(raw.source_document_id),
    sourceDetails: raw.source_details == null ? null : String(raw.source_details),
    sourceVisualPage: raw.source_visual_page == null ? null : Number(raw.source_visual_page),
    sourceOfferSummary: raw.source_offer_summary == null ? null : String(raw.source_offer_summary)
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
  const [priceWorkspaceOpen, setPriceWorkspaceOpen] = useState(false);
  const [priceSearch, setPriceSearch] = useState("");
  const [articleResults, setArticleResults] = useState<ArticleSearchItem[]>([]);
  const [articleSearchStatus, setArticleSearchStatus] = useState("Zoek in de centrale Office-artikelstam.");
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [quoteStatus, setQuoteStatus] = useState("Selecteer eerst een calculatieregel.");
  const [quoteProposal, setQuoteProposal] = useState<QuoteProposal | null>(null);
  const [quoteCarrier, setQuoteCarrier] = useState<CostCarrier>("subcontracting");
  const [selectedQuotePositions, setSelectedQuotePositions] = useState<string[]>([]);
  const quoteFileRef = useRef<HTMLInputElement>(null);

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
      labour: 0, material: 0, equipment: 0, subcontracting: 0, other: 0,
      priceSourceType: "manual", officeSourceId: null, sourceReference: null,
      sourceSupplier: null, sourceUnitPrice: null, sourcePriceDate: null, sourceDocumentId: null, sourceDetails: null, sourceVisualPage: null, sourceOfferSummary: null
    }]);
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
          unit: "", quantity: 0, labour: 0, material: 0, equipment: 0, subcontracting: 0, other: 0,
          priceSourceType: "manual", officeSourceId: null, sourceReference: null, sourceSupplier: null,
          sourceUnitPrice: null, sourcePriceDate: null, sourceDocumentId: null, sourceDetails: null, sourceVisualPage: null, sourceOfferSummary: null
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
          unit: "", quantity: 0, labour: 0, material: 0, equipment: 0, subcontracting: 0, other: 0,
          priceSourceType: "manual", officeSourceId: null, sourceReference: null, sourceSupplier: null,
          sourceUnitPrice: null, sourcePriceDate: null, sourceDocumentId: null, sourceDetails: null, sourceVisualPage: null, sourceOfferSummary: null
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
            otherUnitCost: line.other,
            priceSourceType: line.priceSourceType,
            officeSourceId: line.officeSourceId,
            sourceReference: line.sourceReference,
            sourceSupplier: line.sourceSupplier,
            sourceUnitPrice: line.sourceUnitPrice,
            sourcePriceDate: line.sourcePriceDate,
            sourceDocumentId: line.sourceDocumentId,
            sourceDetails: line.sourceDetails,
            sourceVisualPage: line.sourceVisualPage,
            sourceOfferSummary: line.sourceOfferSummary
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
        <div className="contextActions"><span className="saveState">{status}</span></div>
      </div>

      <section className="kpis">
        <div><span>Directe kostprijs</span><strong>{money.format(totals.direct)}</strong></div>
        <div><span>Opslag op inkoop</span><strong><input className="markup" type="number" step="0.1" value={markupPct} onChange={e => { setMarkupPct(Number(e.target.value)); setStatus("Concept — niet opgeslagen"); }} />%</strong></div>
        <div><span>Opslagbedrag</span><strong>{money.format(totals.markupAmount)}</strong></div>
        <div className="primary"><span>Verkoopprijs</span><strong>{money.format(totals.sales)}</strong></div>
      </section>

      <section className="workbench">
        <div className="commandbar" role="toolbar" aria-label="Calculatie acties">
          <button className="command" type="button" onClick={() => window.history.back()} title="Terug naar BREBO Office"><Icon name="office" /><span>Office</span></button>
          <div className="commandDivider" />
          <button className="command" type="button" onClick={() => addLine("chapter")} title="Nieuw hoofdstuk"><Icon name="chapter" /><span>Hoofdstuk</span></button>
          <button className="command" type="button" onClick={() => addLine("paragraph")} title="Nieuwe paragraaf"><Icon name="paragraph" /><span>Paragraaf</span></button>
          <button className="command" type="button" onClick={() => addLine("item")} title="Nieuwe calculatieregel"><Icon name="line" /><span>Regel</span></button>
          <div className="commandDivider" />
          <button className="command commandSecondary" type="button" title="Recepten"><Icon name="recipe" /><span>Recept</span></button>
          <button className={"command commandSecondary" + (priceWorkspaceOpen ? " commandActive" : "")} type="button" title="Artikelen, prijzen en prijsbronnen" onClick={() => setPriceWorkspaceOpen(open => !open)}><Icon name="prices" /><span>Prijzen</span></button>
          <span className="commandSpacer" />
          <button className="command commandSave" type="button" onClick={save} title="Calculatie opslaan"><Icon name="save" /><span>Opslaan</span></button>
        </div>

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
                <span className="quoteLineDescription"><strong>{line.description}</strong><small>{line.quantity} {line.unit} × {money.format(line.unit_price)}</small>{(line.details || line.source_page || line.offer_summary) && <details className="quoteLineDetails"><summary>Technisch detail</summary><div className="sourceDetailPanel">{line.source_page && <div className="sourceVisualWrap"><img className="sourceVisual" src={`/api/quotes/${quoteProposal.fileId}/visual/${line.source_page}`} alt={`Bronbeeld offertepositie ${line.position}`} loading="lazy" /><small>Bronbeeld · pagina {line.source_page}</small></div>}<div className="sourceDetailContent">{line.detail_fields && Object.keys(line.detail_fields).length > 0 ? <dl className="detailFields">{Object.entries(line.detail_fields).map(([key,value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl> : line.details && <pre>{line.details}</pre>}{line.offer_summary && <div className="offerSummary"><small>CONCEPT OFFERTEOMSCHRIJVING</small><p>{line.offer_summary}</p></div>}</div></div></details>}</span>
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
            return <div className={`row data type-${line.lineType}${selectedLineId === line.id ? " is-selected" : ""}`} key={line.id} onClick={() => { setSelectedLineId(line.id); setQuoteStatus(`Regel #${line.id} geselecteerd: ${line.description || "zonder omschrijving"}`); }}>
              <input className="cell" value={line.code} onChange={e => patchLine(line.id, { code: e.target.value })} />
              <div className="descWrap">
                <input className="cell desc" value={line.description} onChange={e => patchLine(line.id, { description: e.target.value })} />
                {line.priceSourceType === "supplier_quote" && line.sourceDocumentId && <button
                  type="button"
                  className="priceSourceBadge"
                  title={line.sourceReference ? `Offerte: ${line.sourceReference}` : "Offerte openen"}
                  onClick={(event) => {
                    event.stopPropagation();
                    window.open(`/api/quotes/${line.sourceDocumentId}/preview`, "_blank", "noopener,noreferrer");
                  }}
                >Offerte</button>}
                {(line.sourceDetails || line.sourceVisualPage || line.sourceOfferSummary) && <details className="calcLineDetails" onClick={event => event.stopPropagation()}>
                  <summary>Details uit bronofferte</summary>
                  <div className="sourceDetailPanel">{line.sourceVisualPage && line.sourceDocumentId && <div className="sourceVisualWrap"><img className="sourceVisual" src={`/api/quotes/${line.sourceDocumentId}/visual/${line.sourceVisualPage}`} alt={`Bronbeeld ${line.code || "offerteregel"}`} loading="lazy" /><small>Bronbeeld · pagina {line.sourceVisualPage}</small></div>}<div className="sourceDetailContent">{line.sourceDetails && (() => { const fields = parseSourceDetails(line.sourceDetails); return fields.length > 0 ? <dl className="detailFields">{fields.map(([key,value],index) => <React.Fragment key={key + "-" + index}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl> : <pre>{line.sourceDetails}</pre>; })()}{line.sourceOfferSummary && <div className="offerSummary"><small>CONCEPT OFFERTEOMSCHRIJVING</small><textarea value={line.sourceOfferSummary} onChange={e => patchLine(line.id,{sourceOfferSummary:e.target.value})} /></div>}</div></div>
                </details>}
              </div>
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
