import { config } from "./config.js";
import { signedOfficeHeaders } from "./officeTransport.js";

const GRANT_PATH = "/api/workbench/v1/calculation-grants/validate";

export type OfficeGrantCheck = {
  reference: string;
  actor_id: number | string;
  project_id: number | null;
  calculation_id: number;
};

/**
 * Returns false on any Office denial, timeout, malformed response or network
 * failure. Never interpret an unavailable Office server as authorization.
 * Called by Calc's opt-in protected route middleware and launch consumer.
 */
export async function isOfficeGrantActive(
  grant: OfficeGrantCheck,
  endpoint: string,
  timeoutMs = 2500,
): Promise<boolean> {
  const validActor = typeof grant.actor_id === "string"
    ? grant.actor_id.length > 0 && grant.actor_id.length <= 128 && grant.actor_id.trim() === grant.actor_id
    : Number.isSafeInteger(grant.actor_id) && grant.actor_id > 0;
  const validProject = grant.project_id === null
    || (Number.isSafeInteger(grant.project_id) && grant.project_id > 0);
  if (!/^[a-f0-9]{64}$/.test(grant.reference)
    || !validActor || !validProject
    || !Number.isSafeInteger(grant.calculation_id) || grant.calculation_id <= 0) {
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
