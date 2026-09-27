import { createHmac, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { db } from "./db.js";
import { config } from "./config.js";
import { fetchOfficeCalculationWorkspaceState, fetchOfficeProjectContext, fetchSupplierQuotePositionVisual, fetchSupplierQuotePreview, searchOfficeArticles, sendOfficeCalculationCommand, uploadSupplierQuoteToOffice } from "./officeClient.js";

type LineType = "chapter" | "paragraph" | "item" | "allowance" | "adjustable" | "option" | "note";
type PriceSourceType = "manual" | "article" | "recipe" | "supplier_quote";
type LineInput = {
  id?: number;
  parentId?: number | null;
  sortOrder: number;
  lineType: LineType;
  code?: string;
  description: string;
  unit?: string;
  quantity?: number | null;
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
  sourceVisualCrop?: { x: number; y: number; width: number; height: number } | null;
  sourceVisualSearchRegion?: { x: number; y: number; width: number; height: number } | null;
  sourceOfferSummary?: string | null;
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
  officeCalculationId: number;
  officeProjectId: number;
  officeActorId: number;
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
      !Number.isInteger(payload.officeCalculationId) ||
      !Number.isInteger(payload.officeProjectId) ||
      !Number.isInteger(payload.officeActorId) ||
      Number(payload.officeActorId) <= 0 ||
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
  } catch {
    res.status(502).json({ error: "Projectcontext kon niet uit BREBO Office worden opgehaald." });
    return;
  }

  try {
    await db.execute(
      "INSERT INTO launch_nonces (nonce, expires_at) VALUES (?, FROM_UNIXTIME(?))",
      [launch.nonce, launch.exp]
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
      res.status(409).json({ error: "Deze Calculatie-link is al gebruikt." });
      return;
    }
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const token = createSessionToken({
    v: 1,
    officeCalculationId: launch.calculation_id,
    officeProjectId: launch.project_id,
    officeActorId: launch.actor_id,
    exp: now + SESSION_SECONDS
  });
  res.setHeader("Set-Cookie", sessionCookie(token));
  res.json({
    status: "ok",
    calculationId: launch.calculation_id,
    officeCalculationId: launch.calculation_id,
    officeActorId: launch.actor_id,
    project: officeContext.project
  });
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

app.get("/api/office-workspace/state", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const [state, projectContext] = await Promise.all([
      fetchOfficeCalculationWorkspaceState(session.officeCalculationId),
      fetchOfficeProjectContext(session.officeProjectId)
    ]);
    res.setHeader("Cache-Control", "no-store, private");
    res.json({ ...state, project: projectContext.project });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    console.error("BREBO Calc Office workspace state failed:", detail);
    res.status(502).json({ error: `Calculatie kon niet uit BREBO Office worden geladen: ${detail}` });
  }
});

app.post("/api/office-workspace/rows", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const result = await sendOfficeCalculationCommand({
      method: "POST",
      path: `/api/workbench/v2/calculations/${session.officeCalculationId}/rows`,
      actorId: session.officeActorId,
      payload: req.body ?? {}
    });
    res.status(201).json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    res.status(502).json({ error: detail });
  }
});

app.patch("/api/office-workspace/rows/:rowId", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const rowId = Number(req.params.rowId);
  if (!Number.isInteger(rowId) || rowId <= 0) {
    res.status(400).json({ error: "Ongeldige calculatieregel." });
    return;
  }
  try {
    const result = await sendOfficeCalculationCommand({
      method: "PATCH",
      path: `/api/workbench/v2/calculations/${session.officeCalculationId}/rows/${rowId}`,
      actorId: session.officeActorId,
      payload: req.body ?? {}
    });
    res.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    res.status(502).json({ error: detail });
  }
});

app.delete("/api/office-workspace/rows/:rowId", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const rowId = Number(req.params.rowId);
  if (!Number.isInteger(rowId) || rowId <= 0) {
    res.status(400).json({ error: "Ongeldige calculatieregel." });
    return;
  }
  try {
    const result = await sendOfficeCalculationCommand({
      method: "DELETE",
      path: `/api/workbench/v2/calculations/${session.officeCalculationId}/rows/${rowId}`,
      actorId: session.officeActorId,
      payload: req.body ?? {}
    });
    res.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    res.status(502).json({ error: detail });
  }
});

app.post("/api/office-workspace/structure/groups", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const result = await sendOfficeCalculationCommand({
      method: "POST",
      path: `/api/workbench/v2/calculations/${session.officeCalculationId}/structure/groups`,
      actorId: session.officeActorId,
      payload: req.body ?? {}
    });
    res.status(201).json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    res.status(502).json({ error: detail });
  }
});

app.post("/api/office-workspace/structure/paragraphs", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const result = await sendOfficeCalculationCommand({
      method: "POST",
      path: `/api/workbench/v2/calculations/${session.officeCalculationId}/structure/paragraphs`,
      actorId: session.officeActorId,
      payload: req.body ?? {}
    });
    res.status(201).json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    res.status(502).json({ error: detail });
  }
});

app.patch("/api/office-workspace/parameters", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const result = await sendOfficeCalculationCommand({
      method: "PATCH",
      path: `/api/workbench/v2/calculations/${session.officeCalculationId}/parameters`,
      actorId: session.officeActorId,
      payload: req.body ?? {}
    });
    res.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Onbekende Office-fout";
    res.status(502).json({ error: detail });
  }
});

app.all("/api/workbench/current", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  res.status(410).json({
    error: "Deze lokale Calc-workbench is buiten gebruik. BREBO Office is de bron van calculatiestate en rekenresultaten."
  });
});

const apiDirectory = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(apiDirectory, "../../web/dist");
app.use(express.static(webDist, { index: false, maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"));
});

app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Interne fout in BREBO Calc." });
});

app.listen(config.port, () => {
  console.log(`BREBO Calc API listening on port ${config.port}`);
});
