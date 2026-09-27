import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql from "mysql2/promise";
import { config } from "./config.js";

export async function runMigrations(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(here, "../../../database");
  const retiredLegacyMigrations = new Set([
    "001_initial.sql",
    "002_line_price_sources.sql",
    "003_line_source_details.sql",
    "004_line_source_visual_page.sql",
    "005_line_offer_summary.sql",
    "006_line_source_visual_crop.sql",
    "007_line_source_visual_search_region.sql",
    "008_line_source_text_regions.sql",
    "009_line_source_position_bounds.sql"
  ]);

  const files = (await readdir(migrationsDir))
    .filter(file => /^\d+_.+\.sql$/.test(file))
    .filter(file => !retiredLegacyMigrations.has(file))
    .sort();

  const connection = await mysql.createConnection({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
    multipleStatements: true
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration VARCHAR(255) NOT NULL,
        applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (migration)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT migration FROM schema_migrations");
    const applied = new Set(rows.map(row => String(row.migration)));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.execute("INSERT INTO schema_migrations (migration) VALUES (?)", [file]);
        await connection.commit();
        console.log(`Applied Calc migration ${file}`);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
  } finally {
    await connection.end();
  }
}
