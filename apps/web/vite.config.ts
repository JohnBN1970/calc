import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build-time asset base must match the runtime CALC_BASE_PATH and proxy route.
// Root remains the default for existing Hostinger deployments.
const raw = (process.env.VITE_CALC_BASE_PATH ?? "/").trim();
if (raw !== "/" && (!/^\/[a-zA-Z0-9/_-]+$/.test(raw) || raw.includes("//") || raw.includes(".."))) {
  throw new Error("VITE_CALC_BASE_PATH must be a safe absolute URL path.");
}
const base = raw === "/" ? "/" : raw.replace(/\/$/, "") + "/";

export default defineConfig({
  plugins: [react()],
  base
});
