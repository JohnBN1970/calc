import { randomUUID } from "node:crypto";

export type ProductionBundleStatus =
  | "planned"
  | "released"
  | "in_production"
  | "ready"
  | "dispatched"
  | "on_site"
  | "completed"
  | "blocked";

export type ProductionBundleReference = {
  bundleId: string;
  scanPath: string;
};

export function createProductionBundleReference(): ProductionBundleReference {
  const bundleId = randomUUID();
  return { bundleId, scanPath: `/production/bundles/${bundleId}` };
}

export function productionBundleScanPath(bundleId: string): string {
  const value = bundleId.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error("Invalid production bundle id.");
  }
  return `/production/bundles/${value}`;
}
