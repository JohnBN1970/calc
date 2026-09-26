import { createHash, createHmac, randomUUID } from "node:crypto";
import { config } from "./config.js";

export type OfficeProjectContext = {
  contract: "brebo-office-calc-context-v1";
  project: {
    id: number;
    code: string;
    title: string;
    status: string;
    client_name: string;
    client_organization: { id: number; title: string } | null;
    project_kind: string;
    disciplines: string[];
    description: string;
    buildings: Array<{ id: number; title: string }>;
  };
};

function signedHeaders(method: string, path: string, body = ""): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const requestId = randomUUID();
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = [method.toUpperCase(), path, bodyHash, timestamp, requestId].join("\n");
  const signature = createHmac("sha256", config.office.sharedSecret).update(canonical).digest("hex");
  return {
    Accept: "application/json",
    "X-BREBO-Timestamp": timestamp,
    "X-BREBO-Request-Id": requestId,
    "X-BREBO-Signature": `v1=${signature}`
  };
}

export async function fetchOfficeProjectContext(projectId: number): Promise<OfficeProjectContext> {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error("Invalid Office project id.");
  }
  const path = `/api/workbench/v1/projects/${projectId}/calculation-context`;
  const response = await fetch(config.office.baseUrl + path, {
    method: "GET",
    headers: signedHeaders("GET", path),
    redirect: "error",
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) {
    throw new Error(`Office context request failed with status ${response.status}.`);
  }
  const payload = await response.json() as OfficeProjectContext;
  if (payload.contract !== "brebo-office-calc-context-v1" || payload.project?.id !== projectId) {
    throw new Error("Office returned an invalid Calc context contract.");
  }
  return payload;
}
