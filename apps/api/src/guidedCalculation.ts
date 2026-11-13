import { createHash } from "node:crypto";

export const guidanceContract = "brebo-guided-calculation-v1";
export const guidancePrefix = "guided:";
export type GuidedAnswer = {
  decision: "pending" | "yes" | "no" | "confirmed";
  quantity: number | null; unit: string; unitPrice: number | null;
  carrier: "equipment" | "subcontracting" | "other";
  vatRegimeId: number | null; explanation: string;
};
export const guidanceQuestions = [
  { id:"crane", group:"Bereikbaarheid", label:"Is een kraan nodig?", kind:"cost", unit:"uur", carrier:"equipment" },
  { id:"hoist", group:"Bereikbaarheid", label:"Is een hoogwerker of bouwlift nodig?", kind:"cost", unit:"dag", carrier:"equipment" },
  { id:"scaffold", group:"Bereikbaarheid", label:"Is een steiger nodig, inclusief opbouw en huurduur?", kind:"cost", unit:"m²", carrier:"subcontracting" },
  { id:"toilet", group:"Bouwplaats", label:"Is een bouwtoilet nodig?", kind:"cost", unit:"week", carrier:"other" },
  { id:"welfare", group:"Bouwplaats", label:"Zijn keet, stroom of water nodig?", kind:"cost", unit:"post", carrier:"other" },
  { id:"protection", group:"Uitvoering", label:"Zijn beschermings- of bewonersvoorzieningen nodig?", kind:"cost", unit:"post", carrier:"other" },
  { id:"waste", group:"Uitvoering", label:"Zijn containers, sloopafvoer of stortkosten nodig?", kind:"cost", unit:"post", carrier:"other" },
  { id:"transport", group:"Uitvoering", label:"Zijn transport, aanvoer en afvoer apart nodig?", kind:"cost", unit:"rit", carrier:"other" },
  { id:"scope", group:"Bronnen en controle", label:"Zijn gebouw, elementen, maten, aantallen en rubrieken gecontroleerd?", kind:"review", unit:"", carrier:"other" },
  { id:"labour", group:"Bronnen en controle", label:"Zijn uurtarieven en arbeidsnormen actueel en gecontroleerd?", kind:"review", unit:"", carrier:"other" },
  { id:"prices", group:"Bronnen en controle", label:"Zijn leveranciersprijzen, eenheden, verpakkingen en geldigheid gecontroleerd?", kind:"review", unit:"", carrier:"other" },
  { id:"risk", group:"Bronnen en controle", label:"Zijn ontbrekende scope, aannames, risico en staartkosten beoordeeld?", kind:"review", unit:"", carrier:"other" }
] as const;
export type GuidedLine = {
  structureKey?: string | null; lineType: string; code?: string | null; description?: string | null;
  quantity?: number | null; unit?: string | null; labourTotalHours?: number | null;
  labourUnitCost?: number; materialUnitCost?: number; equipmentUnitCost?: number;
  subcontractingUnitCost?: number; otherUnitCost?: number; vatRegimeId?: number | null;
  sourceDetails?: string | null; priceSourceType?: string | null; sourceReference?: string | null;
};

export function normalizeGuidedAnswers(raw: unknown): Record<string, GuidedAnswer> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Antwoorden ontbreken.");
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).some(id => !guidanceQuestions.some(q => q.id === id))) throw new Error("Onbekende calculatievraag.");
  return Object.fromEntries(guidanceQuestions.map(q => {
    const item = input[q.id] as Partial<GuidedAnswer> | undefined;
    const answer: GuidedAnswer = {
      decision:item?.decision ?? "pending", quantity:item?.quantity ?? null, unit:item?.unit ?? q.unit,
      unitPrice:item?.unitPrice ?? null, carrier:item?.carrier ?? q.carrier,
      vatRegimeId:item?.vatRegimeId ?? null, explanation:item?.explanation ?? ""
    };
    const choices = q.kind === "cost" ? ["pending","yes","no"] : ["pending","confirmed"];
    if (!choices.includes(answer.decision)) throw new Error(`Ongeldig antwoord: ${q.label}`);
    if (!["equipment","subcontracting","other"].includes(answer.carrier)) throw new Error("Ongeldige kostendrager.");
    if (typeof answer.unit !== "string" || answer.unit.length > 16 || typeof answer.explanation !== "string" || answer.explanation.length > 1500) throw new Error("Ongeldige eenheid of toelichting.");
    for (const value of [answer.quantity, answer.unitPrice]) {
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1e9)) throw new Error("Aantal en prijs moeten positieve getallen zijn.");
    }
    if (answer.vatRegimeId !== null && (!Number.isSafeInteger(answer.vatRegimeId) || answer.vatRegimeId <= 0)) throw new Error("Ongeldige btw-keuze.");
    answer.unit=answer.unit.trim();
    answer.explanation=answer.explanation.trim();
    for(const key of ["quantity","unitPrice"] as const){
      if(answer[key]!==null){
        answer[key]=Number(answer[key]!.toFixed(4));
        if(answer[key]!<=0)throw new Error("Aantal en prijs moeten minimaal 0,0001 zijn.");
      }
    }
    return [q.id, answer];
  }));
}

// IDs change on draft save; fingerprint financial/source content, not database identity.
const decimal=(value:unknown)=>Number(Number(value??0).toFixed(4));

export function guidanceBasis(lines: GuidedLine[]): string {
  const basis = lines.filter(line => ["item","allowance","adjustable","option"].includes(line.lineType) && !line.structureKey?.startsWith(guidancePrefix)).map(line => [
    line.lineType, line.code ?? "", line.description ?? "", line.unit ?? "", decimal(line.quantity),
    line.labourTotalHours == null ? null : decimal(line.labourTotalHours),
    decimal(line.labourUnitCost), decimal(line.materialUnitCost), decimal(line.equipmentUnitCost),
    decimal(line.subcontractingUnitCost), decimal(line.otherUnitCost), line.vatRegimeId ?? null,
    line.priceSourceType ?? "manual", line.sourceReference ?? "", line.sourceDetails ?? null
  ]);
  return createHash("sha256").update(JSON.stringify(basis)).digest("hex");
}

export function buildGuidedProposal(raw: unknown, lines: GuidedLine[], actorId: number, reviewedAt = new Date().toISOString()) {
  const answers = normalizeGuidedAnswers(raw);
  const reasons: string[] = [];
  const costs: GuidedLine[] = [];
  for (const question of guidanceQuestions) {
    const answer = answers[question.id];
    if (answer.decision === "pending") reasons.push(question.label);
    if (answer.decision === "no" && !answer.explanation.trim()) reasons.push(`Motiveer waarom niet nodig/al opgenomen: ${question.label}`);
    if (question.kind === "cost" && answer.decision === "yes") {
      if (!answer.quantity || !answer.unit.trim() || !answer.unitPrice || !answer.vatRegimeId || !answer.explanation.trim()) {
        reasons.push(`Vul aantal, eenheid, prijs, btw en prijsbron/toelichting in: ${question.label}`);
        continue;
      }
      costs.push({
        structureKey:guidancePrefix + question.id, lineType:"item", code:"VRG-" + question.id.toUpperCase(),
        description:question.label.replace(/^Is |^Zijn /, "").replace(/\?$/, ""),
        quantity:answer.quantity, unit:answer.unit.trim(), labourTotalHours:null,
        labourUnitCost:0, materialUnitCost:0, equipmentUnitCost:0, subcontractingUnitCost:0, otherUnitCost:0,
        [answer.carrier + "UnitCost"]:answer.unitPrice, vatRegimeId:answer.vatRegimeId,
        priceSourceType:"manual", sourceReference:"Vraaggestuurde calculatie", sourceDetails:JSON.stringify({contract:guidanceContract,questionId:question.id,explanation:answer.explanation.trim()})
      });
    }
  }
  const note: GuidedLine = {
    structureKey:guidancePrefix + "review", lineType:"note", code:"VRG-CONTROLE", description:"Vraaggestuurde calculatie — " + (reasons.length ? `${reasons.length} open punten` : "gecontroleerd"),
    quantity:0, unit:"", priceSourceType:"manual", sourceReference:"Vraaggestuurde calculatie",
    sourceDetails:JSON.stringify({contract:guidanceContract, answers, actorId, reviewedAt, basis:guidanceBasis(lines)})
  };
  return {contract:guidanceContract, questions:guidanceQuestions, answers, reasons, complete:reasons.length === 0, lines:[note, ...costs]};
}

export function guidedPublicationReasons(lines: GuidedLine[]): string[] {
  const managed = lines.filter(line => line.structureKey?.startsWith(guidancePrefix));
  if (!managed.length) return lines.some(line=>line.priceSourceType==="recipe")
    ? ["Loop de vraaggestuurde controle van het receptvoorstel na voordat de calculatie wordt vastgesteld."] : [];
  const notes = managed.filter(line => line.structureKey === guidancePrefix + "review" && line.lineType === "note");
  if (notes.length !== 1) return ["De vraaggestuurde calculatie mist één geldige controle. Open Vraaggestuurd en verwerk de antwoorden opnieuw."];
  try {
    const metadata = JSON.parse(notes[0].sourceDetails ?? "null");
    if (metadata?.contract !== guidanceContract || !Number.isSafeInteger(metadata.actorId) || !metadata.reviewedAt) throw new Error("Ongeldige vraagcontrole.");
    const proposal = buildGuidedProposal(metadata.answers, lines, metadata.actorId, metadata.reviewedAt);
    const reasons = [...proposal.reasons];
    if (metadata.basis !== guidanceBasis(lines)) reasons.push("Calculatieregels of bronnen zijn gewijzigd sinds de vraagcontrole. Loop de vragen opnieuw na.");
    for (const expected of proposal.lines.slice(1)) {
      const matches = managed.filter(line => line.structureKey === expected.structureKey);
      if (matches.length !== 1 || (["lineType","quantity","unit","vatRegimeId","equipmentUnitCost","subcontractingUnitCost","otherUnitCost","materialUnitCost","labourUnitCost"] as const).some(key => matches[0]?.[key] !== expected[key])) {
        reasons.push(`Kostenregel ontbreekt of wijkt af van het antwoord: ${expected.code}`);
      }
    }
    const expectedKeys = new Set(proposal.lines.map(line => line.structureKey));
    if (managed.some(line => !expectedKeys.has(line.structureKey))) reasons.push("Er staan vervallen of dubbele vraaggestuurde regels in de calculatie.");
    return reasons;
  } catch { return ["De vraagcontrole is ongeldig. Open Vraaggestuurd en verwerk de antwoorden opnieuw."]; }
}

export function guidedLineFromDatabase(row: Record<string, unknown>): GuidedLine {
  return {
    structureKey:row.structure_key as string | null, lineType:String(row.line_type), code:row.code as string | null,
    description:row.description as string | null, quantity:row.quantity == null ? null : Number(row.quantity), unit:row.unit as string | null,
    labourTotalHours:row.labour_total_hours == null ? null : Number(row.labour_total_hours),
    labourUnitCost:Number(row.labour_unit_cost ?? 0), materialUnitCost:Number(row.material_unit_cost ?? 0),
    equipmentUnitCost:Number(row.equipment_unit_cost ?? 0), subcontractingUnitCost:Number(row.subcontracting_unit_cost ?? 0), otherUnitCost:Number(row.other_unit_cost ?? 0),
    vatRegimeId:row.vat_regime_id == null ? null : Number(row.vat_regime_id), priceSourceType:row.price_source_type as string | null,
    sourceReference:row.source_reference as string | null, sourceDetails:row.source_details as string | null
  };
}
