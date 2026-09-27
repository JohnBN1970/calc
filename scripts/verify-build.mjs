import { access } from "node:fs/promises";
import process from "node:process";

const required = [
  "apps/api/dist/startup.js",
  "apps/api/dist/index.js",
  "apps/web/dist/index.html",
  "startup.js"
];

const missing = [];
for (const file of required) {
  try {
    await access(file);
  } catch {
    missing.push(file);
  }
}

if (missing.length) {
  console.error("BREBO Calc build incomplete. Missing output: " + missing.join(", "));
  process.exit(1);
}

console.log("BREBO Calc build verified: API, web and Hostinger startup wrapper present.");
