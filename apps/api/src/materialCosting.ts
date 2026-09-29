export type PackagePrice = {
  articleRef: string;
  packageDescription: string;
  contentPerPackage: number;
  contentUnit: string;
  packagePrice: number;
  packagesPerOrderUnit?: number;
};

export type MaterialCostResult = {
  requiredQuantity: number;
  contentUnit: string;
  packageCount: number;
  orderUnitCount: number;
  purchasedQuantity: number;
  packagingRemainder: number;
  totalMaterialCost: number;
  effectiveCostPerRequiredUnit: number;
};

function positive(value:number,name:string){if(!Number.isFinite(value)||value<=0)throw new Error(`${name} must be positive.`);return value}

export function calculatePackagedMaterialCost(requiredQuantity:number,price:PackagePrice):MaterialCostResult{
  const required=positive(requiredQuantity,"requiredQuantity");
  const content=positive(price.contentPerPackage,"contentPerPackage");
  const packagePrice=positive(price.packagePrice,"packagePrice");
  const perOrder=positive(price.packagesPerOrderUnit??1,"packagesPerOrderUnit");
  if(!Number.isInteger(perOrder))throw new Error("packagesPerOrderUnit must be an integer.");

  const rawPackages=Math.ceil(required/content);
  const orderUnitCount=Math.ceil(rawPackages/perOrder);
  const packageCount=orderUnitCount*perOrder;
  const purchasedQuantity=packageCount*content;
  const totalMaterialCost=packageCount*packagePrice;

  return {
    requiredQuantity:required,
    contentUnit:price.contentUnit,
    packageCount,
    orderUnitCount,
    purchasedQuantity,
    packagingRemainder:purchasedQuantity-required,
    totalMaterialCost,
    effectiveCostPerRequiredUnit:totalMaterialCost/required
  };
}

export type SealantConsumptionInput = {
  lengthM:number;
  jointWidthMm:number;
  jointDepthMm:number;
};

export function sealantVolumeMl(input:SealantConsumptionInput):number{
  return positive(input.lengthM,"lengthM")*positive(input.jointWidthMm,"jointWidthMm")*positive(input.jointDepthMm,"jointDepthMm");
}
