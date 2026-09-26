import express from "express";
import { db } from "./db.js";
import { config } from "./config.js";

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
  const [rows] = await db.query(
    "SELECT id, office_project_id, code, title, status, updated_at FROM calculations ORDER BY updated_at DESC LIMIT 100"
  );
  res.json({ items: rows });
});

app.listen(config.port, () => {
  console.log(`BREBO Calc API listening on port ${config.port}`);
});
