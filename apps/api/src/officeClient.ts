import { config } from "./config.js";
import { signedOfficeHeaders } from "./officeTransport.js";

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


export async function fetchOfficeProjectContext(projectId: number): Promise<OfficeProjectContext> {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error("Invalid Office project id.");
  }
  const path = `/api/workbench/v1/projects/${projectId}/calculation-context`;
  const response = await fetch(config.office.baseUrl + path, {
    method: "GET",
    headers: signedOfficeHeaders("GET", path),
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
    headers: signedOfficeHeaders("GET", path),
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
  const path = `/api/workbench/v2/calculations/${input.calculationId}/supplier-quotes`;
  const headers = signedOfficeHeaders("POST", path, input.bytes);
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


export async function fetchSupplierQuotePositionVisual(input: {
  calculationId: number;
  fileId: number;
  page: number;
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  const path = `/api/workbench/v2/calculations/${input.calculationId}/supplier-quotes/${input.fileId}/visual/${input.page}`;
  const response = await fetch(config.office.baseUrl + path, {
    method: "GET",
    headers: signedOfficeHeaders("GET", path),
    redirect: "error",
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Office quote visual failed with status ${response.status}.`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "image/jpeg" };
}


export async function fetchSupplierQuotePreview(input: {
  calculationId: number;
  fileId: number;
}): Promise<{ bytes: Uint8Array; contentType: string; contentDisposition: string | null }> {
  const path = `/api/workbench/v2/calculations/${input.calculationId}/supplier-quotes/${input.fileId}/preview`;
  const response = await fetch(config.office.baseUrl + path, {
    method: "GET",
    headers: signedOfficeHeaders("GET", path),
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


export type OfficeCalculationDocumentCandidatesResponse = {
  contract: "brebo-calculation-document-set-v1";
  set: {
    id: number;
    project_id: number;
    calculation_id: number;
    status: string;
    [key: string]: unknown;
  };
};

export async function refreshCalculationDocumentCandidates(input: {
  calculationId: number;
  projectId: number;
}): Promise<OfficeCalculationDocumentCandidatesResponse> {
  if (!Number.isInteger(input.calculationId) || input.calculationId <= 0) {
    throw new Error("Invalid Office calculation id.");
  }
  if (!Number.isInteger(input.projectId) || input.projectId <= 0) {
    throw new Error("Invalid Office project id.");
  }

  const path = `/api/workbench/v2/calculations/${input.calculationId}/document-set/propose`;
  const body = JSON.stringify({ project_id: input.projectId });
  const headers = signedOfficeHeaders("POST", path, body);
  headers["Content-Type"] = "application/json";

  const response = await fetch(config.office.baseUrl + path, {
    method: "POST",
    headers,
    body,
    redirect: "error",
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`Office document-set proposal failed with status ${response.status}: ${detail || response.statusText}`);
  }

  const payload = await response.json() as OfficeCalculationDocumentCandidatesResponse;
  if (
    payload.contract !== "brebo-calculation-document-set-v1" ||
    Number(payload.set?.calculation_id) !== input.calculationId ||
    Number(payload.set?.project_id) !== input.projectId
  ) {
    throw new Error("Office returned an invalid calculation document candidate contract.");
  }
  return payload;
}


export type OfficeCalculationContextSnapshot = {
  contract: "brebo-calculation-context-snapshot-v1";
  context: {
    calculation_id: number;
    project_id: number | null;
    document_set: {
      id: number;
      status: string;
      selection_version: string;
      created: number;
      changed: number;
    } | null;
    documents: Array<{
      item_id: number;
      document_id: number;
      title: string;
      document_type: string | null;
      document_family: string | null;
      mime_type: string | null;
      role: string | null;
      relevance: number;
      selection_source: string;
      review_status: string;
      exclusion_reason: string | null;
      document_number?: string | null;
      revision?: string | null;
      revision_date?: string | null;
      document_status?: string | null;
      issued_at?: string | null;
    }>;
    facts: Array<{
      id: number;
      document_id: number;
      fact_type: string;
      position_ref: string | null;
      value_text: string | null;
      value_number: number | null;
      unit: string | null;
      source_page: number | null;
      source_fragment: string | null;
      extraction_method: string | null;
      confidence: number;
      review_status: string;
    }>;
    position_scopes?: Array<{
      position_ref: string;
      building?: string | null;
      facade?: string | null;
      dwelling?: string | null;
      dwelling_type?: string | null;
      building_part?: string | null;
    }>;
    takeoff: Array<{
      id: number;
      position_ref: string;
      quantity: number;
      width_mm: number | null;
      height_mm: number | null;
      area_m2: number | null;
      perimeter_m: number | null;
      top_m: number | null;
      bottom_m: number | null;
      left_m: number | null;
      right_m: number | null;
    }>;
    review: {
      has_context: boolean;
      proposed_documents: number;
      proposed_facts: number;
      unresolved: string[];
    };
  };
};

export async function fetchCalculationContextSnapshot(calculationId: number): Promise<OfficeCalculationContextSnapshot> {
  if (!Number.isInteger(calculationId) || calculationId <= 0) {
    throw new Error("Invalid Office calculation id.");
  }
  const path = `/api/workbench/v2/calculations/${calculationId}/calculation-context`;
  const response = await fetch(config.office.baseUrl + path, {
    method: "GET",
    headers: signedOfficeHeaders("GET", path),
    redirect: "error",
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    throw new Error(`Office calculation context request failed with status ${response.status}.`);
  }
  const payload = await response.json() as OfficeCalculationContextSnapshot;
  if (
    payload.contract !== "brebo-calculation-context-snapshot-v1" ||
    Number(payload.context?.calculation_id) !== calculationId
  ) {
    throw new Error("Office returned an invalid calculation context snapshot.");
  }
  return payload;
}


export type OfficeWorkspaceState = {
  contract: "brebo-calculation-workspace-v2";
  calculation: {
    calculation_id: number;
    project_id?: number | null;
    [key:string]: unknown;
  };
  version: {
    version: string;
    status: string;
    locked_at: string | null;
    [key:string]: unknown;
  };
  editable: boolean;
  calc_result?: null | {
    snapshot_id: number;
    content_hash: string;
    published_by: number;
    published_at: number;
    calculation_id: number;
    office_version: string;
    calc_version: string;
    current_for_office_version?: boolean;
    commercial_summary: {
      purchase:number;
      sales:number;
      margin:number;
      margin_pct:number;
      vat:number;
      total_incl_vat:number;
      vat_rate:number|null;
      vat_breakdown:Array<{
        code:string;
        label:string;
        rate:number|null;
        taxable_base:number;
        vat_amount:number;
        reverse_charged:boolean;
      }>;
    };
  };
  [key:string]: unknown;
};

export async function fetchOfficeWorkspaceState(calculationId:number): Promise<OfficeWorkspaceState> {
  const path = `/api/workbench/v2/calculations/${calculationId}`;
  const response = await fetch(config.office.baseUrl + path, {
    method: "GET",
    headers: signedOfficeHeaders("GET", path),
    redirect: "error",
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Office workspace state failed with status ${response.status}.`);
  const payload = await response.json() as OfficeWorkspaceState;
  if (payload.contract !== "brebo-calculation-workspace-v2" || Number(payload.calculation?.calculation_id) !== calculationId) {
    throw new Error("Office returned an invalid workspace state.");
  }
  return payload;
}

export type OfficeCalcSourceResolution = {
  contract: "brebo-office-calc-source-resolution-v1";
  project_id: number | null;
  results: Array<
    | {
        request_index:number;
        type:string;
        ref:string;
        status:"resolved";
        value:number;
        unit:string|null;
        description:string;
        source:Record<string,unknown>;
      }
    | {
        request_index:number;
        type:string;
        ref:string;
        status:"unresolved";
        value:null;
        unit:null;
        description:string;
        source:Record<string,unknown>;
        reason:string;
      }
  >;
};

export async function resolveOfficeCalcSources(input:{
  projectId:number;
  sources:Array<{type:string;ref:string;context?:Record<string,unknown>}>;
}):Promise<OfficeCalcSourceResolution> {
  const path="/api/workbench/v2/calc-sources/resolve";
  const body=JSON.stringify({
    project_id:input.projectId,
    sources:input.sources
  });
  const headers=signedOfficeHeaders("POST",path,body);
  headers["Content-Type"]="application/json";
  const response=await fetch(config.office.baseUrl+path,{
    method:"POST",
    headers,
    body,
    redirect:"error",
    signal:AbortSignal.timeout(10000)
  });
  const text=await response.text();
  let payload:any={};
  try{payload=text?JSON.parse(text):{};}catch{}
  if(!response.ok) throw new Error(payload?.message||`Office Calc source resolution failed with status ${response.status}.`);
  if(payload?.contract!=="brebo-office-calc-source-resolution-v1"||!Array.isArray(payload?.results)){
    throw new Error("Office returned an invalid Calc source resolution contract.");
  }
  return payload as OfficeCalcSourceResolution;
}
