import { createHmac, timingSafeEqual } from "node:crypto";

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** Append an HMAC so the value can be detected if tampered. */
export function sign(value: string, secret: string): string {
  return `${value}.${hmac(value, secret)}`;
}

/** Return the original value iff the signature verifies, else null. */
export function unsign(signed: string, secret: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const provided = signed.slice(idx + 1);
  const expected = hmac(value, secret);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? value : null;
}
