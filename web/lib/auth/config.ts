export const SESSION_COOKIE = "cookless_session";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (Django default)
export const CEREMONY_COOKIE = "cookless_ceremony";
export const CEREMONY_TTL_MS = 5 * 60 * 1000; // 5 minutes

const DEV_SECRET = "dev-insecure-secret-change-me";

function splitEnv(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : fallback;
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production");
  }
  return DEV_SECRET;
}

export function getRpName(): string {
  return process.env.WEBAUTHN_RP_NAME ?? "Cook Less";
}

export function getAllowedRpIds(): string[] {
  return splitEnv(process.env.WEBAUTHN_RP_ID, ["localhost"]);
}

export function getAllowedOrigins(): string[] {
  return splitEnv(process.env.WEBAUTHN_ORIGIN, ["http://localhost:3000"]);
}

/** Port of Django get_rp_id_for_request: host without port if allowed, else first allowed id. */
export function resolveRpId(host: string, allowedRpIds: string[]): string {
  const bare = host.split(":")[0];
  return allowedRpIds.includes(bare) ? bare : allowedRpIds[0];
}
