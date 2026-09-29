import { randomUUID } from "node:crypto";

export type ExecutionHandoffStatus = "planned" | "released";

export type ExecutionHandoffReference = {
  handoffId: string;
};

export function createExecutionHandoffReference(): ExecutionHandoffReference {
  return { handoffId: randomUUID() };
}

export type ExecutionHandoff = {
  contract: "brebo-calc-execution-handoff-v1";
  handoffId: string;
  calculationVersionId: number;
  projectId: number;
  groupRef: string;
  label: string;
  releasedAt: string;
  outputs: {
    purchaseListAvailable: boolean;
    workshopListAvailable: boolean;
    siteListAvailable: boolean;
  };
};

export function createExecutionHandoff(input: Omit<ExecutionHandoff, "contract">): ExecutionHandoff {
  if (!input.handoffId.trim()) throw new Error("handoffId is required.");
  if (!Number.isInteger(input.calculationVersionId) || input.calculationVersionId <= 0) throw new Error("Invalid calculation version.");
  if (!Number.isInteger(input.projectId) || input.projectId <= 0) throw new Error("Invalid project id.");
  if (!input.groupRef.trim() || !input.label.trim()) throw new Error("Handoff group and label are required.");
  return { contract: "brebo-calc-execution-handoff-v1", ...input };
}
