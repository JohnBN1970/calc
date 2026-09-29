export type TakeoffBasis =
  | "area"
  | "perimeter"
  | "two_sides_plus_head"
  | "width"
  | "height";

export type GeometryInput = {
  widthMm: number;
  heightMm: number;
  quantity?: number;
};

export type TakeoffResult = {
  widthM: number;
  heightM: number;
  quantity: number;
  areaM2: number;
  perimeterM: number;
  twoSidesPlusHeadM: number;
  widthTotalM: number;
  heightTotalM: number;
};

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

export function calculateTakeoff(input: GeometryInput): TakeoffResult {
  const widthM = positive(input.widthMm, "widthMm") / 1000;
  const heightM = positive(input.heightMm, "heightMm") / 1000;
  const quantity = positive(input.quantity ?? 1, "quantity");

  return {
    widthM,
    heightM,
    quantity,
    areaM2: widthM * heightM * quantity,
    perimeterM: 2 * (widthM + heightM) * quantity,
    twoSidesPlusHeadM: (2 * heightM + widthM) * quantity,
    widthTotalM: widthM * quantity,
    heightTotalM: heightM * quantity
  };
}

export function takeoffBasisValue(result: TakeoffResult, basis: TakeoffBasis): number {
  switch (basis) {
    case "area": return result.areaM2;
    case "perimeter": return result.perimeterM;
    case "two_sides_plus_head": return result.twoSidesPlusHeadM;
    case "width": return result.widthTotalM;
    case "height": return result.heightTotalM;
  }
}


export type AssemblyPart = GeometryInput & {
  ref: string;
  xMm: number;
  yMm: number;
};

export type AssemblyJoint = {
  ref: string;
  lengthMm: number;
  quantity?: number;
};

export type AssemblyTakeoffResult = TakeoffResult & {
  partAreaM2: number;
  internalJointM: number;
  partCount: number;
  jointCount: number;
};

export function calculateAssemblyTakeoff(
  outer: GeometryInput,
  parts: AssemblyPart[] = [],
  joints: AssemblyJoint[] = []
): AssemblyTakeoffResult {
  const result = calculateTakeoff(outer);
  const partAreaM2 = parts.reduce((total, part) => total + calculateTakeoff(part).areaM2, 0);
  const internalJointM = joints.reduce((total, joint) => {
    const lengthM = positive(joint.lengthMm, "joint.lengthMm") / 1000;
    const quantity = positive(joint.quantity ?? 1, "joint.quantity");
    return total + lengthM * quantity;
  }, 0);

  return {
    ...result,
    partAreaM2: parts.length ? partAreaM2 : result.areaM2,
    internalJointM,
    partCount: parts.length || 1,
    jointCount: joints.length
  };
}
