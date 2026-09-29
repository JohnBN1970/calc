export type BundleIdentity = {
  projectCode: string;
  buildingRef?: string | null;
  facadeRef?: string | null;
  dwellingRef?: string | null;
  positionRef?: string | null;
  productRef?: string | null;
};

function clean(value?: string | null): string | null {
  const result = value?.trim();
  return result ? result : null;
}

export function bundleIdentityParts(identity: BundleIdentity): string[] {
  return [
    clean(identity.projectCode),
    clean(identity.buildingRef),
    clean(identity.facadeRef),
    clean(identity.dwellingRef),
    clean(identity.positionRef),
    clean(identity.productRef)
  ].filter((value): value is string => value != null);
}

export function bundleGroupRef(identity: BundleIdentity): string {
  const parts = bundleIdentityParts(identity);
  if (!parts.length) throw new Error("Bundle identity requires at least a project code.");
  return parts.join("/");
}

export function bundleLabel(identity: BundleIdentity): string {
  const parts = bundleIdentityParts(identity);
  if (!parts.length) throw new Error("Bundle identity requires at least a project code.");
  return parts.join(" | ");
}
