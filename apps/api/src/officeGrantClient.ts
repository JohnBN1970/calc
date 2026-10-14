import { config } from "./config.js";
import { signedOfficeHeaders } from "./officeTransport.js";

const GRANT_PATH = "/api/workbench/v1/calculation-grants/validate";

export type OfficeGrantCheck = {
  reference: string;
  actor_id: number;
  project_id: number;
  calculation_id: number;
};

/**
 * Returns false on any Office denial, timeout, malformed response or network
 * failure. Never interpret an unavailable Office server as authorization.
 * Not yet wired into Calc's protected route middleware.
 */
export async function isOfficeGrantActive(
  grant: OfficeGrantCheck,
  endpoint: string,
  timeoutMs = 2500,
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(grant.reference)
    || ![grant.actor_id, grant.project_id, grant.calculation_id]
      .every((value) => Number.isSafeInteger(value) && value > 0)) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password
    || url.search || url.hash || url.pathname !== GRANT_PATH) {
    return false;
  }
  const body = JSON.stringify(grant);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...signedOfficeHeaders("POST", GRANT_PATH, body),
        "Content-Type": "application/json",
      },
      body,
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return typeof result === "object" && result !== null
      && !Array.isArray(result)
      && (result as { active?: unknown }).active === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
