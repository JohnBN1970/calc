/**
 * CRM-first draft editor contracts. Restrict inputs to the minimal line fields
 * already supported by the initial isolated Calc schema. Never accept SQL IDs
 * or ownership identifiers from the browser.
 */
export type CrmDraftLineInput = {
  description: string;
  unit: string;
  quantity: number;
  materialUnitCost: number;
  labourUnitCost: number;
};

export function parseCrmDraftLine(input: unknown): CrmDraftLineInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const x = input as Record<string, unknown>;
  const description = x.description;
  const unit = x.unit ?? "";
  const quantity = x.quantity ?? 1;
  const material = x.materialUnitCost ?? 0;
  const labour = x.labourUnitCost ?? 0;
  if (typeof description !== "string" || description.trim() !== description
    || description.length < 1 || description.length > 500
    || typeof unit !== "string" || unit.length > 32
    || ![quantity, material, labour].every(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100000000)
    || (quantity as number) === 0) return null;
  return {
    description,
    unit,
    quantity: quantity as number,
    materialUnitCost: material as number,
    labourUnitCost: labour as number
  };
}

export const CRM_DRAFT_ROUTE = "/api/crm-draft";
