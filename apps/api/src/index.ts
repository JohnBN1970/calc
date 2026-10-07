import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express, { type Request, type Response } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "./db.js";
import { config } from "./config.js";
import { calculateTakeoff } from "./takeoff.js";
import { buildConceptFromOfficeContext } from "./calculationConcept.js";
import { proposalRulesFromCalcRecipes, proposeRecipesForConcept } from "./recipeProposal.js";
import { buildWorkbenchAggregate, calcWorkbenchStructureFromLines } from "./workbenchAggregate.js";
import { calcRecipeSourceRequests, generateCalcOwnedRecipeLines } from "./calcOwnedRecipeGenerator.js";
import { addCalcRecipeLine, createCalcRecipe, listCalcRecipes, updateCalcRecipeApplicability, updateCalcRecipeLine } from "./calcRecipeRepository.js";
import { addCalcSubcalculationScope, createCalcSubcalculation, createScopedCalcSubcalculation, listCalcSubcalculations, setManualLineMembership } from "./calcSubcalculationRepository.js";
import { evaluateCalculationPartitions, evaluateSubcalculations } from "./subcalculationEvaluation.js";
import { generatedScopeTags, manualScopeTags, storeLineScopeTags, type LineScopeTag } from "./lineScopeRepository.js";
import { createTailCostComponent, listTailCostComponents } from "./tailCostRepository.js";
import { evaluateTailCostHierarchy } from "./tailCostEvaluation.js";
import { buildCommercialSummary } from "./commercialSummary.js";
import { fetchCalculationContextSnapshot, fetchOfficeProjectContext, fetchOfficeWorkspaceState, fetchSupplierQuotePositionVisual, fetchSupplierQuotePreview, refreshCalculationDocumentCandidates, searchOfficeArticles, uploadSupplierQuoteToOffice, resolveOfficeCalcSources } from "./officeClient.js";
import { publishCalcResult } from "./officeResultClient.js";
import { verifyOfficeCommercialSummary, verifyOfficePublicationBinding } from "./officeCommercialResultSync.js";
import { createWorkbenchEstablishedSnapshot, fingerprintWorkbenchSnapshot, snapshotDate, snapshotJson } from "./workbenchVersionSnapshot.js";
import { calculateLineCostBreakdown } from "./calculationLineAmount.js";
import { getUserPreference, setUserPreference } from "./userPreferenceRepository.js";
import { createVatRegime, listVatRegimes, updateVatRegime, type VatTreatment } from "./vatSettingsRepository.js";
import { createLabourRate, listLabourRates, updateLabourRate } from "./labourRateRepository.js";
import { aggregateVat, type VatSource } from "./lineVatAggregation.js";
import { effectiveAllocatedVatSources } from "./allocatedVatSources.js";
import { calculatePublicationReadiness } from "./publicationReadiness.js";
import { lineContributesToCalculationTotals } from "./calculationLineTotals.js";
import { calculateLineAmount } from "./calculationLineAmount.js";
import { calculatePublicationFreshness } from "./publicationFreshness.js";
import { deriveSourceContextBinding, sourceContextIsCurrent } from "./sourceContextBinding.js";
import { diffCommercialTotals, diffVersionLines, type VersionDiffLine } from "./versionDiff.js";
import { triageCalculationDocuments } from "./documentTriage.js";
import { assessDocumentRevisions } from "./sourceRevision.js";
import { detectSourceFactConflicts } from "./sourceFactConflict.js";
import { clearDocumentTriageOverride, listDocumentTriageOverrides, setDocumentTriageOverride, type DocumentTriageDecision } from "./documentTriageDecisionRepository.js";
import { findIncompleteLabourLines } from "./workbenchLineValidation.js";
import { listRecipeProposalDecisions, setRecipeProposalDecision, type RecipeProposalDecision } from "./recipeProposalDecisionRepository.js";

type LineType = "chapter" | "paragraph" | "item" | "allowance" | "adjustable" | "option" | "note";
type PriceSourceType = "manual" | "article" | "recipe" | "supplier_quote";
type AllocationInput = { sourceLineId:number; targetLineId:number; method:"quantity"|"value"|"manual"; share:number; amount:number };
type LineInput = {
  id?: number;
  parentId?: number | null;
  structureKey?: string | null;
  sortOrder: number;
  lineType: LineType;
  code?: string;
  description: string;
  unit?: string;
  quantity?: number | null;
  labourNorm?: number | null;
  labourTotalHours?: number | null;
  labourHoursInputMode?: "norm" | "total_hours" | null;
  labourUnitCost?: number;
  materialUnitCost?: number;
  equipmentUnitCost?: number;
  subcontractingUnitCost?: number;
  otherUnitCost?: number;
  vatRegimeId?: number | null;
  priceSourceType?: PriceSourceType;
  officeSourceId?: string | null;
  sourceReference?: string | null;
  sourceSupplier?: string | null;
  sourceUnitPrice?: number | null;
  sourcePriceDate?: string | null;
  sourceDocumentId?: string | null;
  sourceDetails?: string | null;
  sourceVisualPage?: number | null;
  sourcePositionBounds?: { x: number; y: number; width: number; height: number } | null;
  sourceVisualCrop?: { x: number; y: number; width: number; height: number } | null;
  sourceVisualSearchRegion?: { x: number; y: number; width: number; height: number } | null;
  sourceTextRegions?: Array<{ x: number; y: number; width: number; height: number }> | null;
  sourceOfferSummary?: string | null;
  resolutionStatus?: "resolved" | "unresolved";
  resolutionReason?: string | null;
  manualScopes?: Array<{scopeType:LineScopeTag["scopeType"];scopeRef:string}>;
};

type LaunchPayload = {
  v: 1;
  calculation_id: number;
  project_id: number;
  actor_id: number;
  exp: number;
  nonce: string;
};

type SessionPayload = {
  v: 1;
  calculationId: number;
  officeCalculationId: number;
  officeProjectId: number;
  actorId: number;
  exp: number;
};

const SESSION_COOKIE = "brebo_calc_session";
const SESSION_SECONDS = 8 * 60 * 60;

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function secureEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseLaunchToken(token: string): LaunchPayload {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) throw new Error("Invalid launch token.");
  const expected = sign(encoded, config.office.sharedSecret);
  if (!secureEqual(expected, signature)) throw new Error("Invalid launch signature.");
  const payload = JSON.parse(base64UrlDecode(encoded)) as Partial<LaunchPayload>;
  const now = Math.floor(Date.now() / 1000);
  if (
    payload.v !== 1 ||
    !Number.isInteger(payload.calculation_id) ||
    Number(payload.calculation_id) <= 0 ||
    !Number.isInteger(payload.project_id) ||
    Number(payload.project_id) <= 0 ||
    !Number.isInteger(payload.actor_id) ||
    Number(payload.actor_id) <= 0 ||
    !Number.isInteger(payload.exp) ||
    Number(payload.exp) < now ||
    Number(payload.exp) > now + 180 ||
    !/^[0-9a-f]{32}$/i.test(String(payload.nonce ?? ""))
  ) {
    throw new Error("Expired or malformed launch token.");
  }
  return payload as LaunchPayload;
}

function createSessionToken(payload: SessionPayload): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return encoded + "." + sign(encoded, config.sessionSecret);
}

function parseCookies(req: Request): Record<string, string> {
  const raw = req.headers.cookie ?? "";
  const cookies: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function sessionFromRequest(req: Request): SessionPayload | null {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = sign(encoded, config.sessionSecret);
  if (!secureEqual(expected, signature)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as Partial<SessionPayload>;
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.v !== 1 ||
      !Number.isInteger(payload.calculationId) ||
      !Number.isInteger(payload.officeCalculationId) ||
      !Number.isInteger(payload.officeProjectId) ||
      !Number.isInteger(payload.actorId) ||
      Number(payload.actorId) <= 0 ||
      !Number.isInteger(payload.exp) ||
      Number(payload.exp) < now
    ) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

function requireSession(req: Request, res: Response): SessionPayload | null {
  const session = sessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "Open deze calculatie vanuit BREBO Office." });
    return null;
  }
  return session;
}

function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure}`;
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", database: "connected", service: "brebo-calc" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unavailable", service: "brebo-calc" });
  }
});

app.post("/api/takeoff/preview", (req, res) => {
  if (!requireSession(req, res)) return;
  try {
    const widthMm = Number(req.body?.widthMm);
    const heightMm = Number(req.body?.heightMm);
    const quantity = req.body?.quantity == null ? 1 : Number(req.body.quantity);
    res.json(calculateTakeoff({ widthMm, heightMm, quantity }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Ongeldige geometrie." });
  }
});

app.post("/api/launch/consume", async (req, res) => {
  let launch: LaunchPayload;
  try {
    launch = parseLaunchToken(String(req.body?.token ?? ""));
  } catch {
    res.status(401).json({ error: "De Calculatie-link is ongeldig of verlopen." });
    return;
  }

  let officeContext;
  try {
    officeContext = await fetchOfficeProjectContext(launch.project_id);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    console.error("BREBO Calc project context fetch failed:", detail);
    res.status(502).json({ error: "Projectcontext kon niet uit BREBO Office worden opgehaald." });
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    try {
      await connection.execute(
        "INSERT INTO launch_nonces (nonce, expires_at) VALUES (?, FROM_UNIXTIME(?))",
        [launch.nonce, launch.exp]
      );
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
        await connection.rollback();
        res.status(409).json({ error: "Deze Calculatie-link is al gebruikt." });
        return;
      }
      throw error;
    }

    const code = `OFFICE-${launch.calculation_id}`;
    const title = `${officeContext.project.title} — Calculatie`;
    const [calculation] = await connection.execute<ResultSetHeader>(
      `INSERT INTO calculations (office_project_id, office_calculation_id, code, title)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         office_project_id = VALUES(office_project_id),
         title = VALUES(title),
         updated_at = CURRENT_TIMESTAMP(6)`,
      [launch.project_id, launch.calculation_id, code, title]
    );
    const localCalculationId = calculation.insertId;

    await connection.execute(
      `INSERT INTO calculation_versions (calculation_id, version_no)
       SELECT ?, 1
       WHERE NOT EXISTS (
         SELECT 1 FROM calculation_versions WHERE calculation_id = ?
       )`,
      [localCalculationId, localCalculationId]
    );
    await connection.commit();

    const now = Math.floor(Date.now() / 1000);
    const token = createSessionToken({
      v: 1,
      calculationId: localCalculationId,
      officeCalculationId: launch.calculation_id,
      officeProjectId: launch.project_id,
      actorId: launch.actor_id,
      exp: now + SESSION_SECONDS
    });
    res.setHeader("Set-Cookie", sessionCookie(token));
    res.json({
      status: "ok",
      calculationId: localCalculationId,
      officeCalculationId: launch.calculation_id,
      project: officeContext.project
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.post("/api/quotes/upload", express.raw({ type: ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"], limit: "20mb" }), async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const lineRef = String(req.headers["x-brebo-line-ref"] ?? "").trim();
  const filename = String(req.headers["x-brebo-filename"] ?? "offerte").trim();
  const lineDescription = String(req.headers["x-brebo-line-description"] ?? "").trim();
  const lineQuantityRaw = String(req.headers["x-brebo-line-quantity"] ?? "").trim();
  const lineUnit = String(req.headers["x-brebo-line-unit"] ?? "").trim();
  const mimeType = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (!lineRef || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    res.status(400).json({ error: "Selecteer een calculatieregel en offertebestand." });
    return;
  }
  try {
    const result = await uploadSupplierQuoteToOffice({
      calculationId: session.officeCalculationId,
      lineRef,
      filename,
      mimeType,
      bytes: req.body,
      lineDescription,
      lineQuantity: lineQuantityRaw !== "" && Number.isFinite(Number(lineQuantityRaw)) ? Number(lineQuantityRaw) : undefined,
      lineUnit
    });
    res.setHeader("Cache-Control", "no-store, private");
    res.status(201).json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    console.error("BREBO Calc supplier quote upload failed:", detail);
    res.status(502).json({ error: `Offerte kon niet door BREBO Office worden verwerkt: ${detail}` });
  }
});

app.get("/api/quotes/:fileId/preview", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const fileId = Number(req.params.fileId);
  if (!Number.isInteger(fileId) || fileId <= 0) {
    res.status(400).json({ error: "Ongeldige offertebron." });
    return;
  }
  try {
    const preview = await fetchSupplierQuotePreview({
      calculationId: session.officeCalculationId,
      fileId
    });
    res.setHeader("Content-Type", preview.contentType);
    if (preview.contentDisposition) res.setHeader("Content-Disposition", preview.contentDisposition);
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(preview.bytes));
  } catch {
    res.status(502).json({ error: "Offertevoorbeeld kon niet uit BREBO Office worden opgehaald." });
  }
});

app.get("/api/quotes/:fileId/visual/:page", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const fileId = Number(req.params.fileId);
  const page = Number(req.params.page);
  if (!Number.isInteger(fileId) || fileId <= 0 || !Number.isInteger(page) || page <= 0) {
    res.status(400).json({ error: "Ongeldige offerteafbeelding." });
    return;
  }
  try {
    const visual = await fetchSupplierQuotePositionVisual({ calculationId: session.officeCalculationId, fileId, page });
    res.setHeader("Content-Type", visual.contentType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(visual.bytes));
  } catch {
    res.status(502).json({ error: "Offerteafbeelding kon niet uit BREBO Office worden opgehaald." });
  }
});

app.post("/api/workbench/current/document-candidates/refresh", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const proposal = await refreshCalculationDocumentCandidates({
      calculationId: session.officeCalculationId,
      projectId: session.officeProjectId
    });
    res.setHeader("Cache-Control", "no-store, private");
    res.status(201).json(proposal);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    console.error("BREBO Calc document candidate refresh failed:", detail);
    res.status(502).json({ error: `Kandidaatbronnen konden niet uit BREBO Office worden ververst: ${detail}` });
  }
});

app.get("/api/workbench/current/calculation-context", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const snapshot = await fetchCalculationContextSnapshot(session.officeCalculationId);
    if (snapshot.context.project_id !== null && snapshot.context.project_id !== session.officeProjectId) {
      res.status(409).json({ error: "Office calculation context hoort bij een ander project." });
      return;
    }
    res.setHeader("Cache-Control", "no-store, private");
    res.json(snapshot);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    console.error("BREBO Calc calculation context fetch failed:", detail);
    res.status(502).json({ error: `Calculatiecontext kon niet uit BREBO Office worden opgehaald: ${detail}` });
  }
});

app.put("/api/workbench/current/document-triage/:documentId", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  const documentId=Number(req.params.documentId);
  const decision=String(req.body?.decision??"") as DocumentTriageDecision;
  const reason=req.body?.reason==null||String(req.body.reason).trim()===""?null:String(req.body.reason).trim().slice(0,500);
  if(!Number.isInteger(documentId)||documentId<=0||!["primary","supporting","review","excluded"].includes(decision)){
    res.status(400).json({error:"Ongeldig documenttriage-besluit."});
    return;
  }
  try{
    const snapshot=await fetchCalculationContextSnapshot(session.officeCalculationId);
    if(!snapshot.context.documents.some(document=>Number(document.document_id)===documentId)){
      res.status(404).json({error:"Document staat niet in de actuele calculatiecontext."});
      return;
    }
    await setDocumentTriageOverride({
      calculationId:session.calculationId,
      officeDocumentId:documentId,
      decision,
      reason,
      decidedBy:session.actorId
    });
    const overrides=await listDocumentTriageOverrides(session.calculationId);
    const item=triageCalculationDocuments(snapshot,overrides).find(row=>row.documentId===documentId);
    res.json({item});
  }catch(error){
    res.status(500).json({error:error instanceof Error?error.message:"Documenttriage kon niet worden opgeslagen."});
  }
});

app.delete("/api/workbench/current/document-triage/:documentId", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  const documentId=Number(req.params.documentId);
  if(!Number.isInteger(documentId)||documentId<=0){res.status(400).json({error:"Ongeldig document."});return;}
  try{
    await clearDocumentTriageOverride(session.calculationId,documentId);
    const snapshot=await fetchCalculationContextSnapshot(session.officeCalculationId);
    const item=triageCalculationDocuments(snapshot).find(row=>row.documentId===documentId);
    res.json({item});
  }catch(error){
    res.status(500).json({error:error instanceof Error?error.message:"Documenttriage kon niet worden hersteld."});
  }
});

app.get("/api/workbench/current/source-revisions", async (req,res)=>{
  const session=requireSession(req,res); if(!session)return;
  try{
    const snapshot=await fetchCalculationContextSnapshot(session.officeCalculationId);
    const revisions=assessDocumentRevisions(snapshot);
    res.setHeader("Cache-Control","no-store, private");
    res.json({
      contract:"brebo-calc-source-revisions-v1",
      calculationId:session.calculationId,
      sourceDocumentSetId:snapshot.context.document_set?.id??null,
      revisions
    });
  }catch(error){
    res.status(502).json({error:error instanceof Error?error.message:"Bronrevisies konden niet worden beoordeeld."});
  }
});

app.get("/api/workbench/current/concept", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const snapshot = await fetchCalculationContextSnapshot(session.officeCalculationId);
    if (snapshot.context.project_id !== null && snapshot.context.project_id !== session.officeProjectId) {
      res.status(409).json({ error: "Office calculation context hoort bij een ander project." });
      return;
    }
    const overrides=await listDocumentTriageOverrides(session.calculationId);
    const concept = buildConceptFromOfficeContext(snapshot,triageCalculationDocuments(snapshot,overrides));
    const sourceConflicts=detectSourceFactConflicts(snapshot);
    res.setHeader("Cache-Control", "no-store, private");
    res.json({...concept,sourceConflicts,automationBlocked:concept.sourceDecisions.some(decision=>decision.status==="conflict")});
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende conceptfout";
    console.error("BREBO Calc concept build failed:", detail);
    res.status(502).json({ error: `Conceptcalculatie kon niet uit de Office-context worden opgebouwd: ${detail}` });
  }
});


app.get("/api/workbench/current/recipe-catalog", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const recipes = await listCalcRecipes();
    res.setHeader("Cache-Control", "no-store, private");
    res.json({ contract: "brebo-calc-recipe-catalog-v1", recipes });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Calc-fout";
    res.status(500).json({ error: `Calc-receptcatalogus kon niet worden geladen: ${detail}` });
  }
});

app.get("/api/workbench/current/concept/recipe-proposals", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const [snapshot, recipes, officeState] = await Promise.all([
      fetchCalculationContextSnapshot(session.officeCalculationId),
      listCalcRecipes(),
      fetchOfficeWorkspaceState(session.officeCalculationId)
    ]);
    if (snapshot.context.project_id !== null && snapshot.context.project_id !== session.officeProjectId) {
      res.status(409).json({ error: "Office calculation context hoort bij een ander project." });
      return;
    }
    const overrides=await listDocumentTriageOverrides(session.calculationId);
    const concept = buildConceptFromOfficeContext(snapshot,triageCalculationDocuments(snapshot,overrides));
    const proposals = proposeRecipesForConcept(concept, proposalRulesFromCalcRecipes(recipes));
    res.setHeader("Cache-Control", "no-store, private");
    res.json({
      contract: "brebo-calc-recipe-proposals-v2",
      sourceDocumentSetId: concept.sourceDocumentSetId,
      proposalCount: proposals.length,
      proposals
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende receptvoorstelfout";
    res.status(422).json({ error: detail });
  }
});

app.put("/api/workbench/current/concept/recipe-proposals/:positionRef/:recipeVersionId/decision", async (req,res)=>{
  const session=requireSession(req,res); if(!session)return;
  const positionRef=decodeURIComponent(String(req.params.positionRef??"")).trim();
  const recipeVersionId=Number(req.params.recipeVersionId);
  const decision=String(req.body?.decision??"") as RecipeProposalDecision;
  const reason=String(req.body?.reason??"").trim().slice(0,1000)||null;
  if(!positionRef||!Number.isInteger(recipeVersionId)||recipeVersionId<=0||!["accepted","rejected","reset"].includes(decision)){
    res.status(400).json({error:"Ongeldige reviewbeslissing."});return;
  }
  try{
    const [snapshot,recipes]=await Promise.all([
      fetchCalculationContextSnapshot(session.officeCalculationId),listCalcRecipes()
    ]);
    const overrides=await listDocumentTriageOverrides(session.calculationId);
    const concept=buildConceptFromOfficeContext(snapshot,triageCalculationDocuments(snapshot,overrides));
    const proposals=proposeRecipesForConcept(concept,proposalRulesFromCalcRecipes(recipes));
    if(!proposals.some(item=>item.positionRef===positionRef&&Number(item.recipeRef)===recipeVersionId)){
      res.status(409).json({error:"Dit receptvoorstel is niet meer actueel voor deze positie."});return;
    }
    await setRecipeProposalDecision({
      calculationId:session.calculationId,positionRef,recipeVersionId,decision,reason,
      sourceSelectionVersion:concept.sourceSelectionVersion,decidedBy:session.actorId
    });
    const decisions=await listRecipeProposalDecisions(session.calculationId);
    res.json({contract:"brebo-calc-recipe-proposal-decision-v1",decision:decisions.find(item=>item.positionRef===positionRef&&item.recipeVersionId===recipeVersionId)});
  }catch(error){
    res.status(422).json({error:error instanceof Error?error.message:"Reviewbeslissing kon niet worden opgeslagen."});
  }
});

app.post("/api/workbench/current/concept/recipe-proposals/accept", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const positionRef = String(req.body?.positionRef ?? "").trim();
  const recipeVersionId = Number(req.body?.recipeVersionId);
  const requestedTakeoffId = req.body?.takeoffId == null ? null : Number(req.body.takeoffId);

  if (!positionRef || !Number.isInteger(recipeVersionId) || recipeVersionId <= 0 || (requestedTakeoffId !== null && (!Number.isInteger(requestedTakeoffId) || requestedTakeoffId <= 0))) {
    res.status(400).json({ error: "Ongeldige receptacceptatie." });
    return;
  }

  try {
    const [snapshot, recipes, officeState] = await Promise.all([
      fetchCalculationContextSnapshot(session.officeCalculationId),
      listCalcRecipes(),
      fetchOfficeWorkspaceState(session.officeCalculationId)
    ]);

    if (snapshot.context.project_id !== null && snapshot.context.project_id !== session.officeProjectId) {
      res.status(409).json({ error: "Office calculation context hoort bij een ander project." });
      return;
    }

    const matchingTakeoffs = snapshot.context.takeoff.filter(row => row.position_ref.trim() === positionRef);
    if (matchingTakeoffs.length === 0) {
      res.status(409).json({ error: "Geen geometrische take-off gevonden voor deze positie." });
      return;
    }

    let takeoff;
    if (requestedTakeoffId !== null) {
      takeoff = matchingTakeoffs.find(row => row.id === requestedTakeoffId);
      if (!takeoff) {
        res.status(409).json({ error: "De gekozen take-off hoort niet bij deze positie." });
        return;
      }
    } else {
      if (matchingTakeoffs.length > 1) {
        res.status(409).json({
          error: "Meerdere geometrische take-offs gevonden voor deze positie. Handmatige selectie/review is vereist.",
          positionRef,
          takeoffIds: matchingTakeoffs.map(row => row.id)
        });
        return;
      }
      [takeoff] = matchingTakeoffs;
    }

    const recipe = recipes.find(item => item.id === recipeVersionId);
    if (!recipe) {
      res.status(409).json({ error: "Calc-receptversie bestaat niet." });
      return;
    }

    const overrides=await listDocumentTriageOverrides(session.calculationId);
    const concept = buildConceptFromOfficeContext(snapshot,triageCalculationDocuments(snapshot,overrides));
    const proposals = proposeRecipesForConcept(concept, proposalRulesFromCalcRecipes(recipes));
    if (!proposals.some(item => item.positionRef === positionRef && Number(item.recipeRef) === recipeVersionId)) {
      res.status(409).json({ error: "Dit Calc-recept is niet toepasbaar op deze positie." });
      return;
    }

    const sourceRequests = calcRecipeSourceRequests(recipe);
    const resolution = sourceRequests.length
      ? await resolveOfficeCalcSources({ projectId: session.officeProjectId, sources: sourceRequests })
      : { contract: "brebo-office-calc-source-resolution-v1" as const, project_id: session.officeProjectId, results: [] };

    const conceptPosition=concept.positions.find(item=>item.positionRef===positionRef)??null;
    const generated = generateCalcOwnedRecipeLines({
      recipe,
      takeoff,
      resolution,
      evidence:conceptPosition?{
        documentIds:conceptPosition.sourceDocumentIds,
        pages:conceptPosition.sourcePages,
        components:conceptPosition.sourceComponents.map(component=>({
          componentRef:component.component_ref,
          componentKind:component.component_kind,
          componentType:component.component_type,
          documentId:component.document_id,
          sourcePage:component.source_page,
          sourceFragment:component.source_fragment
        }))
      }:undefined,
      scopes:conceptPosition?.scopes,
      components:conceptPosition?.sourceComponents,
      contextBinding:{
        officeVersion:String(officeState.version.version),
        selectionVersion:snapshot.context.document_set?.selection_version??null
      }
    });
    const unresolved = generated.filter(line => line.resolutionStatus === "unresolved");

    await setRecipeProposalDecision({
      calculationId:session.calculationId,
      positionRef,
      recipeVersionId,
      decision:"accepted",
      reason:"Receptvoorstel geaccepteerd en gegenereerd.",
      sourceSelectionVersion:concept.sourceSelectionVersion,
      decidedBy:session.actorId
    });

    res.setHeader("Cache-Control", "no-store, private");
    res.status(201).json({
      contract: "brebo-calc-generated-recipe-lines-v2",
      positionRef,
      takeoffId: takeoff.id,
      recipeVersionId,
      recipeName: recipe.name,
      readiness: unresolved.length ? "incomplete" : "ready",
      unresolvedCount: unresolved.length,
      lines: generated
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende receptgeneratiefout";
    res.status(422).json({ error: detail });
  }
});

app.get("/api/articles/search", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const result = await searchOfficeArticles({
      q: String(req.query.q ?? "").trim(),
      supplier: String(req.query.supplier ?? "").trim(),
      category: String(req.query.category ?? "").trim(),
      limit: Number(req.query.limit ?? 40)
    });
    res.setHeader("Cache-Control", "no-store, private");
    res.json(result);
  } catch {
    res.status(502).json({ error: "Artikeldata kon niet uit BREBO Office worden opgehaald." });
  }
});

app.post("/api/session/logout", (req, res) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
  res.status(204).end();
});

async function currentCalcVersionState(calculationId:number):Promise<{id:number;status:string}> {
  const [versions]=await db.execute<RowDataPacket[]>(
    "SELECT id,status FROM calculation_versions WHERE calculation_id=? ORDER BY version_no DESC LIMIT 1",
    [calculationId]
  );
  if(!versions[0]) throw new Error("Calculatie heeft geen versie.");
  return{id:Number(versions[0].id),status:String(versions[0].status)};
}

async function currentCalcVersionId(calculationId:number):Promise<number> {
  return (await currentCalcVersionState(calculationId)).id;
}

async function currentCalcDraftVersionId(calculationId:number):Promise<number> {
  const version=await currentCalcVersionState(calculationId);
  if(version.status!=="draft")throw new Error("Deze calculatieversie is vastgesteld en kan niet meer worden gewijzigd. Start eerst een nieuwe versie.");
  return version.id;
}

app.get("/api/workbench/current/version-diff", async (req,res)=>{
  const session=requireSession(req,res); if(!session)return;
  try{
    const [versions]=await db.execute<RowDataPacket[]>(
      `SELECT id,version_no,status,direct_cost,markup_amount,sales_price
         FROM calculation_versions
        WHERE calculation_id=?
        ORDER BY version_no DESC`,
      [session.calculationId]
    );
    const current=versions[0];
    if(!current){
      res.status(404).json({error:"Calculatieversie niet gevonden."});
      return;
    }
    const baseline=versions.find(row=>Number(row.version_no)<Number(current.version_no)&&String(row.status)==="established")??null;
    if(!baseline){
      res.setHeader("Cache-Control","no-store, private");
      res.json({
        contract:"brebo-calc-version-diff-v1",
        currentVersionNo:Number(current.version_no),
        baselineVersionNo:null,
        changes:[],
        counts:{added:0,removed:0,changed:0},
        commercialDelta:null
      });
      return;
    }

    const [[snapshotRows],[lineRows]]=await Promise.all([
      db.execute<RowDataPacket[]>(
        "SELECT snapshot_json FROM calculation_version_snapshots WHERE version_id=? LIMIT 1",
        [baseline.id]
      ),
      db.execute<RowDataPacket[]>(
        `SELECT structure_key,line_type,code,description,unit,quantity,labour_norm,labour_total_hours,
                labour_hours_input_mode,labour_unit_cost,material_unit_cost,equipment_unit_cost,
                subcontracting_unit_cost,other_unit_cost,vat_regime_id,price_source_type,source_reference
           FROM calculation_lines
          WHERE version_id=?
          ORDER BY sort_order,id`,
        [current.id]
      )
    ]);
    const stored=snapshotRows[0];
    if(!stored)throw new Error("Vorige vastgestelde versie heeft geen snapshot.");
    const snapshot=typeof stored.snapshot_json==="string"?JSON.parse(stored.snapshot_json):stored.snapshot_json;
    if(!snapshot||!Array.isArray(snapshot.lines))throw new Error("Vorige snapshot is ongeldig.");

    const before:VersionDiffLine[]=snapshot.lines.map((line:any)=>({
      structureKey:String(line.structureKey),
      lineType:String(line.lineType),
      code:line.code==null?null:String(line.code),
      description:String(line.description??""),
      unit:line.unit==null?null:String(line.unit),
      quantity:line.quantity==null?null:Number(line.quantity),
      labourNorm:line.labourNorm==null?null:Number(line.labourNorm),
      labourTotalHours:line.labourTotalHours==null?null:Number(line.labourTotalHours),
      labourHoursInputMode:line.labourHoursInputMode==null?null:String(line.labourHoursInputMode),
      labourUnitCost:Number(line.labourUnitCost??0),
      materialUnitCost:Number(line.materialUnitCost??0),
      equipmentUnitCost:Number(line.equipmentUnitCost??0),
      subcontractingUnitCost:Number(line.subcontractingUnitCost??0),
      otherUnitCost:Number(line.otherUnitCost??0),
      vatRegimeId:line.vatRegimeId==null?null:Number(line.vatRegimeId),
      priceSourceType:String(line.priceSourceType??"manual"),
      sourceReference:line.sourceReference==null?null:String(line.sourceReference)
    }));
    const after:VersionDiffLine[]=lineRows.map(row=>({
      structureKey:String(row.structure_key),
      lineType:String(row.line_type),
      code:row.code==null?null:String(row.code),
      description:String(row.description??""),
      unit:row.unit==null?null:String(row.unit),
      quantity:row.quantity==null?null:Number(row.quantity),
      labourNorm:row.labour_norm==null?null:Number(row.labour_norm),
      labourTotalHours:row.labour_total_hours==null?null:Number(row.labour_total_hours),
      labourHoursInputMode:row.labour_hours_input_mode==null?null:String(row.labour_hours_input_mode),
      labourUnitCost:Number(row.labour_unit_cost??0),
      materialUnitCost:Number(row.material_unit_cost??0),
      equipmentUnitCost:Number(row.equipment_unit_cost??0),
      subcontractingUnitCost:Number(row.subcontracting_unit_cost??0),
      otherUnitCost:Number(row.other_unit_cost??0),
      vatRegimeId:row.vat_regime_id==null?null:Number(row.vat_regime_id),
      priceSourceType:String(row.price_source_type??"manual"),
      sourceReference:row.source_reference==null?null:String(row.source_reference)
    }));
    const changes=diffVersionLines({before,after});
    const counts={
      added:changes.filter(item=>item.kind==="added").length,
      removed:changes.filter(item=>item.kind==="removed").length,
      changed:changes.filter(item=>item.kind==="changed").length
    };
    const beforeCommercial={
      directCost:Number(snapshot.commercial?.directCost??baseline.direct_cost??0),
      markupAmount:Number(snapshot.commercial?.markupAmount??baseline.markup_amount??0),
      salesPrice:Number(snapshot.commercial?.salesPrice??baseline.sales_price??0)
    };
    const afterCommercial={
      directCost:Number(current.direct_cost??0),
      markupAmount:Number(current.markup_amount??0),
      salesPrice:Number(current.sales_price??0)
    };
    res.setHeader("Cache-Control","no-store, private");
    res.json({
      contract:"brebo-calc-version-diff-v1",
      currentVersionNo:Number(current.version_no),
      baselineVersionNo:Number(baseline.version_no),
      changes,
      counts,
      commercialDelta:diffCommercialTotals({before:beforeCommercial,after:afterCommercial})
    });
  }catch(error){
    res.status(422).json({error:error instanceof Error?error.message:"Versieverschil kon niet worden bepaald."});
  }
});

app.get("/api/workbench/current/versions", async (req,res)=>{
  const session=requireSession(req,res); if(!session)return;
  try{
    const [rows]=await db.execute<RowDataPacket[]>(
      `SELECT v.id,v.version_no,v.status,v.direct_cost,v.markup_amount,v.sales_price,
              v.content_hash,v.established_at,v.created_at,s.snapshot_contract,s.snapshot_json
         FROM calculation_versions v
         LEFT JOIN calculation_version_snapshots s ON s.version_id=v.id
        WHERE v.calculation_id=?
        ORDER BY v.version_no DESC`,
      [session.calculationId]
    );
    res.setHeader("Cache-Control","no-store, private");
    res.json({
      contract:"brebo-calc-version-history-v1",
      versions:rows.map(row=>{
        let commercialSummary:null|Record<string,unknown>=null;
        let directCostMix:null|Record<string,unknown>=null;
        if(row.snapshot_json!=null){
          try{
            const snapshot=typeof row.snapshot_json==="string"?JSON.parse(row.snapshot_json):row.snapshot_json;
            const summary=snapshot?.commercial?.summary;
            const mix=snapshot?.commercial?.directCostMix;
            if(summary&&typeof summary==="object")commercialSummary=summary as Record<string,unknown>;
            if(mix&&typeof mix==="object")directCostMix=mix as Record<string,unknown>;
          }catch{}
        }
        return{
          id:Number(row.id),
          versionNo:Number(row.version_no),
          status:String(row.status),
          directCost:Number(row.direct_cost??0),
          markupAmount:Number(row.markup_amount??0),
          salesPrice:Number(row.sales_price??0),
          contentHash:row.content_hash==null?null:String(row.content_hash),
          establishedAt:row.established_at instanceof Date?row.established_at.toISOString():row.established_at==null?null:String(row.established_at),
          createdAt:row.created_at instanceof Date?row.created_at.toISOString():String(row.created_at),
          snapshotContract:row.snapshot_contract==null?null:String(row.snapshot_contract),
          directCostMix:directCostMix?{
            labour:Number(directCostMix.labour??0),
            material:Number(directCostMix.material??0),
            equipment:Number(directCostMix.equipment??0),
            subcontracting:Number(directCostMix.subcontracting??0),
            other:Number(directCostMix.other??0)
          }:null,
          commercialSummary:commercialSummary?{
            purchase:Number(commercialSummary.purchase??0),
            sales:Number(commercialSummary.sales??0),
            margin:Number(commercialSummary.margin??0),
            marginPct:Number(commercialSummary.marginPct??0),
            vat:Number(commercialSummary.vat??0),
            vatRate:commercialSummary.vatRate==null?null:Number(commercialSummary.vatRate),
            vatBreakdown:Array.isArray(commercialSummary.vatBreakdown)?commercialSummary.vatBreakdown:[]
          }:null
        };
      })
    });
  }catch(error){
    res.status(500).json({error:error instanceof Error?error.message:"Versiehistorie kon niet worden geladen."});
  }
});

app.get("/api/workbench/current/publication-freshness", async (req,res)=>{
  const session=requireSession(req,res); if(!session)return;
  try{
    const [rows,officeState]=await Promise.all([
      db.execute<RowDataPacket[]>(
        `SELECT id,version_no,status
           FROM calculation_versions
          WHERE calculation_id=?
          ORDER BY version_no DESC`,
        [session.calculationId]
      ),
      fetchOfficeWorkspaceState(session.officeCalculationId)
    ]);
    const versions=rows[0];
    const latest=versions[0];
    if(!latest){
      res.status(404).json({error:"Calculatieversie niet gevonden."});
      return;
    }
    const established=versions.find(row=>String(row.status)==="established")??null;
    const freshness=calculatePublicationFreshness({
      latest:{id:Number(latest.id),versionNo:Number(latest.version_no),status:String(latest.status)},
      latestEstablished:established?{id:Number(established.id),versionNo:Number(established.version_no)}:null,
      officeResult:officeState.calc_result?{
        calcVersion:String(officeState.calc_result.calc_version),
        officeVersion:String(officeState.calc_result.office_version),
        currentForOfficeVersion:officeState.calc_result.current_for_office_version
      }:null
    });
    res.setHeader("Cache-Control","no-store, private");
    res.json({contract:"brebo-calc-publication-freshness-v1",...freshness});
  }catch(error){
    res.status(502).json({error:error instanceof Error?error.message:"Publicatiestatus kon niet worden bepaald."});
  }
});

app.get("/api/workbench/current/publication-readiness", async (req,res)=>{
  const session=requireSession(req,res); if(!session)return;
  try{
    const [versions]=await db.execute<RowDataPacket[]>(
      `SELECT id,status,direct_cost,markup_amount,sales_price,
              source_office_version,source_selection_version
         FROM calculation_versions
        WHERE calculation_id=?
        ORDER BY version_no DESC
        LIMIT 1`,
      [session.calculationId]
    );
    const version=versions[0];
    if(!version){
      res.status(404).json({error:"Calculatieversie niet gevonden."});
      return;
    }
    const [lineRows]=await db.execute<RowDataPacket[]>(
      `SELECT id,line_type,quantity,labour_total_hours,labour_unit_cost,material_unit_cost,
              equipment_unit_cost,subcontracting_unit_cost,other_unit_cost,vat_regime_id,
              price_source_type,source_details
         FROM calculation_lines
        WHERE version_id=?`,
      [version.id]
    );
    const costRows=lineRows.filter(row=>lineContributesToCalculationTotals(String(row.line_type)));
    const incompleteLabourRows=findIncompleteLabourLines(costRows.map(row=>({
      lineType:String(row.line_type),
      labourUnitCost:Number(row.labour_unit_cost??0),
      labourTotalHours:row.labour_total_hours==null?null:Number(row.labour_total_hours),
      code:row.code==null?null:String(row.code),
      description:row.description==null?null:String(row.description)
    })));
    const [vatAllocationRows]=await db.execute<RowDataPacket[]>(
      `SELECT source_line_id,target_line_id,amount
         FROM calculation_line_allocations
        WHERE version_id=?
        ORDER BY id`,
      [version.id]
    );
    const lineSales:VatSource[]=effectiveAllocatedVatSources({
      lines:costRows.map(row=>({
        id:Number(row.id),
        lineType:String(row.line_type),
        quantity:row.quantity==null?null:Number(row.quantity),
        labourTotalHours:row.labour_total_hours==null?null:Number(row.labour_total_hours),
        labourUnitCost:Number(row.labour_unit_cost??0),
        materialUnitCost:Number(row.material_unit_cost??0),
        equipmentUnitCost:Number(row.equipment_unit_cost??0),
        subcontractingUnitCost:Number(row.subcontracting_unit_cost??0),
        otherUnitCost:Number(row.other_unit_cost??0),
        vatRegimeId:row.vat_regime_id==null?null:Number(row.vat_regime_id)
      })),
      allocations:vatAllocationRows.map(row=>({
        sourceLineId:Number(row.source_line_id),
        targetLineId:Number(row.target_line_id),
        amount:Number(row.amount??0)
      }))
    });
    const directCost=lineSales.reduce((sum,row)=>sum+row.salesAmount,0);
    const [components,partitions,vatRegimes]=await Promise.all([
      listTailCostComponents(Number(version.id)),
      evaluateCalculationPartitions(Number(version.id)),
      listVatRegimes(true)
    ]);
    const hierarchy=evaluateTailCostHierarchy({
      totalDirectCost:directCost,
      mainDirectCost:partitions.mainDirectCost,
      subcalculations:partitions.subcalculations,
      components
    });
    const vatBreakdown=aggregateVat({
      regimes:vatRegimes,
      lineSales,
      tailCosts:[
        ...hierarchy.calculationTailCosts,
        ...hierarchy.subcalculations.flatMap(row=>row.tailCosts)
      ]
    });
    const vatTaxableBase=vatBreakdown.reduce((sum,item)=>sum+item.taxableBase,0);
    const readiness=calculatePublicationReadiness({
      versionStatus:String(version.status),
      costLineCount:costRows.length,
      directCost,
      storedDirectCost:Number(version.direct_cost??0),
      markupAmount:hierarchy.tailCost,
      storedMarkupAmount:Number(version.markup_amount??0),
      salesPrice:hierarchy.salesPrice,
      storedSalesPrice:Number(version.sales_price??0),
      vatTaxableBase
    });
    const sourceReasons:string[]=[];
    if(incompleteLabourRows.length){
      sourceReasons.push(`${incompleteLabourRows.length} arbeidsregel(s) hebben een uurprijs maar geen norm/totaaluren.`);
    }
    const derivedContext=deriveSourceContextBinding(lineRows.map(row=>({
      priceSourceType:String(row.price_source_type??"manual"),
      sourceDetails:row.source_details==null?null:String(row.source_details)
    })));
    if(derivedContext.status==="mixed")sourceReasons.push("Receptregels gebruiken verschillende Office-broncontexten.");
    if(derivedContext.status==="unbound")sourceReasons.push("Receptregels missen een aantoonbare Office-broncontext; bouw het concept opnieuw op.");
    if(derivedContext.status==="bound"){
      const [currentOffice,currentContext]=await Promise.all([
        fetchOfficeWorkspaceState(session.officeCalculationId),
        fetchCalculationContextSnapshot(session.officeCalculationId)
      ]);
      const storedBinding={
        officeVersion:version.source_office_version==null?"":String(version.source_office_version),
        selectionVersion:version.source_selection_version==null?null:String(version.source_selection_version)
      };
      if(storedBinding.officeVersion!==derivedContext.binding!.officeVersion||
         storedBinding.selectionVersion!==derivedContext.binding!.selectionVersion){
        sourceReasons.push("De opgeslagen broncontextbinding wijkt af van de receptregels; sla de calculatie opnieuw op.");
      }else if(!sourceContextIsCurrent({
        binding:derivedContext.binding,
        officeVersion:String(currentOffice.version.version),
        selectionVersion:currentContext.context.document_set?.selection_version??null
      })){
        sourceReasons.push("Office-brondata of documentselectie is gewijzigd; bouw het Calc-concept opnieuw op vóór publicatie.");
      }
    }
    res.setHeader("Cache-Control","no-store, private");
    res.json({
      contract:"brebo-calc-publication-readiness-v1",
      ...readiness,
      canPublish:readiness.canPublish&&sourceReasons.length===0,
      reasons:[...readiness.reasons,...sourceReasons],
      totals:{directCost,markupAmount:hierarchy.tailCost,salesPrice:hierarchy.salesPrice,vatTaxableBase}
    });
  }catch(error){
    res.status(422).json({error:error instanceof Error?error.message:"Publicatiegereedheid kon niet worden bepaald."});
  }
});

app.get("/api/workbench/current/tail-costs", async (req,res)=>{
  const session=requireSession(req,res); if(!session)return;
  try{
    const versionId=await currentCalcVersionId(session.calculationId);
    const components=await listTailCostComponents(versionId);
    res.setHeader("Cache-Control","no-store, private");
    res.json({contract:"brebo-calc-tail-costs-v1",versionId,components});
  }catch(error){res.status(500).json({error:error instanceof Error?error.message:"Staartkosten konden niet worden geladen."});}
});

app.post("/api/workbench/current/tail-costs", async (req,res)=>{
  const session=requireSession(req,res); if(!session)return;
  try{
    const versionId=await currentCalcDraftVersionId(session.calculationId);
    const ownerType=String(req.body?.ownerType??"calculation");
    const ownerRef=req.body?.ownerRef==null?null:String(req.body.ownerRef).trim();
    if(ownerType==="subcalculation"){
      const subcalculations=await listCalcSubcalculations(versionId);
      if(!ownerRef || !subcalculations.some(item=>item.ref===ownerRef)){
        res.status(400).json({error:"Kies een geldige deelcalculatie als eigenaar van deze staartkosten."});
        return;
      }
    }
    const id=await createTailCostComponent({
      versionId,
      ownerType:ownerType as any,
      ownerRef,
      componentKey:String(req.body?.componentKey??""),
      description:String(req.body?.description??""),
      basis:String(req.body?.basis??"percentage") as any,
      value:Number(req.body?.value??0),
      baseScope:String(req.body?.baseScope??"owner_direct_cost") as any,
      baseRef:req.body?.baseRef==null?null:String(req.body.baseRef),
      quantity:req.body?.quantity==null?null:Number(req.body.quantity),
      vatRegimeId:req.body?.vatRegimeId==null?null:Number(req.body.vatRegimeId),
      sortOrder:Number(req.body?.sortOrder??0)
    });
    res.status(201).json({tailCostComponentId:id});
  }catch(error){res.status(400).json({error:error instanceof Error?error.message:"Staartkostencomponent kon niet worden aangemaakt."});}
});

app.post("/api/workbench/current/tail-costs/evaluate", async (req,res)=>{
  const session=requireSession(req,res); if(!session)return;
  try{
    const versionId=await currentCalcVersionId(session.calculationId);
    const components=await listTailCostComponents(versionId);
    const partitions=await evaluateCalculationPartitions(versionId);
    const requestedDirect=Number(req.body?.directCost??partitions.totalDirectCost);
    if(!Number.isFinite(requestedDirect)||requestedDirect<0)throw new Error("Ongeldige directe kost.");

    // For unsaved UI edits we may know a newer total direct cost, but ownership
    // remains based on the last saved line memberships until the next save.
    const delta=requestedDirect-partitions.totalDirectCost;
    const adjustedMainDirect=Math.max(0,partitions.mainDirectCost+delta);
    const hierarchy=evaluateTailCostHierarchy({
      totalDirectCost:requestedDirect,
      mainDirectCost:adjustedMainDirect,
      subcalculations:partitions.subcalculations,
      components
    });

    res.json({
      contract:"brebo-calc-tail-cost-evaluation-v2",
      directCost:hierarchy.totalDirectCost,
      mainDirectCost:hierarchy.mainDirectCost,
      calculationComponents:hierarchy.calculationTailCosts,
      subcalculations:hierarchy.subcalculations,
      tailCost:hierarchy.tailCost,
      salesPrice:hierarchy.salesPrice
    });
  }catch(error){res.status(422).json({error:error instanceof Error?error.message:"Staartkosten konden niet worden berekend."});}
});

app.get("/api/workbench/current/subcalculations/evaluate", async (req,res)=>{
  const session=requireSession(req,res); if(!session)return;
  try{
    const versionId=await currentCalcVersionId(session.calculationId);
    const [components,partitions,vatRegimes,lineVatRows,allocationRows]=await Promise.all([
      listTailCostComponents(versionId),
      evaluateCalculationPartitions(versionId),
      listVatRegimes(true),
      db.execute<RowDataPacket[]>(`
        SELECT id,line_type,vat_regime_id,quantity,labour_total_hours,labour_unit_cost,
               material_unit_cost,equipment_unit_cost,subcontracting_unit_cost,other_unit_cost
          FROM calculation_lines
         WHERE version_id=?
         ORDER BY id
      `,[versionId]).then(([rows])=>rows),
      db.execute<RowDataPacket[]>(`
        SELECT source_line_id,target_line_id,amount
          FROM calculation_line_allocations
         WHERE version_id=?
         ORDER BY id
      `,[versionId]).then(([rows])=>rows)
    ]);
    const hierarchy=evaluateTailCostHierarchy({
      totalDirectCost:partitions.totalDirectCost,
      mainDirectCost:partitions.mainDirectCost,
      subcalculations:partitions.subcalculations,
      components
    });
    const contributingVatRows=lineVatRows.filter(row=>lineContributesToCalculationTotals(String(row.line_type)));
    const effectiveLineVat=effectiveAllocatedVatSources({
      lines:contributingVatRows.map(row=>({
        id:Number(row.id),
        lineType:String(row.line_type),
        quantity:row.quantity==null?null:Number(row.quantity),
        labourTotalHours:row.labour_total_hours==null?null:Number(row.labour_total_hours),
        labourUnitCost:Number(row.labour_unit_cost??0),
        materialUnitCost:Number(row.material_unit_cost??0),
        equipmentUnitCost:Number(row.equipment_unit_cost??0),
        subcontractingUnitCost:Number(row.subcontracting_unit_cost??0),
        otherUnitCost:Number(row.other_unit_cost??0),
        vatRegimeId:row.vat_regime_id==null?null:Number(row.vat_regime_id)
      })),
      allocations:allocationRows.map(row=>({
        sourceLineId:Number(row.source_line_id),
        targetLineId:Number(row.target_line_id),
        amount:Number(row.amount??0)
      }))
    });
    const lineVatById=new Map<number,VatSource>(contributingVatRows.map((row,index)=>[
      Number(row.id),
      effectiveLineVat[index]
    ]));
    const results=hierarchy.subcalculations.map(result=>{
      const vatBreakdown=aggregateVat({
        regimes:vatRegimes,
        lineSales:result.lineIds.map(id=>lineVatById.get(id)).filter((row):row is VatSource=>Boolean(row)),
        tailCosts:result.tailCosts
      });
      const vat=vatBreakdown.reduce((sum,item)=>sum+item.vatAmount,0);
      return{
        ...result,
        allocatedTailCost:result.tailCost,
        directShare:hierarchy.totalDirectCost>0?result.directCost/hierarchy.totalDirectCost:0,
        vatBreakdown,
        vat,
        salesPriceInclVat:result.salesPrice+vat
      };
    });
    res.setHeader("Cache-Control","no-store, private");
    res.json({
      contract:"brebo-calc-subcalculation-results-v3",
      versionId,
      totalDirect:hierarchy.totalDirectCost,
      mainDirect:hierarchy.mainDirectCost,
      totalTail:hierarchy.tailCost,
      results
    });
  }catch(error){
    res.status(422).json({error:error instanceof Error?error.message:"Deelcalculaties konden niet worden berekend."});
  }
});

app.get("/api/workbench/current/subcalculations", async (req, res) => {
  const session=requireSession(req,res);
  if(!session) return;
  try {
    const versionId=await currentCalcVersionId(session.calculationId);
    const subcalculations=await listCalcSubcalculations(versionId);
    res.setHeader("Cache-Control","no-store, private");
    res.json({contract:"brebo-calc-subcalculations-v1",versionId,subcalculations});
  } catch(error) {
    res.status(500).json({error:error instanceof Error?error.message:"Deelcalculaties konden niet worden geladen."});
  }
});

app.post("/api/workbench/current/subcalculations/scoped", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  try{
    const versionId=await currentCalcDraftVersionId(session.calculationId);
    const scopeType=String(req.body?.scopeType??"custom") as any;
    const id=await createScopedCalcSubcalculation({
      versionId,
      ref:String(req.body?.ref??""),
      description:String(req.body?.description??""),
      scopeType,
      scopeRef:String(req.body?.scopeRef??""),
      includeDescendants:Boolean(req.body?.includeDescendants??false),
      sortOrder:Number(req.body?.sortOrder??0)
    });
    res.status(201).json({subcalculationId:id});
  }catch(error){
    res.status(400).json({error:error instanceof Error?error.message:"Scoped deelcalculatie kon niet worden aangemaakt."});
  }
});

app.post("/api/workbench/current/subcalculations", async (req, res) => {
  const session=requireSession(req,res);
  if(!session) return;
  try {
    const versionId=await currentCalcDraftVersionId(session.calculationId);
    const id=await createCalcSubcalculation({
      versionId,
      ref:String(req.body?.ref??""),
      description:String(req.body?.description??""),
      sortOrder:Number(req.body?.sortOrder??0)
    });
    res.status(201).json({subcalculationId:id});
  } catch(error) {
    res.status(400).json({error:error instanceof Error?error.message:"Deelcalculatie kon niet worden aangemaakt."});
  }
});

app.post("/api/workbench/current/subcalculations/:id/scopes", async (req, res) => {
  const session=requireSession(req,res);
  if(!session) return;
  try {
    const versionId=await currentCalcDraftVersionId(session.calculationId);
    const subcalculations=await listCalcSubcalculations(versionId);
    const subcalculationId=Number(req.params.id);
    if(!subcalculations.some(item=>item.id===subcalculationId)) {
      res.status(404).json({error:"Deelcalculatie hoort niet bij deze Calc-versie."});
      return;
    }
    const id=await addCalcSubcalculationScope({
      subcalculationId,
      scopeType:String(req.body?.scopeType??"custom") as any,
      scopeRef:String(req.body?.scopeRef??""),
      includeDescendants:Boolean(req.body?.includeDescendants??false),
      sortOrder:Number(req.body?.sortOrder??0)
    });
    res.status(201).json({scopeId:id});
  } catch(error) {
    res.status(400).json({error:error instanceof Error?error.message:"Scope kon niet worden toegevoegd."});
  }
});

app.put("/api/workbench/current/subcalculations/:id/lines/:lineId", async (req, res) => {
  const session=requireSession(req,res);
  if(!session) return;
  try {
    const versionId=await currentCalcDraftVersionId(session.calculationId);
    const subcalculations=await listCalcSubcalculations(versionId);
    const subcalculationId=Number(req.params.id);
    if(!subcalculations.some(item=>item.id===subcalculationId)) {
      res.status(404).json({error:"Deelcalculatie hoort niet bij deze Calc-versie."});
      return;
    }
    await setManualLineMembership({
      subcalculationId,
      lineId:Number(req.params.lineId),
      included:Boolean(req.body?.included)
    });
    res.status(204).end();
  } catch(error) {
    res.status(400).json({error:error instanceof Error?error.message:"Deelcalculatieregel kon niet worden bijgewerkt."});
  }
});

app.get("/api/recipes", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const recipes = await listCalcRecipes();
    res.setHeader("Cache-Control", "no-store, private");
    res.json({ contract: "brebo-calc-recipe-catalog-v1", recipes });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Recepten konden niet worden geladen.";
    res.status(500).json({ error: detail });
  }
});

app.post("/api/recipes", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const recipeId = await createCalcRecipe({
      recipeKey: String(req.body?.recipeKey ?? ""),
      name: String(req.body?.name ?? ""),
      description: req.body?.description == null ? null : String(req.body.description),
      applicability:{
        classification:{
          nl_sfb:{path:String(req.body?.nlSfbPath??"").trim()},
          stabu:{path:String(req.body?.stabuPath??"").trim()}
        }
      }
    });
    res.status(201).json({ recipeId });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Recept kon niet worden aangemaakt.";
    res.status(400).json({ error: detail });
  }
});

app.put("/api/recipes/:versionId/classification", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  const versionId=Number(req.params.versionId);
  if(!Number.isInteger(versionId)||versionId<=0){res.status(400).json({error:"Ongeldige receptversie."});return;}
  try{
    await updateCalcRecipeApplicability(versionId,{
      classification:{
        nl_sfb:{path:String(req.body?.nlSfbPath??"").trim()},
        stabu:{path:String(req.body?.stabuPath??"").trim()}
      }
    });
    res.json({ok:true});
  }catch(error){
    res.status(400).json({error:error instanceof Error?error.message:"Receptclassificatie kon niet worden opgeslagen."});
  }
});

app.post("/api/recipes/:versionId/lines", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const lineId = await addCalcRecipeLine({
      recipeVersionId: Number(req.params.versionId),
      lineRef: String(req.body?.lineRef ?? ""),
      sortOrder: Number(req.body?.sortOrder ?? 0),
      costKind: String(req.body?.costKind ?? "") as any,
      description: String(req.body?.description ?? ""),
      unit: req.body?.unit == null ? null : String(req.body.unit),
      quantitySourceType: req.body?.quantitySourceType == null ? null : String(req.body.quantitySourceType),
      quantitySourceRef: req.body?.quantitySourceRef == null ? null : String(req.body.quantitySourceRef),
      costSourceType: req.body?.costSourceType == null ? null : String(req.body.costSourceType),
      costSourceRef: req.body?.costSourceRef == null ? null : String(req.body.costSourceRef),
      takeoffBasis: String(req.body?.takeoffBasis ?? "fixed") as any,
      factor: req.body?.factor == null ? 1 : Number(req.body.factor),
      wastePct: req.body?.wastePct == null ? 0 : Number(req.body.wastePct),
      fixedQuantity: req.body?.fixedQuantity == null ? null : Number(req.body.fixedQuantity),
      roundingStep: req.body?.roundingStep == null ? null : Number(req.body.roundingStep),
      minimumQuantity: req.body?.minimumQuantity == null ? null : Number(req.body.minimumQuantity),
      metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : null
    });
    res.status(201).json({ lineId });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Receptregel kon niet worden toegevoegd.";
    res.status(400).json({ error: detail });
  }
});

app.put("/api/recipes/:versionId/lines/:lineId", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  try{
    await updateCalcRecipeLine({
      recipeVersionId:Number(req.params.versionId),
      lineId:Number(req.params.lineId),
      lineRef:String(req.body?.lineRef??""),
      sortOrder:Number(req.body?.sortOrder??0),
      costKind:String(req.body?.costKind??"") as any,
      description:String(req.body?.description??""),
      unit:req.body?.unit==null?null:String(req.body.unit),
      quantitySourceType:req.body?.quantitySourceType==null?null:String(req.body.quantitySourceType),
      quantitySourceRef:req.body?.quantitySourceRef==null?null:String(req.body.quantitySourceRef),
      costSourceType:req.body?.costSourceType==null?null:String(req.body.costSourceType),
      costSourceRef:req.body?.costSourceRef==null?null:String(req.body.costSourceRef),
      takeoffBasis:String(req.body?.takeoffBasis??"fixed") as any,
      factor:req.body?.factor==null?1:Number(req.body.factor),
      wastePct:req.body?.wastePct==null?0:Number(req.body.wastePct),
      fixedQuantity:req.body?.fixedQuantity==null?null:Number(req.body.fixedQuantity),
      roundingStep:req.body?.roundingStep==null?null:Number(req.body.roundingStep),
      minimumQuantity:req.body?.minimumQuantity==null?null:Number(req.body.minimumQuantity),
      metadata:req.body?.metadata&&typeof req.body.metadata==="object"?req.body.metadata:null
    });
    res.json({ok:true});
  }catch(error){
    res.status(400).json({error:error instanceof Error?error.message:"Receptregel kon niet worden bijgewerkt."});
  }
});

app.get("/api/workbench/current/aggregate", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const [context, recipes, workspace, versions, triageOverrides, recipeProposalDecisions] = await Promise.all([
      fetchCalculationContextSnapshot(session.officeCalculationId),
      listCalcRecipes(),
      fetchOfficeWorkspaceState(session.officeCalculationId),
      db.execute<RowDataPacket[]>(
        "SELECT id FROM calculation_versions WHERE calculation_id = ? ORDER BY version_no DESC LIMIT 1",
        [session.calculationId]
      ),
      listDocumentTriageOverrides(session.calculationId),
      listRecipeProposalDecisions(session.calculationId)
    ]);
    if (context.context.project_id !== null && context.context.project_id !== session.officeProjectId) {
      res.status(409).json({ error: "Office calculation context hoort bij een ander project." });
      return;
    }
    const versionId = Number(versions[0][0]?.id ?? 0);
    if (!versionId) {
      res.status(409).json({ error: "Calc heeft geen actieve calculatieversie." });
      return;
    }
    const [structureLines] = await db.execute<RowDataPacket[]>(
      `SELECT structure_key, parent_id, line_type, code, description, id
         FROM calculation_lines
        WHERE version_id = ? AND line_type IN ('chapter','paragraph')
        ORDER BY sort_order, id`,
      [versionId]
    );
    const aggregate = buildWorkbenchAggregate({
      context,
      recipes,
      workspace,
      documentTriage:triageCalculationDocuments(context,triageOverrides),
      recipeProposalDecisions,
      structure: calcWorkbenchStructureFromLines(structureLines.map(row=>({
        id:Number(row.id),
        parent_id:row.parent_id==null?null:Number(row.parent_id),
        structure_key:String(row.structure_key),
        line_type:String(row.line_type),
        code:row.code==null?null:String(row.code),
        description:String(row.description??"")
      })))
    });
    const currentSelectionVersion=context.context.document_set?.selection_version??null;
    res.setHeader("Cache-Control", "no-store, private");
    res.json({
      ...aggregate,
      recipeProposalDecisions:recipeProposalDecisions.map(item=>({
        ...item,
        current:item.sourceSelectionVersion===currentSelectionVersion
      }))
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    res.status(502).json({ error: `Workbench kon niet worden opgebouwd: ${detail}` });
  }
});

app.get("/api/workbench/current", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const [calculations] = await db.execute<RowDataPacket[]>(
    "SELECT id, office_project_id, office_calculation_id, code, title, status, classification_scheme FROM calculations WHERE id = ? AND office_project_id = ? AND office_calculation_id = ? LIMIT 1",
    [session.calculationId, session.officeProjectId, session.officeCalculationId]
  );
  if (!calculations[0]) {
    res.status(404).json({ error: "Calculatie niet gevonden." });
    return;
  }

  const [versions] = await db.execute<RowDataPacket[]>(
    "SELECT id, version_no, status, direct_cost, markup_amount, sales_price FROM calculation_versions WHERE calculation_id = ? ORDER BY version_no DESC LIMIT 1",
    [session.calculationId]
  );
  const version = versions[0];
  if (!version) {
    res.status(409).json({ error: "Calculatie heeft geen versie." });
    return;
  }

  const [lines] = await db.execute<RowDataPacket[]>(
    `SELECT id, parent_id, structure_key, sort_order, line_type, code, description, unit, quantity,
            labour_norm, labour_total_hours, labour_hours_input_mode,
            labour_unit_cost, material_unit_cost, equipment_unit_cost,
            subcontracting_unit_cost, other_unit_cost, vat_regime_id, price_source_type,
            office_source_id, source_reference, source_supplier, source_unit_price,
            source_price_date, source_document_id, source_details, source_visual_page, source_position_bounds, source_visual_crop, source_visual_search_region, source_text_regions, source_offer_summary
       FROM calculation_lines
      WHERE version_id = ?
      ORDER BY sort_order, id`,
    [version.id]
  );

  const [manualScopeRows] = await db.execute<RowDataPacket[]>(
    `SELECT t.line_id,t.scope_type,t.scope_ref
       FROM calculation_line_scope_tags t
       JOIN calculation_lines l ON l.id=t.line_id
      WHERE l.version_id=? AND t.source='manual'
      ORDER BY t.line_id,t.scope_type,t.scope_ref`,
    [version.id]
  );
  const manualScopesByLine=new Map<number,Array<{scopeType:string;scopeRef:string}>>();
  for(const row of manualScopeRows){
    const lineId=Number(row.line_id);
    const items=manualScopesByLine.get(lineId)??[];
    items.push({scopeType:String(row.scope_type),scopeRef:String(row.scope_ref)});
    manualScopesByLine.set(lineId,items);
  }

  const [allocations] = await db.execute<RowDataPacket[]>(
    `SELECT source_line_id, target_line_id, allocation_method, share, amount FROM calculation_line_allocations WHERE version_id = ? ORDER BY source_line_id, target_line_id`,
    [version.id]
  );

  let officeContext;
  try {
    officeContext = await fetchOfficeProjectContext(session.officeProjectId);
  } catch {
    res.status(502).json({ error: "BREBO Office is tijdelijk niet bereikbaar." });
    return;
  }

  res.setHeader("Cache-Control", "no-store, private");
  res.json({
    calculation: calculations[0],
    version,
    project: officeContext.project,
    lines:lines.map(row=>({...row,manual_scopes:manualScopesByLine.get(Number(row.id))??[]})),
    allocations
  });
});

app.put("/api/workbench/current/classification-scheme", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  const scheme=String(req.body?.classificationScheme??"");
  if(!["nl_sfb","stabu","custom"].includes(scheme)){
    res.status(400).json({error:"Ongeldig classificatiestelsel."});
    return;
  }
  await db.execute(
    "UPDATE calculations SET classification_scheme=? WHERE id=? AND office_project_id=? AND office_calculation_id=?",
    [scheme,session.calculationId,session.officeProjectId,session.officeCalculationId]
  );
  res.json({classificationScheme:scheme});
});

app.put("/api/workbench/current", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  if (!Array.isArray(req.body?.lines)) {
    res.status(400).json({ error: "Calculatieregels ontbreken of hebben een ongeldig formaat." });
    return;
  }
  const lines = req.body.lines as LineInput[];
  const allocations = Array.isArray(req.body?.allocations) ? req.body.allocations as AllocationInput[] : [];
  if (lines.length > 5000 || allocations.length > 20000) {
    res.status(400).json({ error: "Ongeldige calculatie-invoer." });
    return;
  }
  const sourceContext=deriveSourceContextBinding(lines);
  if(sourceContext.status==="mixed"){
    res.status(409).json({error:"Calculatie bevat receptregels uit verschillende Office-broncontexten. Bouw het Calc-concept opnieuw op vanuit één actuele context."});
    return;
  }

  const unresolvedLines = lines.filter(line => line.resolutionStatus === "unresolved");
  if (unresolvedLines.length) {
    res.status(409).json({
      error: "Calculatie bevat onopgeloste prijs- of normbronnen.",
      readiness: "incomplete",
      unresolved: unresolvedLines.map(line => ({
        code: line.code ?? "",
        description: line.description,
        reason: line.resolutionReason ?? "Bron niet beschikbaar."
      }))
    });
    return;
  }

  const incompleteLabourLines=findIncompleteLabourLines(lines.map(line=>({
    lineType:line.lineType,
    labourUnitCost:line.labourUnitCost,
    labourTotalHours:line.labourTotalHours,
    code:line.code,
    description:line.description
  })));
  if(incompleteLabourLines.length){
    res.status(409).json({
      error:"Arbeidsregel heeft een uurprijs maar geen norm/totaaluren. Vul de arbeidsduur in of zet de uurprijs op 0.",
      readiness:"incomplete",
      unresolved:incompleteLabourLines.map(line=>({
        code:line.code??"",
        description:line.description??"",
        reason:"Uurprijs ingevuld, maar totaaluren ontbreken."
      }))
    });
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [versions] = await connection.execute<RowDataPacket[]>(
      "SELECT id, status FROM calculation_versions WHERE calculation_id = ? ORDER BY version_no DESC LIMIT 1 FOR UPDATE",
      [session.calculationId]
    );
    const version = versions[0];
    if (!version) {
      await connection.rollback();
      res.status(404).json({ error: "Calculatieversie niet gevonden." });
      return;
    }
    if (version.status !== "draft") {
      await connection.rollback();
      res.status(409).json({ error: "Alleen een conceptversie kan worden gewijzigd." });
      return;
    }

    const [preservedMemberships] = await connection.execute<RowDataPacket[]>(`
      SELECT m.subcalculation_id,m.calculation_line_id,m.membership_source
        FROM calculation_subcalculation_line_memberships m
        JOIN calculation_lines l ON l.id=m.calculation_line_id
       WHERE l.version_id=?
    `,[version.id]);
    const [preservedScopeTags] = await connection.execute<RowDataPacket[]>(`
      SELECT t.line_id,t.scope_type,t.scope_ref,t.source
        FROM calculation_line_scope_tags t
        JOIN calculation_lines l ON l.id=t.line_id
       WHERE l.version_id=? AND t.source='manual'
    `,[version.id]);

    await connection.execute("DELETE FROM calculation_lines WHERE version_id = ?", [version.id]);

    let directCost = 0;
    const temporaryIds = new Map<number, number>();
    const explicitManualScopeLineIds=new Set<number>();
    for (const line of lines) {
      if (!["chapter", "paragraph", "item", "allowance", "adjustable", "option", "note"].includes(line.lineType)) {
        throw new Error("Unknown line type.");
      }
      const quantity = numeric(line.quantity);
      const labourNorm = line.labourNorm == null ? null : numeric(line.labourNorm);
      const labourTotalHours = line.labourTotalHours == null ? null : numeric(line.labourTotalHours);
      const labourHoursInputMode = line.labourHoursInputMode === "norm" || line.labourHoursInputMode === "total_hours" ? line.labourHoursInputMode : null;
      const labour = numeric(line.labourUnitCost);
      const material = numeric(line.materialUnitCost);
      const equipment = numeric(line.equipmentUnitCost);
      const subcontracting = numeric(line.subcontractingUnitCost);
      const other = numeric(line.otherUnitCost);
      const sourceDetailsText=line.sourceDetails==null?null:String(line.sourceDetails);
      if(sourceDetailsText&&sourceDetailsText.length>250000){
        throw new Error("Bronprovenance van een calculatieregel is te groot om veilig op te slaan.");
      }
      if(sourceDetailsText){
        try{JSON.parse(sourceDetailsText);}catch{throw new Error("Bronprovenance van een calculatieregel bevat ongeldige JSON.");}
      }
      const priceSourceType = line.priceSourceType ?? "manual";
      if (!["manual", "article", "recipe", "supplier_quote"].includes(priceSourceType)) {
        throw new Error("Unknown price source type.");
      }
      if (lineContributesToCalculationTotals(line.lineType)) {
        const lineSalesAmount = calculateLineAmount({
          quantity,
          labourTotalHours,
          labourUnitCost:labour,
          materialUnitCost:material,
          equipmentUnitCost:equipment,
          subcontractingUnitCost:subcontracting,
          otherUnitCost:other
        });
        directCost += lineSalesAmount;

      }
      const parentId = line.parentId != null ? (temporaryIds.get(line.parentId) ?? null) : null;
      const [insert] = await connection.execute<ResultSetHeader>(
        `INSERT INTO calculation_lines
          (version_id, parent_id, structure_key, sort_order, line_type, code, description, unit, quantity,
           labour_norm, labour_total_hours, labour_hours_input_mode,
           labour_unit_cost, material_unit_cost, equipment_unit_cost, subcontracting_unit_cost, other_unit_cost, vat_regime_id,
           price_source_type, office_source_id, source_reference, source_supplier, source_unit_price,
           source_price_date, source_document_id, source_details, source_visual_page, source_position_bounds, source_visual_crop, source_visual_search_region, source_text_regions, source_offer_summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          version.id, parentId, line.structureKey ? String(line.structureKey).slice(0,36) : randomUUID(), line.sortOrder, line.lineType, line.code ?? null,
          String(line.description ?? "").slice(0, 500), line.unit ?? null,
          line.quantity ?? null, labourNorm, labourTotalHours, labourHoursInputMode, labour, material, equipment, subcontracting, other,
          line.vatRegimeId == null ? null : Number(line.vatRegimeId),
          priceSourceType,
          line.officeSourceId ? String(line.officeSourceId).slice(0, 128) : null,
          line.sourceReference ? String(line.sourceReference).slice(0, 255) : null,
          line.sourceSupplier ? String(line.sourceSupplier).slice(0, 255) : null,
          line.sourceUnitPrice == null ? null : numeric(line.sourceUnitPrice),
          line.sourcePriceDate ? String(line.sourcePriceDate).slice(0, 10) : null,
          line.sourceDocumentId ? String(line.sourceDocumentId).slice(0, 128) : null,
          sourceDetailsText,
          line.sourceVisualPage == null ? null : Math.max(1, Math.trunc(numeric(line.sourceVisualPage))),
          line.sourcePositionBounds ? JSON.stringify(line.sourcePositionBounds).slice(0, 500) : null,
          line.sourceVisualCrop ? JSON.stringify(line.sourceVisualCrop).slice(0, 500) : null,
          line.sourceVisualSearchRegion ? JSON.stringify(line.sourceVisualSearchRegion).slice(0, 500) : null,
          line.sourceTextRegions ? JSON.stringify(line.sourceTextRegions).slice(0, 20000) : null,
          line.sourceOfferSummary ? String(line.sourceOfferSummary).slice(0, 1200) : null
        ]
      );
      if (line.id != null) temporaryIds.set(line.id, insert.insertId);
      const scopeTags = generatedScopeTags({
        priceSourceType,
        sourceDetails: line.sourceDetails == null ? null : String(line.sourceDetails)
      });
      if (scopeTags.length) {
        await storeLineScopeTags(connection, insert.insertId, scopeTags);
      }
      if(Array.isArray(line.manualScopes)){
        if(line.id!=null)explicitManualScopeLineIds.add(Number(line.id));
        const manualTags=manualScopeTags(line.manualScopes,scopeTags);
        if(manualTags.length)await storeLineScopeTags(connection,insert.insertId,manualTags);
      }
    }

    for (const membership of preservedMemberships) {
      const nextLineId = temporaryIds.get(Number(membership.calculation_line_id));
      if (!nextLineId) continue;
      await connection.execute(
        `INSERT INTO calculation_subcalculation_line_memberships
          (subcalculation_id,calculation_line_id,membership_source)
         VALUES(?,?,?)
         ON DUPLICATE KEY UPDATE membership_source=VALUES(membership_source)`,
        [Number(membership.subcalculation_id),nextLineId,String(membership.membership_source)]
      );
    }

    for (const tag of preservedScopeTags) {
      if(explicitManualScopeLineIds.has(Number(tag.line_id)))continue;
      const nextLineId = temporaryIds.get(Number(tag.line_id));
      if (!nextLineId) continue;
      await connection.execute(
        `INSERT INTO calculation_line_scope_tags(line_id,scope_type,scope_ref,source)
         VALUES(?,?,?,?)
         ON DUPLICATE KEY UPDATE source=VALUES(source)`,
        [nextLineId,String(tag.scope_type),String(tag.scope_ref),String(tag.source)]
      );
    }

    for (const allocation of allocations) {
      const sourceId = temporaryIds.get(Number(allocation.sourceLineId));
      const targetId = temporaryIds.get(Number(allocation.targetLineId));
      if (!sourceId || !targetId || sourceId === targetId || !["quantity","value","manual"].includes(allocation.method)) continue;
      await connection.execute(
        `INSERT INTO calculation_line_allocations (version_id, source_line_id, target_line_id, allocation_method, share, amount) VALUES (?, ?, ?, ?, ?, ?)`,
        [version.id, sourceId, targetId, allocation.method, numeric(allocation.share), numeric(allocation.amount)]
      );
    }

    const [storedVatLineRows]=await connection.execute<RowDataPacket[]>(
      `SELECT id,line_type,quantity,labour_total_hours,labour_unit_cost,material_unit_cost,
              equipment_unit_cost,subcontracting_unit_cost,other_unit_cost,vat_regime_id
         FROM calculation_lines
        WHERE version_id=?`,
      [version.id]
    );
    const [storedAllocationRows]=await connection.execute<RowDataPacket[]>(
      `SELECT source_line_id,target_line_id,amount
         FROM calculation_line_allocations
        WHERE version_id=?
        ORDER BY id`,
      [version.id]
    );
    const lineVatSources=effectiveAllocatedVatSources({
      lines:storedVatLineRows.map(row=>({
        id:Number(row.id),
        lineType:String(row.line_type),
        quantity:row.quantity==null?null:Number(row.quantity),
        labourTotalHours:row.labour_total_hours==null?null:Number(row.labour_total_hours),
        labourUnitCost:Number(row.labour_unit_cost??0),
        materialUnitCost:Number(row.material_unit_cost??0),
        equipmentUnitCost:Number(row.equipment_unit_cost??0),
        subcontractingUnitCost:Number(row.subcontracting_unit_cost??0),
        otherUnitCost:Number(row.other_unit_cost??0),
        vatRegimeId:row.vat_regime_id==null?null:Number(row.vat_regime_id)
      })),
      allocations:storedAllocationRows.map(row=>({
        sourceLineId:Number(row.source_line_id),
        targetLineId:Number(row.target_line_id),
        amount:Number(row.amount??0)
      }))
    });

    const tailComponents = await listTailCostComponents(Number(version.id));
    const partitions = await evaluateCalculationPartitions(Number(version.id), connection);
    const tailHierarchy = evaluateTailCostHierarchy({
      totalDirectCost: directCost,
      mainDirectCost: partitions.mainDirectCost,
      subcalculations: partitions.subcalculations,
      components: tailComponents
    });
    const markupAmount = tailHierarchy.tailCost;
    const salesPrice = tailHierarchy.salesPrice;
    await connection.execute(
      `UPDATE calculation_versions
          SET direct_cost=?,markup_amount=?,sales_price=?,
              source_office_version=?,source_selection_version=?,
              source_bound_at=?
        WHERE id=?`,
      [
        directCost,markupAmount,salesPrice,
        sourceContext.status==="bound"?sourceContext.binding!.officeVersion:null,
        sourceContext.status==="bound"?sourceContext.binding!.selectionVersion:null,
        sourceContext.status==="bound"?new Date():null,
        version.id
      ]
    );
    await connection.execute(
      "UPDATE calculations SET updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
      [session.calculationId]
    );
    await connection.commit();

    const finalVatRegimes=await listVatRegimes(true);
    const finalVatBreakdown=aggregateVat({
      regimes:finalVatRegimes,
      lineSales:lineVatSources,
      tailCosts:[
        ...tailHierarchy.calculationTailCosts,
        ...tailHierarchy.subcalculations.flatMap(row=>row.tailCosts)
      ]
    });
    const finalTaxableBase=finalVatBreakdown.reduce((sum,item)=>sum+item.taxableBase,0);
    const vatReady=Math.abs(finalTaxableBase-salesPrice)<=0.01;
    const summary = buildCommercialSummary({
      purchase:directCost,
      sales:salesPrice,
      vatRate:null,
      vatBreakdown:vatReady?finalVatBreakdown.map(item=>({
        code:item.code,
        label:item.label,
        rate:item.rate,
        taxableBase:item.taxableBase,
        vatAmount:item.vatAmount,
        reverseCharged:item.reverseCharged
      })):undefined
    });
    res.json({
      directCost, markupAmount, salesPrice,
      margin:summary.margin, marginPct:summary.marginPct,
      vat:summary.vat, vatRate:summary.vatRate,
      vatBreakdown:finalVatBreakdown, vatReady,
      publication:{status:"draft_only" as const}
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});


app.post("/api/workbench/current/publish", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;

  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    const [versions]=await connection.execute<RowDataPacket[]>(
      `SELECT id,version_no,status,direct_cost,markup_amount,sales_price,
              source_office_version,source_selection_version
         FROM calculation_versions
        WHERE calculation_id=?
        ORDER BY version_no DESC
        LIMIT 1
        FOR UPDATE`,
      [session.calculationId]
    );
    const version=versions[0];
    if(!version){
      await connection.rollback();
      res.status(404).json({error:"Calculatieversie niet gevonden."});
      return;
    }
    const versionStatus=String(version.status);
    if(!["draft","established"].includes(versionStatus)){
      await connection.rollback();
      res.status(409).json({error:"Deze calculatieversie kan niet worden gepubliceerd."});
      return;
    }

    const [lineRows]=await connection.execute<RowDataPacket[]>(
      `SELECT id,parent_id,structure_key,sort_order,line_type,code,description,unit,quantity,
              labour_norm,labour_total_hours,labour_hours_input_mode,
              labour_unit_cost,material_unit_cost,equipment_unit_cost,subcontracting_unit_cost,other_unit_cost,
              vat_regime_id,price_source_type,office_source_id,source_reference,source_supplier,source_unit_price,
              source_price_date,source_document_id,source_details,source_visual_page,source_position_bounds,
              source_visual_crop,source_visual_search_region,source_text_regions,source_offer_summary
         FROM calculation_lines
        WHERE version_id=?
        ORDER BY sort_order,id
        FOR UPDATE`,
      [version.id]
    );
    const costRows=lineRows.filter(row=>lineContributesToCalculationTotals(String(row.line_type)));
    if(!costRows.length)throw new Error("Een lege calculatie kan niet worden gepubliceerd.");
    const incompleteLabourRows=findIncompleteLabourLines(costRows.map(row=>({
      lineType:String(row.line_type),
      labourUnitCost:Number(row.labour_unit_cost??0),
      labourTotalHours:row.labour_total_hours==null?null:Number(row.labour_total_hours),
      code:row.code==null?null:String(row.code),
      description:row.description==null?null:String(row.description)
    })));
    if(incompleteLabourRows.length){
      throw new Error("Publiceren geblokkeerd: arbeidsregel heeft een uurprijs maar geen norm/totaaluren.");
    }

    const derivedContext=deriveSourceContextBinding(lineRows.map(row=>({
      priceSourceType:String(row.price_source_type??"manual"),
      sourceDetails:row.source_details==null?null:String(row.source_details)
    })));
    if(derivedContext.status==="mixed"){
      throw new Error("Receptregels gebruiken verschillende Office-broncontexten. Bouw het concept opnieuw op.");
    }
    if(derivedContext.status==="unbound"){
      throw new Error("Receptregels missen een aantoonbare Office-broncontext. Bouw het concept opnieuw op.");
    }
    if(derivedContext.status==="bound"){
      if(String(version.source_office_version??"")!==derivedContext.binding!.officeVersion||
         (version.source_selection_version==null?null:String(version.source_selection_version))!==derivedContext.binding!.selectionVersion){
        throw new Error("De opgeslagen broncontextbinding wijkt af van de receptregels. Sla de calculatie opnieuw op.");
      }
      const [currentOffice,currentContext]=await Promise.all([
        fetchOfficeWorkspaceState(session.officeCalculationId),
        fetchCalculationContextSnapshot(session.officeCalculationId)
      ]);
      if(!sourceContextIsCurrent({
        binding:derivedContext.binding,
        officeVersion:String(currentOffice.version.version),
        selectionVersion:currentContext.context.document_set?.selection_version??null
      })){
        throw new Error("De Office-broncontext is gewijzigd sinds dit Calc-concept is opgebouwd. Bouw het concept opnieuw op vóór publicatie.");
      }
    }

    const [vatAllocationRows]=await connection.execute<RowDataPacket[]>(
      `SELECT source_line_id,target_line_id,amount
         FROM calculation_line_allocations
        WHERE version_id=?
        ORDER BY id`,
      [version.id]
    );
    const lineSales:VatSource[]=effectiveAllocatedVatSources({
      lines:costRows.map(row=>({
        id:Number(row.id),
        lineType:String(row.line_type),
        quantity:row.quantity==null?null:Number(row.quantity),
        labourTotalHours:row.labour_total_hours==null?null:Number(row.labour_total_hours),
        labourUnitCost:Number(row.labour_unit_cost??0),
        materialUnitCost:Number(row.material_unit_cost??0),
        equipmentUnitCost:Number(row.equipment_unit_cost??0),
        subcontractingUnitCost:Number(row.subcontracting_unit_cost??0),
        otherUnitCost:Number(row.other_unit_cost??0),
        vatRegimeId:row.vat_regime_id==null?null:Number(row.vat_regime_id)
      })),
      allocations:vatAllocationRows.map(row=>({
        sourceLineId:Number(row.source_line_id),
        targetLineId:Number(row.target_line_id),
        amount:Number(row.amount??0)
      }))
    });
    const directCost=lineSales.reduce((sum,row)=>sum+row.salesAmount,0);

    const [tailRows]=await connection.execute<RowDataPacket[]>(
      `SELECT * FROM calculation_tail_cost_components
        WHERE version_id=? AND active=1
        ORDER BY sort_order,id
        FOR UPDATE`,
      [version.id]
    );
    const tailComponents=tailRows.map(row=>({
      id:Number(row.id),versionId:Number(row.version_id),
      ownerType:String(row.owner_type??"calculation") as "calculation"|"subcalculation",
      ownerRef:row.owner_ref==null?null:String(row.owner_ref),
      componentKey:String(row.component_key),description:String(row.description),
      basis:String(row.basis) as "fixed"|"percentage"|"per_unit",value:Number(row.value),
      baseScope:String(row.base_scope) as any,baseRef:row.base_ref==null?null:String(row.base_ref),
      quantity:row.quantity==null?null:Number(row.quantity),
      vatRegimeId:row.vat_regime_id==null?null:Number(row.vat_regime_id),
      sortOrder:Number(row.sort_order),active:Boolean(row.active)
    }));
    const partitions=await evaluateCalculationPartitions(Number(version.id),connection);
    const tailHierarchy=evaluateTailCostHierarchy({
      totalDirectCost:directCost,
      mainDirectCost:partitions.mainDirectCost,
      subcalculations:partitions.subcalculations,
      components:tailComponents
    });
    const markupAmount=tailHierarchy.tailCost;
    const salesPrice=tailHierarchy.salesPrice;

    if(Math.abs(Number(version.direct_cost)-directCost)>0.01||
       Math.abs(Number(version.markup_amount)-markupAmount)>0.01||
       Math.abs(Number(version.sales_price)-salesPrice)>0.01){
      throw new Error("De opgeslagen versie wijkt af van de actuele Calc-doorrekening. Sla de calculatie opnieuw op.");
    }

    const vatRegimes=await listVatRegimes(true);
    const vatBreakdown=aggregateVat({
      regimes:vatRegimes,
      lineSales,
      tailCosts:[
        ...tailHierarchy.calculationTailCosts,
        ...tailHierarchy.subcalculations.flatMap(row=>row.tailCosts)
      ]
    });
    const taxableBase=vatBreakdown.reduce((sum,item)=>sum+item.taxableBase,0);
    if(Math.abs(taxableBase-salesPrice)>0.01){
      throw new Error("BTW-regime ontbreekt op een of meer verkoopregels of staartkostenregels.");
    }

    const summary=buildCommercialSummary({
      purchase:directCost,
      sales:salesPrice,
      vatRate:null,
      vatBreakdown:vatBreakdown.map(item=>({
        code:item.code,label:item.label,rate:item.rate,taxableBase:item.taxableBase,
        vatAmount:item.vatAmount,reverseCharged:item.reverseCharged
      }))
    });

    const byId=new Map(lineRows.map(row=>[Number(row.id),row]));
    const snapshotLines=lineRows.map(row=>{
      const parent=row.parent_id==null?null:byId.get(Number(row.parent_id))??null;
      return{
        structureKey:String(row.structure_key),
        parentStructureKey:parent?String(parent.structure_key):null,
        lineType:String(row.line_type),
        sortOrder:Number(row.sort_order),
        code:row.code==null?null:String(row.code),
        description:String(row.description??""),
        unit:row.unit==null?null:String(row.unit),
        quantity:row.quantity==null?null:Number(row.quantity),
        labourNorm:row.labour_norm==null?null:Number(row.labour_norm),
        labourTotalHours:row.labour_total_hours==null?null:Number(row.labour_total_hours),
        labourHoursInputMode:row.labour_hours_input_mode==null?null:String(row.labour_hours_input_mode),
        labourUnitCost:Number(row.labour_unit_cost??0),
        materialUnitCost:Number(row.material_unit_cost??0),
        equipmentUnitCost:Number(row.equipment_unit_cost??0),
        subcontractingUnitCost:Number(row.subcontracting_unit_cost??0),
        otherUnitCost:Number(row.other_unit_cost??0),
        vatRegimeId:row.vat_regime_id==null?null:Number(row.vat_regime_id),
        priceSourceType:String(row.price_source_type??"manual"),
        officeSourceId:row.office_source_id==null?null:String(row.office_source_id),
        sourceReference:row.source_reference==null?null:String(row.source_reference),
        sourceSupplier:row.source_supplier==null?null:String(row.source_supplier),
        sourceUnitPrice:row.source_unit_price==null?null:Number(row.source_unit_price),
        sourcePriceDate:snapshotDate(row.source_price_date),
        sourceDocumentId:row.source_document_id==null?null:String(row.source_document_id),
        sourceDetails:row.source_details==null?null:String(row.source_details),
        sourceVisualPage:row.source_visual_page==null?null:Number(row.source_visual_page),
        sourcePositionBounds:snapshotJson(row.source_position_bounds),
        sourceVisualCrop:snapshotJson(row.source_visual_crop),
        sourceVisualSearchRegion:snapshotJson(row.source_visual_search_region),
        sourceTextRegions:snapshotJson(row.source_text_regions),
        sourceOfferSummary:row.source_offer_summary==null?null:String(row.source_offer_summary)
      };
    });

    const [allocationRows]=await connection.execute<RowDataPacket[]>(
      "SELECT source_line_id,target_line_id,allocation_method,share,amount FROM calculation_line_allocations WHERE version_id=? ORDER BY id",
      [version.id]
    );
    const allocations=allocationRows.map(row=>({
      sourceStructureKey:String(byId.get(Number(row.source_line_id))?.structure_key??""),
      targetStructureKey:String(byId.get(Number(row.target_line_id))?.structure_key??""),
      method:String(row.allocation_method),share:Number(row.share),amount:Number(row.amount)
    }));

    const [subRows]=await connection.execute<RowDataPacket[]>(
      "SELECT id,ref,description,dimension_type,dimension_ref,sort_order FROM calculation_subcalculations WHERE version_id=? ORDER BY sort_order,id",
      [version.id]
    );
    const subRefById=new Map(subRows.map(row=>[Number(row.id),String(row.ref)]));
    const [scopeRows]=await connection.execute<RowDataPacket[]>(
      `SELECT s.subcalculation_id,s.scope_type,s.scope_ref,s.include_descendants,s.sort_order
         FROM calculation_subcalculation_scopes s
         JOIN calculation_subcalculations c ON c.id=s.subcalculation_id
        WHERE c.version_id=?
        ORDER BY c.sort_order,s.sort_order,s.id`,
      [version.id]
    );
    const [membershipRows]=await connection.execute<RowDataPacket[]>(
      `SELECT m.subcalculation_id,m.calculation_line_id,m.membership_source
         FROM calculation_subcalculation_line_memberships m
         JOIN calculation_subcalculations c ON c.id=m.subcalculation_id
        WHERE c.version_id=?
        ORDER BY m.subcalculation_id,m.calculation_line_id`,
      [version.id]
    );
    const [lineScopeRows]=await connection.execute<RowDataPacket[]>(
      `SELECT t.line_id,t.scope_type,t.scope_ref,t.source
         FROM calculation_line_scope_tags t
         JOIN calculation_lines l ON l.id=t.line_id
        WHERE l.version_id=?
        ORDER BY t.line_id,t.scope_type,t.scope_ref`,
      [version.id]
    );

    const directCostMix=snapshotLines
      .filter(line=>lineContributesToCalculationTotals(line.lineType))
      .reduce((mix,line)=>{
        const costs=calculateLineCostBreakdown({
          quantity:line.quantity,
          labourTotalHours:line.labourTotalHours,
          labourUnitCost:line.labourUnitCost,
          materialUnitCost:line.materialUnitCost,
          equipmentUnitCost:line.equipmentUnitCost,
          subcontractingUnitCost:line.subcontractingUnitCost,
          otherUnitCost:line.otherUnitCost
        });
        mix.labour+=costs.labour;
        mix.material+=costs.material;
        mix.equipment+=costs.equipment;
        mix.subcontracting+=costs.subcontracting;
        mix.other+=costs.other;
        return mix;
      },{labour:0,material:0,equipment:0,subcontracting:0,other:0});

    let establishedAt=new Date().toISOString();
    if(versionStatus==="established"){
      const [storedSnapshotRows]=await connection.execute<RowDataPacket[]>(
        "SELECT snapshot_json FROM calculation_version_snapshots WHERE version_id=? LIMIT 1",
        [version.id]
      );
      const storedRaw=storedSnapshotRows[0]?.snapshot_json;
      const storedSnapshot=typeof storedRaw==="string"?JSON.parse(storedRaw):storedRaw;
      const storedEstablishedAt=String(storedSnapshot?.establishedAt??"").trim();
      if(!storedEstablishedAt)throw new Error("De vastgestelde Calc-versie mist de oorspronkelijke vaststeldatum.");
      establishedAt=storedEstablishedAt;
    }
    const snapshot=createWorkbenchEstablishedSnapshot({
      calculationId:session.calculationId,
      versionId:Number(version.id),
      versionNo:Number(version.version_no),
      establishedAt,
      lines:snapshotLines,
      allocations,
      subcalculations:subRows.map(row=>({
        ref:String(row.ref),description:String(row.description),dimensionType:String(row.dimension_type),
        dimensionRef:row.dimension_ref==null?null:String(row.dimension_ref),sortOrder:Number(row.sort_order)
      })),
      subcalculationScopes:scopeRows.map(row=>({
        subcalculationRef:subRefById.get(Number(row.subcalculation_id))??"",
        scopeType:String(row.scope_type),scopeRef:String(row.scope_ref),
        includeDescendants:Boolean(row.include_descendants),sortOrder:Number(row.sort_order)
      })),
      subcalculationMemberships:membershipRows.map(row=>({
        subcalculationRef:subRefById.get(Number(row.subcalculation_id))??"",
        lineStructureKey:String(byId.get(Number(row.calculation_line_id))?.structure_key??""),
        source:String(row.membership_source)
      })),
      tailCosts:tailComponents.map(row=>({
        ownerType:row.ownerType,ownerRef:row.ownerRef,componentKey:row.componentKey,
        description:row.description,basis:row.basis,value:row.value,baseScope:row.baseScope,
        baseRef:row.baseRef,quantity:row.quantity,vatRegimeId:row.vatRegimeId,sortOrder:row.sortOrder
      })),
      lineScopes:lineScopeRows.map(row=>({
        lineStructureKey:String(byId.get(Number(row.line_id))?.structure_key??""),
        scopeType:String(row.scope_type),scopeRef:String(row.scope_ref),source:String(row.source)
      })),
      commercial:{directCost,markupAmount,salesPrice,summary,directCostMix}
    });
    const contentHash=fingerprintWorkbenchSnapshot(snapshot);

    const commercialSummary={
      purchase:summary.purchase,
      sales:summary.sales,
      margin:summary.margin,
      margin_pct:summary.marginPct,
      vat:summary.vat,
      total_incl_vat:summary.totalInclVat,
      vat_rate:summary.vatRate,
      vat_breakdown:summary.vatBreakdown.map(item=>({
        code:item.code,label:item.label,rate:item.rate,taxable_base:item.taxableBase,
        vat_amount:item.vatAmount,reverse_charged:item.reverseCharged
      }))
    };

    // Phase 1: durably establish Calc before any external Office side effect.
    // If Office publication fails afterwards, the exact established version can
    // safely be retried without changing the calculation.
    if(versionStatus==="draft"){
      await connection.execute(
        `INSERT INTO calculation_version_snapshots(version_id,snapshot_contract,snapshot_json,content_hash)
         VALUES(?,?,?,?)`,
        [version.id,snapshot.contract,JSON.stringify(snapshot),contentHash]
      );
      await connection.execute(
        `UPDATE calculation_versions
            SET status='established',content_hash=?,established_at=?
          WHERE id=?`,
        [contentHash,establishedAt.slice(0,23).replace("T"," "),version.id]
      );
      await connection.execute(
        "UPDATE calculations SET status='established',updated_at=CURRENT_TIMESTAMP(6) WHERE id=?",
        [session.calculationId]
      );
    }else{
      const [storedSnapshots]=await connection.execute<RowDataPacket[]>(
        "SELECT snapshot_contract,content_hash FROM calculation_version_snapshots WHERE version_id=? LIMIT 1",
        [version.id]
      );
      const stored=storedSnapshots[0];
      if(!stored||
         String(stored.snapshot_contract)!==snapshot.contract||
         String(stored.content_hash)!==contentHash){
        throw new Error("De vastgestelde Calc-versie wijkt af van de opgeslagen snapshot en kan niet veilig opnieuw worden gepubliceerd.");
      }
    }
    await connection.commit();

    // Phase 2: publish the immutable established result to Office.
    const officeState=await fetchOfficeWorkspaceState(session.officeCalculationId);
    const published=await publishCalcResult({
      calculationId:session.officeCalculationId,
      officeVersion:String(officeState.version.version),
      calcVersion:String(version.id),
      actorId:session.actorId,
      commercialSummary
    });
    const verifiedState=await fetchOfficeWorkspaceState(session.officeCalculationId);
    verifyOfficeCommercialSummary(verifiedState.calc_result?.commercial_summary,commercialSummary);
    verifyOfficePublicationBinding(verifiedState.calc_result,{
      snapshotId:published.snapshot_id,
      officeVersion:String(officeState.version.version),
      calcVersion:String(version.id)
    });

    res.json({
      status:"established",
      versionId:Number(version.id),
      versionNo:Number(version.version_no),
      contentHash,
      officeSync:{ok:true,snapshotId:published.snapshot_id,contentHash:published.content_hash},
      commercialSummary
    });
  }catch(error){
    try{await connection.rollback();}catch{}
    const detail=error instanceof Error?error.message:"Publiceren mislukt.";
    res.status(422).json({error:detail});
  }finally{
    connection.release();
  }
});


app.post("/api/workbench/current/versions", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;

  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    const [versions]=await connection.execute<RowDataPacket[]>(
      `SELECT id,version_no,status,source_office_version,source_selection_version,source_bound_at
         FROM calculation_versions
        WHERE calculation_id=?
        ORDER BY version_no DESC
        LIMIT 1
        FOR UPDATE`,
      [session.calculationId]
    );
    const current=versions[0];
    if(!current){
      await connection.rollback();
      res.status(404).json({error:"Calculatieversie niet gevonden."});
      return;
    }
    if(String(current.status)!=="established"){
      await connection.rollback();
      res.status(409).json({error:"Een nieuwe versie kan alleen vanuit een vastgestelde versie worden gestart."});
      return;
    }

    const [snapshots]=await connection.execute<RowDataPacket[]>(
      "SELECT snapshot_contract,snapshot_json,content_hash FROM calculation_version_snapshots WHERE version_id=? LIMIT 1",
      [current.id]
    );
    const stored=snapshots[0];
    if(!stored||String(stored.snapshot_contract)!=="brebo-calc-workbench-snapshot-v3"){
      throw new Error("De vastgestelde versie heeft geen bruikbare workbench-snapshot v3.");
    }
    const snapshot=typeof stored.snapshot_json==="string"
      ? JSON.parse(stored.snapshot_json)
      : stored.snapshot_json;
    if(!snapshot||snapshot.contract!=="brebo-calc-workbench-snapshot-v3"||!Array.isArray(snapshot.lines)){
      throw new Error("De workbench-snapshot is ongeldig.");
    }

    const nextVersionNo=Number(current.version_no)+1;
    const [insertVersion]=await connection.execute<ResultSetHeader>(
      `INSERT INTO calculation_versions
        (calculation_id,version_no,status,direct_cost,markup_amount,sales_price,
         source_office_version,source_selection_version,source_bound_at)
       VALUES(?,?,'draft',?,?,?,?,?,?)`,
      [
        session.calculationId,nextVersionNo,
        Number(snapshot.commercial?.directCost??0),
        Number(snapshot.commercial?.markupAmount??0),
        Number(snapshot.commercial?.salesPrice??0),
        current.source_office_version==null?null:String(current.source_office_version),
        current.source_selection_version==null?null:String(current.source_selection_version),
        current.source_bound_at??null
      ]
    );
    const nextVersionId=insertVersion.insertId;

    const subIdByRef=new Map<string,number>();
    for(const sub of Array.isArray(snapshot.subcalculations)?snapshot.subcalculations:[]){
      const [insert]=await connection.execute<ResultSetHeader>(
        `INSERT INTO calculation_subcalculations
          (version_id,ref,description,dimension_type,dimension_ref,sort_order)
         VALUES(?,?,?,?,?,?)`,
        [
          nextVersionId,String(sub.ref),String(sub.description),
          String(sub.dimensionType??"custom"),sub.dimensionRef==null?null:String(sub.dimensionRef),
          Number(sub.sortOrder??0)
        ]
      );
      subIdByRef.set(String(sub.ref),insert.insertId);
    }

    const lineIdByKey=new Map<string,number>();
    let pending=[...snapshot.lines];
    while(pending.length){
      let progressed=false;
      const remaining:any[]=[];
      for(const line of pending){
        const key=String(line.structureKey??"").trim();
        const parentKey=line.parentStructureKey==null?null:String(line.parentStructureKey);
        if(!key)throw new Error("Snapshotregel mist stabiele structuursleutel.");
        if(parentKey&&!lineIdByKey.has(parentKey)){
          remaining.push(line);
          continue;
        }
        const parentId=parentKey?lineIdByKey.get(parentKey)!:null;
        const [insert]=await connection.execute<ResultSetHeader>(
          `INSERT INTO calculation_lines
            (version_id,parent_id,structure_key,sort_order,line_type,code,description,unit,quantity,
             labour_norm,labour_total_hours,labour_hours_input_mode,
             labour_unit_cost,material_unit_cost,equipment_unit_cost,subcontracting_unit_cost,other_unit_cost,
             vat_regime_id,price_source_type,office_source_id,source_reference,source_supplier,source_unit_price,
             source_price_date,source_document_id,source_details,source_visual_page,source_position_bounds,
             source_visual_crop,source_visual_search_region,source_text_regions,source_offer_summary)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            nextVersionId,parentId,key,Number.isFinite(Number(line.sortOrder))?Number(line.sortOrder):lineIdByKey.size,String(line.lineType),line.code??null,String(line.description??""),
            line.unit??null,line.quantity??null,line.labourNorm??null,line.labourTotalHours??null,line.labourHoursInputMode??null,
            Number(line.labourUnitCost??0),Number(line.materialUnitCost??0),Number(line.equipmentUnitCost??0),
            Number(line.subcontractingUnitCost??0),Number(line.otherUnitCost??0),line.vatRegimeId??null,
            String(line.priceSourceType??"manual"),line.officeSourceId??null,line.sourceReference??null,line.sourceSupplier??null,
            line.sourceUnitPrice??null,line.sourcePriceDate??null,line.sourceDocumentId??null,line.sourceDetails??null,
            line.sourceVisualPage??null,line.sourcePositionBounds??null,line.sourceVisualCrop??null,
            line.sourceVisualSearchRegion??null,line.sourceTextRegions??null,line.sourceOfferSummary??null
          ]
        );
        lineIdByKey.set(key,insert.insertId);
        progressed=true;
      }
      if(!progressed)throw new Error("Snapshot bevat een ongeldige of cyclische regelhiërarchie.");
      pending=remaining;
    }

    for(const allocation of Array.isArray(snapshot.allocations)?snapshot.allocations:[]){
      const sourceId=lineIdByKey.get(String(allocation.sourceStructureKey??""));
      const targetId=lineIdByKey.get(String(allocation.targetStructureKey??""));
      if(!sourceId||!targetId)throw new Error("Snapshotkostenverdeling verwijst naar een ontbrekende regel.");
      await connection.execute(
        `INSERT INTO calculation_line_allocations
          (version_id,source_line_id,target_line_id,allocation_method,share,amount)
         VALUES(?,?,?,?,?,?)`,
        [nextVersionId,sourceId,targetId,String(allocation.method),Number(allocation.share??0),Number(allocation.amount??0)]
      );
    }

    for(const scope of Array.isArray(snapshot.subcalculationScopes)?snapshot.subcalculationScopes:[]){
      const subId=subIdByRef.get(String(scope.subcalculationRef??""));
      if(!subId)throw new Error("Snapshotscope verwijst naar een ontbrekende deelcalculatie.");
      await connection.execute(
        `INSERT INTO calculation_subcalculation_scopes
          (subcalculation_id,scope_type,scope_ref,include_descendants,sort_order)
         VALUES(?,?,?,?,?)`,
        [subId,String(scope.scopeType),String(scope.scopeRef),scope.includeDescendants?1:0,Number(scope.sortOrder??0)]
      );
    }

    for(const membership of Array.isArray(snapshot.subcalculationMemberships)?snapshot.subcalculationMemberships:[]){
      const subId=subIdByRef.get(String(membership.subcalculationRef??""));
      const lineId=lineIdByKey.get(String(membership.lineStructureKey??""));
      if(!subId||!lineId)throw new Error("Snapshotlidmaatschap verwijst naar ontbrekende Calc-data.");
      await connection.execute(
        `INSERT INTO calculation_subcalculation_line_memberships
          (subcalculation_id,calculation_line_id,membership_source)
         VALUES(?,?,?)`,
        [subId,lineId,String(membership.source??"scope")]
      );
    }

    for(const tail of Array.isArray(snapshot.tailCosts)?snapshot.tailCosts:[]){
      await connection.execute(
        `INSERT INTO calculation_tail_cost_components
          (version_id,owner_type,owner_ref,component_key,description,basis,value,base_scope,base_ref,quantity,vat_regime_id,sort_order,active)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)`,
        [
          nextVersionId,String(tail.ownerType??"calculation"),tail.ownerRef??null,String(tail.componentKey),
          String(tail.description),String(tail.basis),Number(tail.value??0),String(tail.baseScope),
          tail.baseRef??null,tail.quantity??null,tail.vatRegimeId??null,Number(tail.sortOrder??0)
        ]
      );
    }

    for(const scope of Array.isArray(snapshot.lineScopes)?snapshot.lineScopes:[]){
      const lineId=lineIdByKey.get(String(scope.lineStructureKey??""));
      if(!lineId)throw new Error("Snapshotregelscope verwijst naar een ontbrekende regel.");
      await connection.execute(
        `INSERT INTO calculation_line_scope_tags(line_id,scope_type,scope_ref,source)
         VALUES(?,?,?,?)`,
        [lineId,String(scope.scopeType),String(scope.scopeRef),String(scope.source??"generated")]
      );
    }

    await connection.execute(
      "UPDATE calculations SET status='draft',updated_at=CURRENT_TIMESTAMP(6) WHERE id=?",
      [session.calculationId]
    );
    await connection.commit();
    res.status(201).json({
      status:"draft",
      versionId:nextVersionId,
      versionNo:nextVersionNo,
      sourceVersionId:Number(current.id),
      sourceContentHash:String(stored.content_hash)
    });
  }catch(error){
    try{await connection.rollback();}catch{}
    res.status(422).json({error:error instanceof Error?error.message:"Nieuwe calculatieversie kon niet worden gestart."});
  }finally{
    connection.release();
  }
});

app.get("/api/settings/vat-regimes", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  try{
    res.setHeader("Cache-Control","no-store, private");
    res.json({regimes:await listVatRegimes(true)});
  }catch(error){
    res.status(500).json({error:error instanceof Error?error.message:"Btw-instellingen konden niet worden geladen."});
  }
});

app.post("/api/settings/vat-regimes", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  try{
    const treatment=String(req.body?.treatment??"normal") as VatTreatment;
    const regime=await createVatRegime({
      code:String(req.body?.code??""),
      label:String(req.body?.label??""),
      treatment,
      rate:req.body?.rate==null||req.body?.rate===""?null:Number(req.body.rate),
      active:req.body?.active!==false,
      sortOrder:Number(req.body?.sortOrder??0)
    });
    res.status(201).json(regime);
  }catch(error){
    res.status(400).json({error:error instanceof Error?error.message:"Btw-regime kon niet worden aangemaakt."});
  }
});

app.put("/api/settings/vat-regimes/:id", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0){res.status(400).json({error:"Ongeldig btw-regime."});return;}
  try{
    const patch:any={};
    if(req.body?.code!==undefined)patch.code=String(req.body.code);
    if(req.body?.label!==undefined)patch.label=String(req.body.label);
    if(req.body?.treatment!==undefined)patch.treatment=String(req.body.treatment) as VatTreatment;
    if(req.body?.rate!==undefined)patch.rate=req.body.rate==null||req.body.rate===""?null:Number(req.body.rate);
    if(req.body?.active!==undefined)patch.active=Boolean(req.body.active);
    if(req.body?.sortOrder!==undefined)patch.sortOrder=Number(req.body.sortOrder);
    res.json(await updateVatRegime(id,patch));
  }catch(error){
    res.status(400).json({error:error instanceof Error?error.message:"Btw-regime kon niet worden bijgewerkt."});
  }
});

app.get("/api/settings/labour-rates", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  try{
    res.setHeader("Cache-Control","no-store, private");
    res.json({rates:await listLabourRates(true)});
  }catch(error){
    res.status(500).json({error:error instanceof Error?error.message:"Uurtarieven konden niet worden geladen."});
  }
});

app.post("/api/settings/labour-rates", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  try{
    const rate=await createLabourRate({
      roleRef:String(req.body?.roleRef??""),
      label:String(req.body?.label??""),
      hourlyCostRate:Number(req.body?.hourlyCostRate),
      sourceRef:req.body?.sourceRef==null||req.body?.sourceRef===""?null:String(req.body.sourceRef),
      active:req.body?.active!==false,
      isDefault:Boolean(req.body?.isDefault),
      validFrom:req.body?.validFrom?String(req.body.validFrom):null,
      validTo:req.body?.validTo?String(req.body.validTo):null
    });
    res.status(201).json(rate);
  }catch(error){
    res.status(400).json({error:error instanceof Error?error.message:"Uurtarief kon niet worden aangemaakt."});
  }
});

app.put("/api/settings/labour-rates/:id", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0){res.status(400).json({error:"Ongeldig uurtarief."});return;}
  try{
    const patch:any={};
    if(req.body?.roleRef!==undefined)patch.roleRef=String(req.body.roleRef);
    if(req.body?.label!==undefined)patch.label=String(req.body.label);
    if(req.body?.hourlyCostRate!==undefined)patch.hourlyCostRate=Number(req.body.hourlyCostRate);
    if(req.body?.sourceRef!==undefined)patch.sourceRef=req.body.sourceRef==null||req.body.sourceRef===""?null:String(req.body.sourceRef);
    if(req.body?.active!==undefined)patch.active=Boolean(req.body.active);
    if(req.body?.isDefault!==undefined)patch.isDefault=Boolean(req.body.isDefault);
    if(req.body?.validFrom!==undefined)patch.validFrom=req.body.validFrom?String(req.body.validFrom):null;
    if(req.body?.validTo!==undefined)patch.validTo=req.body.validTo?String(req.body.validTo):null;
    res.json(await updateLabourRate(id,patch));
  }catch(error){
    res.status(400).json({error:error instanceof Error?error.message:"Uurtarief kon niet worden bijgewerkt."});
  }
});

app.get("/api/settings/user/columns", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  try{
    const columns=await getUserPreference<unknown[]>(session.actorId,"workbench.columns.v1");
    res.setHeader("Cache-Control","no-store, private");
    res.json({columns});
  }catch(error){
    res.status(500).json({error:error instanceof Error?error.message:"Kolomvoorkeuren konden niet worden geladen."});
  }
});

app.put("/api/settings/user/columns", async (req,res)=>{
  const session=requireSession(req,res);
  if(!session)return;
  if(!Array.isArray(req.body?.columns)){res.status(400).json({error:"Ongeldige kolominstellingen."});return;}
  const allowedKeys=new Set(["code","description","type","unit","quantity","norm","hours","hourlyRate","material","equipment","subcontracting","other","vat","building","facade","dwelling","dwelling_type","building_part","position","recipe","source","total"]);
  const columns=req.body.columns.map((item:any)=>({
    key:String(item?.key??""),
    visible:item?.visible!==false,
    width:Math.max(55,Math.min(600,Number(item?.width)||100))
  })).filter((item:{key:string})=>allowedKeys.has(item.key));
  if(columns.length!==allowedKeys.size||new Set(columns.map((item:{key:string})=>item.key)).size!==allowedKeys.size){
    res.status(400).json({error:"Kolominstellingen zijn onvolledig."});
    return;
  }
  try{
    await setUserPreference(session.actorId,"workbench.columns.v1",columns);
    res.json({ok:true,columns});
  }catch(error){
    res.status(500).json({error:error instanceof Error?error.message:"Kolomvoorkeuren konden niet worden opgeslagen."});
  }
});

const apiDirectory = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(apiDirectory, "../../web/dist");
app.use(express.static(webDist, {
  index: false,
  maxAge: process.env.NODE_ENV === "production" ? "1y" : 0,
  immutable: process.env.NODE_ENV === "production",
  setHeaders: (res, filePath) => {
    // Vite assets are content-hashed and safe to cache aggressively. The HTML
    // shell must never be cached or clients can remain pinned to an old build.
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    }
  }
}));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.sendFile(path.join(webDist, "index.html"));
});

app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Interne fout in BREBO Calc." });
});

app.listen(config.port, () => {
  console.log(`BREBO Calc API listening on port ${config.port}`);
});
