import { createHmac, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express, { type Request, type Response } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "./db.js";
import { config } from "./config.js";
import { calculateTakeoff } from "./takeoff.js";
import { runCalculationPipeline, type CalculationPipelineInput } from "./calculationPipeline.js";
import { buildConceptFromOfficeContext } from "./calculationConcept.js";
import { proposalRulesFromCalcRecipes, proposeRecipesForConcept } from "./recipeProposal.js";
import { officeAuthoritativeRecipeLines, officeCostingInputLines } from "./officeRecipeLines.js";
import { officeRecipeDirectCostLines } from "./officeRecipeDirectCosts.js";
import { evaluateOfficeAdditionalCosts } from "./additionalCostComponents.js";
import { buildOfficeCostRollup } from "./officeCostRollup.js";
import { buildWorkbenchAggregate } from "./workbenchAggregate.js";
import { calcRecipeSourceRequests, generateCalcOwnedRecipeLines } from "./calcOwnedRecipeGenerator.js";
import { addCalcRecipeLine, createCalcRecipe, listCalcRecipes } from "./calcRecipeRepository.js";
import { addCalcSubcalculationScope, createCalcSubcalculation, listCalcSubcalculations, setManualLineMembership } from "./calcSubcalculationRepository.js";
import { evaluateCalculationPartitions, evaluateSubcalculations } from "./subcalculationEvaluation.js";
import { generatedScopeTags, storeLineScopeTags } from "./lineScopeRepository.js";
import { createTailCostComponent, listTailCostComponents } from "./tailCostRepository.js";
import { evaluateTailCostHierarchy } from "./tailCostEvaluation.js";
import { buildCommercialSummary } from "./commercialSummary.js";
import { fetchCalculationContextSnapshot, fetchOfficeProjectContext, fetchOfficeWorkspaceState, fetchSupplierQuotePositionVisual, fetchSupplierQuotePreview, proposeCalculationDocumentSet, searchOfficeArticles, uploadSupplierQuoteToOffice, publishCalcResult, resolveOfficeCalcSources } from "./officeClient.js";

type LineType = "chapter" | "paragraph" | "item" | "allowance" | "adjustable" | "option" | "note";
type PriceSourceType = "manual" | "article" | "recipe" | "supplier_quote";
type AllocationInput = { sourceLineId:number; targetLineId:number; method:"quantity"|"value"|"manual"; share:number; amount:number };
type LineInput = {
  id?: number;
  parentId?: number | null;
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

app.post("/api/workbench/current/document-set/propose", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const proposal = await proposeCalculationDocumentSet({
      calculationId: session.officeCalculationId,
      projectId: session.officeProjectId
    });
    res.setHeader("Cache-Control", "no-store, private");
    res.status(201).json(proposal);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    console.error("BREBO Calc document-set proposal failed:", detail);
    res.status(502).json({ error: `Documentselectie kon niet door BREBO Office worden opgebouwd: ${detail}` });
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

app.get("/api/workbench/current/concept", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const snapshot = await fetchCalculationContextSnapshot(session.officeCalculationId);
    if (snapshot.context.project_id !== null && snapshot.context.project_id !== session.officeProjectId) {
      res.status(409).json({ error: "Office calculation context hoort bij een ander project." });
      return;
    }
    const concept = buildConceptFromOfficeContext(snapshot);
    res.setHeader("Cache-Control", "no-store, private");
    res.json(concept);
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
    const [snapshot, recipes] = await Promise.all([
      fetchCalculationContextSnapshot(session.officeCalculationId),
      listCalcRecipes()
    ]);
    if (snapshot.context.project_id !== null && snapshot.context.project_id !== session.officeProjectId) {
      res.status(409).json({ error: "Office calculation context hoort bij een ander project." });
      return;
    }
    const concept = buildConceptFromOfficeContext(snapshot);
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
    const [snapshot, recipes] = await Promise.all([
      fetchCalculationContextSnapshot(session.officeCalculationId),
      listCalcRecipes()
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

    const concept = buildConceptFromOfficeContext(snapshot);
    const proposals = proposeRecipesForConcept(concept, proposalRulesFromCalcRecipes(recipes));
    if (!proposals.some(item => item.positionRef === positionRef && Number(item.recipeRef) === recipeVersionId)) {
      res.status(409).json({ error: "Dit Calc-recept is niet toepasbaar op deze positie." });
      return;
    }

    const sourceRequests = calcRecipeSourceRequests(recipe);
    const resolution = sourceRequests.length
      ? await resolveOfficeCalcSources({ projectId: session.officeProjectId, sources: sourceRequests })
      : { contract: "brebo-office-calc-source-resolution-v1" as const, project_id: session.officeProjectId, results: [] };

    const generated = generateCalcOwnedRecipeLines({ recipe, takeoff, resolution });
    const unresolved = generated.filter(line => line.resolutionStatus === "unresolved");

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

app.post("/api/workbench/current/pipeline/preview", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  // Legacy preview only: recipe quantities are authoritative in Office.
  // Refuse recipe-bearing input so Calc can never become a second recipe engine.
  if (Array.isArray(req.body?.positions) && req.body.positions.some((position: any) =>
    Array.isArray(position?.recipeLines) && position.recipeLines.length > 0
  )) {
    res.status(409).json({
      error: "Lokale receptberekening is uitgeschakeld. Gebruik Office recipe instances via /api/workbench/current/generated-lines."
    });
    return;
  }

  const body = req.body as Partial<Omit<CalculationPipelineInput, "calculationId" | "versionNo" | "establishedAt">>;
  if (
    !Array.isArray(body.positions) ||
    !Array.isArray(body.materialPlans) ||
    !Array.isArray(body.labourNorms) ||
    !Array.isArray(body.labourRates) ||
    !Array.isArray(body.directCostComponents) ||
    !Array.isArray(body.structure) ||
    !Array.isArray(body.salesPriceComponents)
  ) {
    res.status(400).json({ error: "Pipeline-invoer is onvolledig." });
    return;
  }

  const [versions] = await db.execute<RowDataPacket[]>(
    "SELECT id, version_no, status, created_at FROM calculation_versions WHERE calculation_id = ? ORDER BY version_no DESC LIMIT 1",
    [session.calculationId]
  );
  const version = versions[0];
  if (!version) {
    res.status(404).json({ error: "Calculatieversie niet gevonden." });
    return;
  }
  if (version.status !== "draft") {
    res.status(409).json({ error: "Alleen een conceptversie kan via de pipeline worden doorgerekend." });
    return;
  }

  try {
    const createdAt = version.created_at instanceof Date
      ? version.created_at.toISOString()
      : new Date(String(version.created_at)).toISOString();

    const result = runCalculationPipeline({
      calculationId: String(session.calculationId),
      versionNo: Number(version.version_no),
      establishedAt: createdAt,
      positions: body.positions,
      materialPlans: body.materialPlans,
      labourNorms: body.labourNorms,
      labourRates: body.labourRates,
      directCostComponents: body.directCostComponents,
      structure: body.structure,
      salesPriceComponents: body.salesPriceComponents
    });

    res.setHeader("Cache-Control", "no-store, private");
    res.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Ongeldige pipeline-invoer.";
    res.status(422).json({ error: detail });
  }
});

app.post("/api/session/logout", (req, res) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
  res.status(204).end();
});

async function currentCalcVersionId(calculationId:number):Promise<number> {
  const [versions]=await db.execute<RowDataPacket[]>(
    "SELECT id FROM calculation_versions WHERE calculation_id=? ORDER BY version_no DESC LIMIT 1",
    [calculationId]
  );
  if(!versions[0]) throw new Error("Calculatie heeft geen versie.");
  return Number(versions[0].id);
}

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
    const versionId=await currentCalcVersionId(session.calculationId);
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
      baseScope:String(req.body?.baseScope??"direct_cost") as any,
      baseRef:req.body?.baseRef==null?null:String(req.body.baseRef),
      quantity:req.body?.quantity==null?null:Number(req.body.quantity),
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
    const [components,partitions]=await Promise.all([
      listTailCostComponents(versionId),
      evaluateCalculationPartitions(versionId)
    ]);
    const hierarchy=evaluateTailCostHierarchy({
      totalDirectCost:partitions.totalDirectCost,
      mainDirectCost:partitions.mainDirectCost,
      subcalculations:partitions.subcalculations,
      components
    });
    const results=hierarchy.subcalculations.map(result=>({
      ...result,
      allocatedTailCost:result.tailCost,
      directShare:hierarchy.totalDirectCost>0?result.directCost/hierarchy.totalDirectCost:0
    }));
    res.setHeader("Cache-Control","no-store, private");
    res.json({
      contract:"brebo-calc-subcalculation-results-v2",
      versionId,
      totalDirect:hierarchy.totalDirectCost,
      mainDirect:hierarchy.mainDirectCost,
      totalTail:hierarchy.tailCost,
      results
    });
  }catch(error){
    res.status(500).json({error:error instanceof Error?error.message:"Deelcalculaties konden niet worden berekend."});
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

app.post("/api/workbench/current/subcalculations", async (req, res) => {
  const session=requireSession(req,res);
  if(!session) return;
  try {
    const versionId=await currentCalcVersionId(session.calculationId);
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
    const versionId=await currentCalcVersionId(session.calculationId);
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
    const versionId=await currentCalcVersionId(session.calculationId);
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
      description: req.body?.description == null ? null : String(req.body.description)
    });
    res.status(201).json({ recipeId });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Recept kon niet worden aangemaakt.";
    res.status(400).json({ error: detail });
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

app.get("/api/workbench/current/aggregate", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const [context, recipes, workspace] = await Promise.all([
      fetchCalculationContextSnapshot(session.officeCalculationId),
      listCalcRecipes(),
      fetchOfficeWorkspaceState(session.officeCalculationId)
    ]);
    if (context.context.project_id !== null && context.context.project_id !== session.officeProjectId) {
      res.status(409).json({ error: "Office calculation context hoort bij een ander project." });
      return;
    }
    const aggregate = buildWorkbenchAggregate({ context, recipes, workspace });
    res.setHeader("Cache-Control", "no-store, private");
    res.json(aggregate);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    res.status(502).json({ error: `Workbench kon niet worden opgebouwd: ${detail}` });
  }
});

app.get("/api/workbench/current", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const [calculations] = await db.execute<RowDataPacket[]>(
    "SELECT id, office_project_id, office_calculation_id, code, title, status FROM calculations WHERE id = ? AND office_project_id = ? AND office_calculation_id = ? LIMIT 1",
    [session.calculationId, session.officeProjectId, session.officeCalculationId]
  );
  if (!calculations[0]) {
    res.status(404).json({ error: "Calculatie niet gevonden." });
    return;
  }

  const [versions] = await db.execute<RowDataPacket[]>(
    "SELECT id, version_no, status, direct_cost, markup_amount, sales_price, vat_rate FROM calculation_versions WHERE calculation_id = ? ORDER BY version_no DESC LIMIT 1",
    [session.calculationId]
  );
  const version = versions[0];
  if (!version) {
    res.status(409).json({ error: "Calculatie heeft geen versie." });
    return;
  }

  const [lines] = await db.execute<RowDataPacket[]>(
    `SELECT id, parent_id, sort_order, line_type, code, description, unit, quantity,
            labour_unit_cost, material_unit_cost, equipment_unit_cost,
            subcontracting_unit_cost, other_unit_cost, price_source_type,
            office_source_id, source_reference, source_supplier, source_unit_price,
            source_price_date, source_document_id, source_details, source_visual_page, source_position_bounds, source_visual_crop, source_visual_search_region, source_text_regions, source_offer_summary
       FROM calculation_lines
      WHERE version_id = ?
      ORDER BY sort_order, id`,
    [version.id]
  );

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
    lines,
    allocations
  });
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
  const vatRate = req.body?.vatRate == null || req.body.vatRate === "" ? null : Number(req.body.vatRate);
  if (vatRate !== null && (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100)) {
    res.status(400).json({ error: "Ongeldig btw-tarief." });
    return;
  }
  if (lines.length > 5000 || allocations.length > 20000) {
    res.status(400).json({ error: "Ongeldige calculatie-invoer." });
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
       WHERE l.version_id=? AND t.source<>'generated'
    `,[version.id]);

    await connection.execute("DELETE FROM calculation_lines WHERE version_id = ?", [version.id]);

    let directCost = 0;
    const temporaryIds = new Map<number, number>();
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
      const priceSourceType = line.priceSourceType ?? "manual";
      if (!["manual", "article", "recipe", "supplier_quote"].includes(priceSourceType)) {
        throw new Error("Unknown price source type.");
      }
      if (!["chapter", "paragraph", "note", "option"].includes(line.lineType)) {
        const labourCost = (labourTotalHours ?? 0) * labour;
        directCost += labourCost + quantity * (material + equipment + subcontracting + other);
      }
      const parentId = line.parentId != null ? (temporaryIds.get(line.parentId) ?? null) : null;
      const [insert] = await connection.execute<ResultSetHeader>(
        `INSERT INTO calculation_lines
          (version_id, parent_id, sort_order, line_type, code, description, unit, quantity,
           labour_norm, labour_total_hours, labour_hours_input_mode,
           labour_unit_cost, material_unit_cost, equipment_unit_cost, subcontracting_unit_cost, other_unit_cost,
           price_source_type, office_source_id, source_reference, source_supplier, source_unit_price,
           source_price_date, source_document_id, source_details, source_visual_page, source_position_bounds, source_visual_crop, source_visual_search_region, source_text_regions, source_offer_summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          version.id, parentId, line.sortOrder, line.lineType, line.code ?? null,
          String(line.description ?? "").slice(0, 500), line.unit ?? null,
          line.quantity ?? null, labourNorm, labourTotalHours, labourHoursInputMode, labour, material, equipment, subcontracting, other,
          priceSourceType,
          line.officeSourceId ? String(line.officeSourceId).slice(0, 128) : null,
          line.sourceReference ? String(line.sourceReference).slice(0, 255) : null,
          line.sourceSupplier ? String(line.sourceSupplier).slice(0, 255) : null,
          line.sourceUnitPrice == null ? null : numeric(line.sourceUnitPrice),
          line.sourcePriceDate ? String(line.sourcePriceDate).slice(0, 10) : null,
          line.sourceDocumentId ? String(line.sourceDocumentId).slice(0, 128) : null,
          line.sourceDetails ? String(line.sourceDetails).slice(0, 8000) : null,
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
      "UPDATE calculation_versions SET direct_cost = ?, markup_amount = ?, sales_price = ?, vat_rate = ? WHERE id = ?",
      [directCost, markupAmount, salesPrice, vatRate, version.id]
    );
    await connection.execute(
      "UPDATE calculations SET updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
      [session.calculationId]
    );
    await connection.commit();

    let officeSync:{ok:boolean;snapshotId?:number;contentHash?:string;error?:string}={ok:false};
    try {
      const officeState = await fetchOfficeWorkspaceState(session.officeCalculationId);
      const summary = buildCommercialSummary({purchase:directCost,sales:salesPrice,vatRate});
      const commercialSummary = {
        purchase: summary.purchase,
        sales: summary.sales,
        margin: summary.margin,
        margin_pct: summary.marginPct,
        vat: summary.vat,
        vat_rate: summary.vatRate
      };
      const published = await publishCalcResult({
        calculationId: session.officeCalculationId,
        officeVersion: String(officeState.version.version),
        calcVersion: String(version.id),
        actorId: session.actorId,
        commercialSummary
      });
      const verifiedState = await fetchOfficeWorkspaceState(session.officeCalculationId);
      const officeSummary = verifiedState.calc_result?.commercial_summary;
      if (!officeSummary) throw new Error("Office bevestigde geen commerciele Calc-samenvatting.");
      const tolerance = 0.005;
      const checks:[number,number,string][] = [
        [Number(officeSummary.purchase), commercialSummary.purchase, "inkoop"],
        [Number(officeSummary.sales), commercialSummary.sales, "verkoop"],
        [Number(officeSummary.margin), commercialSummary.margin, "marge"],
        [Number(officeSummary.margin_pct), commercialSummary.margin_pct, "margepercentage"],
        [Number(officeSummary.vat), commercialSummary.vat, "btw"]
      ];
      for (const [actual, expected, label] of checks) {
        if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
          throw new Error(`Office bevestigde een afwijkende ${label}.`);
        }
      }
      officeSync={ok:true,snapshotId:published.snapshot_id,contentHash:published.content_hash};
    } catch(error) {
      officeSync={ok:false,error:error instanceof Error?error.message:"Office-sync mislukt."};
    }

    const summary = buildCommercialSummary({purchase:directCost,sales:salesPrice,vatRate});
    res.json({ directCost, markupAmount, salesPrice, margin:summary.margin, marginPct:summary.marginPct, vat:summary.vat, vatRate:summary.vatRate, officeSync });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
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
