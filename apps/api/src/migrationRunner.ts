import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql from "mysql2/promise";
import { config } from "./config.js";

export async function runMigrations(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(here, "../../../database");
  const files = (await readdir(migrationsDir))
    .filter(file => /^\d+_.+\.sql$/.test(file))
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
