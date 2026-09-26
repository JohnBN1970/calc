import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql from "mysql2/promise";
import { config } from "./config.js";

async function migrateDatabase(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(here, "../../../database/001_initial.sql");
  const sql = await readFile(schemaPath, "utf8");

  const connection = await mysql.createConnection({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
    multipleStatements: true
  });

  try {
    await connection.query(sql);
    console.log("BREBO Calc database migration completed.");
  } finally {
    await connection.end();
  }
}

await migrateDatabase();
await import("./index.js");
