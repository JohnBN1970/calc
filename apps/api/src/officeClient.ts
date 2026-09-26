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


export type OfficeArticleSearchItem = {
  article_id: number;
  supplier_article_id: number;
  price_id: number;
  catalog_import_id: number;
  code: string;
  description: string;
  cost_category: string;
  supplier: string;
  supplier_article_no: string;
  gtin: string | null;
  product_group: string | null;
  nlsfb_code: string | null;
  unit: string;
  order_unit: string | null;
  conversion_factor: number;
  minimum_order: number;
  net_price: number;
  gross_price: number | null;
  currency: string;
  price_date: string;
  quantity_from: number;
  product_url: string | null;
};

export async function searchOfficeArticles(params: {
  q?: string;
  supplier?: string;
  category?: string;
  limit?: number;
}): Promise<{ query: string; count: number; items: OfficeArticleSearchItem[] }> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.supplier) search.set("supplier", params.supplier);
  if (params.category) search.set("category", params.category);
  search.set("limit", String(Math.max(10, Math.min(100, params.limit ?? 40))));
  const path = `/api/workbench/v1/articles?${search.toString()}`;
  const response = await fetch(config.office.baseUrl + path, {
    method: "GET",
    headers: signedHeaders("GET", path),
    redirect: "error",
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) {
    throw new Error(`Office article search failed with status ${response.status}.`);
  }
  return await response.json() as { query: string; count: number; items: OfficeArticleSearchItem[] };
}
