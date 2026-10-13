/**
 * Shared URL-prefix contract for the Calc server and Office reverse proxy.
 * A prefix is opt-in; the root deployment remains unchanged.
 */
export function normalizeCalcBasePath(value: string | undefined): string {
  const raw = (value ?? "/").trim();
  if (raw === "" || raw === "/") return "";
  if (!/^\/[a-zA-Z0-9/_-]+$/.test(raw) || raw.includes("//") || raw.includes("..")) {
    throw new Error("CALC_BASE_PATH must be a safe absolute URL path.");
  }
  return raw.replace(/\/$/, "");
}

export function stripCalcBasePath(url: string, basePath: string): string | null {
  if (!basePath) return url;
  const pathname = url.split("?")[0];
  if (pathname !== basePath && !pathname.startsWith(basePath + "/")) return null;
  const suffix = url.slice(basePath.length);
  return !suffix || suffix.startsWith("?") ? "/" + suffix : suffix;
}

export function calcSessionCookiePath(basePath: string): string {
  return basePath || "/";
}
