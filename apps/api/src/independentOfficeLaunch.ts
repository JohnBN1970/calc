import { createHmac, timingSafeEqual } from "node:crypto";

export type IndependentOfficeLaunch = {
  v: 2;
  grant_ref: string;
  calculation_id: number;
  project_id: number | null;
  actor_id: string;
  exp: number;
  nonce: string;
};

const encode = (text: string) => Buffer.from(text, "utf8").toString("base64url");

export function signIndependentOfficeLaunch(
  launch: IndependentOfficeLaunch,
  secret: string,
): string {
  if (!secret) throw new Error("Office signing secret required.");
  // Validate the complete payload before issuing any signed credential.
  validateIndependentOfficeLaunch(launch, Math.floor(Date.now() / 1000));
  const encoded = encode(JSON.stringify(launch));
  const signature = createHmac("sha256", secret).update(encoded).digest("hex");
  return encoded + "." + signature;
}

export function parseIndependentOfficeLaunch(
  token: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): IndependentOfficeLaunch {
  const parts = token.split(".");
  if (!secret || parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0] ?? "")
    || !/^[0-9a-f]{64}$/.test(parts[1] ?? "")) throw new Error("Invalid launch token.");
  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  const provided = Buffer.from(parts[1], "hex");
  if (!timingSafeEqual(expected, provided)) throw new Error("Invalid launch signature.");
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw new Error("Malformed launch token.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Malformed launch token.");
  const payload = raw as Partial<IndependentOfficeLaunch>;
  validateIndependentOfficeLaunch(payload, now);
  return payload as IndependentOfficeLaunch;
}

function validateIndependentOfficeLaunch(payload: Partial<IndependentOfficeLaunch>, now: number): void {
  if (payload.v !== 2 || typeof payload.actor_id !== "string"
    || payload.actor_id.trim() !== payload.actor_id || payload.actor_id.length < 1 || payload.actor_id.length > 128
    || !Number.isSafeInteger(payload.calculation_id) || (payload.calculation_id ?? 0) <= 0
    || !(payload.project_id === null || (Number.isSafeInteger(payload.project_id) && (payload.project_id ?? 0) > 0))
    || !Number.isSafeInteger(payload.exp) || (payload.exp ?? 0) < now || (payload.exp ?? 0) > now + 180
    || !/^[0-9a-f]{32}$/.test(String(payload.nonce ?? ""))
    || !/^[0-9a-f]{64}$/.test(String(payload.grant_ref ?? ""))) {
    throw new Error("Expired or malformed launch token.");
  }
}
