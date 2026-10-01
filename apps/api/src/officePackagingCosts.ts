import type { OfficeCostingInputLine } from "./officeRecipeLines.js";

export type OfficePackagingCostLine = OfficeCostingInputLine & {
  requiredQuantityInclWaste: number;
  packagingStatus: "ready" | "missing";
  orderUnit: string | null;
  conversionFactor: number | null;
  minimumOrder: number | null;
  orderUnitCount: number | null;
  purchasedQuantity: number | null;
  packagingRemainder: number | null;
  unitCost: number | null;
  totalMaterialCost: number | null;
  quantityFrom: number | null;
  priceTierSatisfied: boolean | null;
  priceDate: string | null;
};

export function officePackagingCostLines(lines: OfficeCostingInputLine[]): OfficePackagingCostLine[] {
  return lines.map(line => {
    const requiredQuantityInclWaste = line.quantity * (1 + line.wastePct / 100);
    const packaging = line.packaging;

    if (!packaging) {
      return {
        ...line,
        requiredQuantityInclWaste,
        packagingStatus: "missing" as const,
        orderUnit: null,
        conversionFactor: null,
        minimumOrder: null,
        orderUnitCount: null,
        purchasedQuantity: null,
        packagingRemainder: null,
        unitCost: line.officeUnitCost,
        totalMaterialCost: null,
        quantityFrom: null,
        priceTierSatisfied: null,
        priceDate: null
      };
    }

    const conversionFactor = Number(packaging.conversionFactor);
    const minimumOrder = Number(packaging.minimumOrder);
    const quantityFrom = Number(packaging.quantityFrom);
    const unitCost = line.officeUnitCost ?? Number(packaging.netPrice);

    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) throw new Error(`Invalid conversion factor for ${line.identity}.`);
    if (!Number.isFinite(minimumOrder) || minimumOrder < 0) throw new Error(`Invalid minimum order for ${line.identity}.`);
    if (!Number.isFinite(quantityFrom) || quantityFrom < 0) throw new Error(`Invalid price tier quantity for ${line.identity}.`);
    if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error(`Invalid unit cost for ${line.identity}.`);

    const rawOrderUnits = requiredQuantityInclWaste / conversionFactor;
    const orderUnitCount = Math.max(Math.ceil(rawOrderUnits), Math.ceil(minimumOrder));
    const purchasedQuantity = orderUnitCount * conversionFactor;
    const packagingRemainder = purchasedQuantity - requiredQuantityInclWaste;
    const totalMaterialCost = purchasedQuantity * unitCost;
    const priceTierSatisfied = purchasedQuantity >= quantityFrom;

    return {
      ...line,
      requiredQuantityInclWaste,
      packagingStatus: "ready" as const,
      orderUnit: packaging.orderUnit,
      conversionFactor,
      minimumOrder,
      orderUnitCount,
      purchasedQuantity,
      packagingRemainder,
      unitCost,
      totalMaterialCost,
      quantityFrom,
      priceTierSatisfied,
      priceDate: packaging.priceDate
    };
  });
}
