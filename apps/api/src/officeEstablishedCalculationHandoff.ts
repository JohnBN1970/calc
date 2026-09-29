import type { EstablishedCalculation } from "./calculationEstablishmentGate.js";

export type OfficeEstablishedCalculationHandoff={
  contract:"brebo-calc-established-calculation-v1";
  calculationId:string;
  versionNo:number;
  establishedAt:string;
  contentHash:string;
  totals:{
    directCost:number;
    totalMarkup:number;
    salesPrice:number;
  };
};

export function createOfficeEstablishedCalculationHandoff(established:EstablishedCalculation):OfficeEstablishedCalculationHandoff{
  const {snapshot,contentHash}=established;
  if(!/^[a-f0-9]{64}$/.test(contentHash))throw new Error("Invalid calculation content hash.");
  return{
    contract:"brebo-calc-established-calculation-v1",
    calculationId:snapshot.calculationId,
    versionNo:snapshot.versionNo,
    establishedAt:snapshot.establishedAt,
    contentHash,
    totals:{
      directCost:snapshot.pricing.directCost,
      totalMarkup:snapshot.pricing.totalMarkup,
      salesPrice:snapshot.pricing.salesPrice
    }
  };
}
