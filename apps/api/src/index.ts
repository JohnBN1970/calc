import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Request, type Response } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "./db.js";
import { config } from "./config.js";
import { fetchOfficeProjectContext } from "./officeClient.js";

type LineType = "chapter" | "paragraph" | "item" | "allowance" | "adjustable" | "option" | "note";
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
};

type LaunchPayload = {
  v: 1;
  calculation_id: number;
  project_id: number;
  exp: number;
  nonce: string;
};

type SessionPayload = {
  v: 1;
  calculationId: number;
  officeCalculationId: number;
  officeProjectId: number;
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

app.post("/api/session/logout", (req, res) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
  res.status(204).end();
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
    "SELECT id, version_no, status, direct_cost, markup_amount, sales_price FROM calculation_versions WHERE calculation_id = ? ORDER BY version_no DESC LIMIT 1",
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
            subcontracting_unit_cost, other_unit_cost
       FROM calculation_lines
      WHERE version_id = ?
      ORDER BY sort_order, id`,
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
    lines
  });
});

app.put("/api/workbench/current", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const markupPct = Number(req.body?.markupPct ?? 0);
  const lines = Array.isArray(req.body?.lines) ? req.body.lines as LineInput[] : [];
  if (!Number.isFinite(markupPct) || markupPct < -100 || markupPct > 1000 || lines.length > 5000) {
    res.status(400).json({ error: "Ongeldige calculatie-invoer." });
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

    await connection.execute("DELETE FROM calculation_lines WHERE version_id = ?", [version.id]);

    let directCost = 0;
    const temporaryIds = new Map<number, number>();
    for (const line of lines) {
      if (!["chapter", "paragraph", "item", "allowance", "adjustable", "option", "note"].includes(line.lineType)) {
        throw new Error("Unknown line type.");
      }
      const quantity = numeric(line.quantity);
      const labour = numeric(line.labourUnitCost);
      const material = numeric(line.materialUnitCost);
      const equipment = numeric(line.equipmentUnitCost);
      const subcontracting = numeric(line.subcontractingUnitCost);
      const other = numeric(line.otherUnitCost);
      if (!["chapter", "paragraph", "note", "option"].includes(line.lineType)) {
        directCost += quantity * (labour + material + equipment + subcontracting + other);
      }
      const parentId = line.parentId != null ? (temporaryIds.get(line.parentId) ?? null) : null;
      const [insert] = await connection.execute<ResultSetHeader>(
        `INSERT INTO calculation_lines
          (version_id, parent_id, sort_order, line_type, code, description, unit, quantity,
           labour_unit_cost, material_unit_cost, equipment_unit_cost, subcontracting_unit_cost, other_unit_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          version.id, parentId, line.sortOrder, line.lineType, line.code ?? null,
          String(line.description ?? "").slice(0, 500), line.unit ?? null,
          line.quantity ?? null, labour, material, equipment, subcontracting, other
        ]
      );
      if (line.id != null) temporaryIds.set(line.id, insert.insertId);
    }

    const markupAmount = directCost * (markupPct / 100);
    const salesPrice = directCost + markupAmount;
    await connection.execute(
      "UPDATE calculation_versions SET direct_cost = ?, markup_amount = ?, sales_price = ? WHERE id = ?",
      [directCost, markupAmount, salesPrice, version.id]
    );
    await connection.commit();
    res.json({ directCost, markupAmount, salesPrice });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Interne fout in BREBO Calc." });
});

app.listen(config.port, () => {
  console.log(`BREBO Calc API listening on port ${config.port}`);
});
