export type SalesPriceComponentKind="general_costs"|"risk"|"profit"|"other";

export type SalesPriceComponent={
  kind:SalesPriceComponentKind;
  description:string;
  mode:"percentage"|"amount";
  value:number;
  sourceRef:string|null;
};

export type SalesPriceBuildUp={
  directCost:number;
  components:Array<SalesPriceComponent & {calculatedAmount:number;baseAmount:number}>;
  totalMarkup:number;
  salesPrice:number;
};

export function buildSalesPrice(directCost:number,components:SalesPriceComponent[]):SalesPriceBuildUp{
  if(!Number.isFinite(directCost)||directCost<0)throw new Error("Invalid direct cost.");
  let runningBase=directCost;
  let totalMarkup=0;
  const calculated=components.map(component=>{
    if(!component.description.trim())throw new Error("Sales price component description is required.");
    if(!["general_costs","risk","profit","other"].includes(component.kind))throw new Error("Invalid sales price component kind.");
    if(!["percentage","amount"].includes(component.mode))throw new Error("Invalid sales price component mode.");
    if(!Number.isFinite(component.value)||component.value<0)throw new Error(`Invalid sales price component value for ${component.description}.`);
    const baseAmount=runningBase;
    const calculatedAmount=component.mode==="percentage" ? baseAmount*(component.value/100) : component.value;
    totalMarkup+=calculatedAmount;
    runningBase+=calculatedAmount;
    return {...component,baseAmount,calculatedAmount};
  });
  return{directCost,components:calculated,totalMarkup,salesPrice:directCost+totalMarkup};
}
