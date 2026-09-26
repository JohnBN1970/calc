import { runMigrations } from "./migrationRunner.js";

await runMigrations();
console.log("BREBO Calc database migrations completed.");
