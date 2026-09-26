import express from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "./db.js";
import { config } from "./config.js";

type LineInput = {
  id?: number;
  parentId?: number | null;
  sortOrder: number;
  lineType: "chapter" | "paragraph" | "item" | "allowance" | "adjustable" | "option" | "note";
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

app.get("/api/calculations", async (_req, res) => {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id, office_project_id, code, title, status, updated_at FROM calculations ORDER BY updated_at DESC LIMIT 100"
  );
  res.json({ items: rows });
});

app.post("/api/calculations", async (req, res) => {
  const officeProjectId = Number(req.body?.officeProjectId ?? 0);
  const code = String(req.body?.code ?? "").trim();
  const title = String(req.body?.title ?? "").trim();
  if (!Number.isInteger(officeProjectId) || officeProjectId <= 0 || !code || !title) {
    res.status(400).json({ error: "officeProjectId, code en title zijn verplicht." });
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [calculationResult] = await connection.execute<ResultSetHeader>(
      "INSERT INTO calculations (office_project_id, code, title) VALUES (?, ?, ?)",
      [officeProjectId, code, title]
    );
    const [versionResult] = await connection.execute<ResultSetHeader>(
      "INSERT INTO calculation_versions (calculation_id, version_no) VALUES (?, 1)",
      [calculationResult.insertId]
    );
    await connection.commit();
    res.status(201).json({ id: calculationResult.insertId, versionId: versionResult.insertId, versionNo: 1 });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.get("/api/calculations/:id/workbench", async (req, res) => {
  const calculationId = Number(req.params.id);
  const [calculations] = await db.execute<RowDataPacket[]>(
    "SELECT id, office_project_id, code, title, status FROM calculations WHERE id = ? LIMIT 1",
    [calculationId]
  );
  if (!calculations[0]) {
    res.status(404).json({ error: "Calculatie niet gevonden." });
    return;
  }

  const [versions] = await db.execute<RowDataPacket[]>(
    "SELECT id, version_no, status, direct_cost, markup_amount, sales_price FROM calculation_versions WHERE calculation_id = ? ORDER BY version_no DESC LIMIT 1",
    [calculationId]
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

  res.json({ calculation: calculations[0], version, lines });
});

app.put("/api/calculations/:id/workbench", async (req, res) => {
  const calculationId = Number(req.params.id);
  const markupPct = Number(req.body?.markupPct ?? 0);
  const lines = Array.isArray(req.body?.lines) ? req.body.lines as LineInput[] : [];
  if (!Number.isFinite(markupPct) || markupPct < -100 || markupPct > 1000) {
    res.status(400).json({ error: "Ongeldig opslagpercentage." });
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [versions] = await connection.execute<RowDataPacket[]>(
      "SELECT id, status FROM calculation_versions WHERE calculation_id = ? ORDER BY version_no DESC LIMIT 1 FOR UPDATE",
      [calculationId]
    );
    const version = versions[0];
    if (!version) {
      res.status(404).json({ error: "Calculatieversie niet gevonden." });
      await connection.rollback();
      return;
    }
    if (version.status !== "draft") {
      res.status(409).json({ error: "Alleen een conceptversie kan worden gewijzigd." });
      await connection.rollback();
      return;
    }

    await connection.execute("DELETE FROM calculation_lines WHERE version_id = ?", [version.id]);

    let directCost = 0;
    const temporaryIds = new Map<number, number>();
    for (const line of lines) {
      const quantity = Number(line.quantity ?? 0);
      const labour = Number(line.labourUnitCost ?? 0);
      const material = Number(line.materialUnitCost ?? 0);
      const equipment = Number(line.equipmentUnitCost ?? 0);
      const subcontracting = Number(line.subcontractingUnitCost ?? 0);
      const other = Number(line.otherUnitCost ?? 0);
      if (!["chapter", "paragraph", "note"].includes(line.lineType) && line.lineType !== "option") {
        directCost += quantity * (labour + material + equipment + subcontracting + other);
      }
      const parentId = line.parentId != null ? (temporaryIds.get(line.parentId) ?? null) : null;
      const [insert] = await connection.execute<ResultSetHeader>(
        `INSERT INTO calculation_lines
          (version_id, parent_id, sort_order, line_type, code, description, unit, quantity,
           labour_unit_cost, material_unit_cost, equipment_unit_cost, subcontracting_unit_cost, other_unit_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          version.id, parentId, line.sortOrder, line.lineType, line.code ?? null, line.description,
          line.unit ?? null, line.quantity ?? null, labour, material, equipment, subcontracting, other
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

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Interne fout in BREBO Calc." });
});

app.listen(config.port, () => {
  console.log(`BREBO Calc API listening on port ${config.port}`);
});
