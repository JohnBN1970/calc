import type { ProductionBundleStatus } from "./productionBundle.js";

export type ProductionBundleDossierItem = {
  itemRef: string;
  profileRef?: string | null;
  pieceLengthMm?: number | null;
  quantity: number;
};

export type ProductionBundleDossierLink = {
  type: "office_document" | "drawing" | "photo" | "instruction" | "other";
  externalRef: string;
  title: string;
};

export type ProductionBundleDossier = {
  bundleId: string;
  label: string;
  groupRef: string;
  status: ProductionBundleStatus;
  destination?: string | null;
  items: ProductionBundleDossierItem[];
  links: ProductionBundleDossierLink[];
};

export function validateProductionBundleDossier(dossier: ProductionBundleDossier): ProductionBundleDossier {
  if (!dossier.bundleId.trim()) throw new Error("bundleId is required.");
  if (!dossier.label.trim()) throw new Error("label is required.");
  if (!dossier.groupRef.trim()) throw new Error("groupRef is required.");
  for (const item of dossier.items) {
    if (!item.itemRef.trim()) throw new Error("itemRef is required.");
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error("item quantity must be a positive integer.");
    if (item.pieceLengthMm != null && (!Number.isFinite(item.pieceLengthMm) || item.pieceLengthMm <= 0)) {
      throw new Error("pieceLengthMm must be positive.");
    }
  }
  for (const link of dossier.links) {
    if (!link.externalRef.trim() || !link.title.trim()) throw new Error("Bundle links require reference and title.");
  }
  return dossier;
}
