import { createHmac, timingSafeEqual } from "node:crypto";

export type IndependentOfficeSession = {
  v: 2;
  grantRef: string;
  calculationId: number;
  officeCalculationId: number;
  officeProjectId: number | null;
  actorId: string;
  exp: number;
};

export function parseIndependentOfficeSession(
  token: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): IndependentOfficeSession | null {
  if (!secret || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0] ?? "")
    || !/^[0-9a-f]{64}$/.test(parts[1] ?? "")) return null;
  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  if (!timingSafeEqual(expected, Buffer.from(parts[1], "hex"))) return null;
  try {
    const raw: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const session = raw as Partial<IndependentOfficeSession>;
    if (session.v !== 2
      || !/^[a-f0-9]{64}$/.test(String(session.grantRef ?? ""))
      || typeof session.actorId !== "string" || session.actorId.length < 1 || session.actorId.length > 128
      || session.actorId.trim() !== session.actorId
      || !Number.isSafeInteger(session.calculationId) || (session.calculationId ?? 0) <= 0
      || !Number.isSafeInteger(session.officeCalculationId) || (session.officeCalculationId ?? 0) <= 0
      || !(session.officeProjectId === null
        || (Number.isSafeInteger(session.officeProjectId) && (session.officeProjectId ?? 0) > 0))
      || !Number.isSafeInteger(session.exp) || (session.exp ?? 0) < now) return null;
    return session as IndependentOfficeSession;
  } catch {
    return null;
  }
}
