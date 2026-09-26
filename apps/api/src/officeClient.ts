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

function signedHeaders(method: string, path: string, body: string | Buffer = ""): Record<string, string> {
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


export async function uploadSupplierQuoteToOffice(input: {
  calculationId: number;
  lineRef: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  lineDescription?: string;
  lineQuantity?: number;
  lineUnit?: string;
}): Promise<{
  contract: string;
  source: { file_id: number; calculation_id: number; line_ref: string; filename: string; mime_type: string };
  extraction: { status: string; text: string; confidence: number; extractor: string };
  proposal: {
    status: string;
    target: { description: string; quantity: number | null; unit: string };
    candidates: Array<{ value: number; score: number; line_no: number; text: string }>;
    suggested: { value: number; score: number; line_no: number; text: string } | null;
  };
}> {
  const path = `/api/workbench/v1/calculations/${input.calculationId}/supplier-quotes`;
  const headers = signedHeaders("POST", path, input.bytes);
  headers["Content-Type"] = input.mimeType;
  headers["X-BREBO-Calculation-Id"] = String(input.calculationId);
  headers["X-BREBO-Line-Ref"] = input.lineRef;
  headers["X-BREBO-Filename"] = input.filename;
  headers["X-BREBO-Line-Description"] = (input.lineDescription ?? "").slice(0, 500);
  headers["X-BREBO-Line-Quantity"] = input.lineQuantity == null ? "" : String(input.lineQuantity);
  headers["X-BREBO-Line-Unit"] = (input.lineUnit ?? "").slice(0, 32);
  const response = await fetch(config.office.baseUrl + path, {
    method: "POST",
    headers,
    body: new Uint8Array(input.bytes),
    redirect: "error",
    signal: AbortSignal.timeout(35000)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`Office quote upload failed with status ${response.status}: ${detail || response.statusText}`);
  }
  return await response.json() as any;
}


export async function fetchSupplierQuotePreview(input: {
  calculationId: number;
  fileId: number;
}): Promise<{ bytes: Uint8Array; contentType: string; contentDisposition: string | null }> {
  const path = `/api/workbench/v1/calculations/${input.calculationId}/supplier-quotes/${input.fileId}/preview`;
  const response = await fetch(config.office.baseUrl + path, {
    method: "GET",
    headers: signedHeaders("GET", path),
    redirect: "error",
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    throw new Error(`Office quote preview failed with status ${response.status}.`);
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    contentDisposition: response.headers.get("content-disposition")
  };
}
