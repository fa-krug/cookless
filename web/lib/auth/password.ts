import argon2 from "argon2";
import { AuthError } from "./errors";
import { COMMON_PASSWORDS } from "./common-passwords";

export const UNUSABLE_PASSWORD = "";

export function hasUsablePassword(hash: string): boolean {
  return hash !== UNUSABLE_PASSWORD;
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  if (!hasUsablePassword(hash)) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** Python difflib.SequenceMatcher.quick_ratio — what Django's similarity validator uses. */
function quickRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const counts = new Map<string, number>();
  for (const ch of b) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let matches = 0;
  for (const ch of a) {
    const n = counts.get(ch) ?? 0;
    if (n > 0) {
      matches += 1;
      counts.set(ch, n - 1);
    }
  }
  return (2 * matches) / (a.length + b.length);
}

const MAX_SIMILARITY = 0.7;

/** Ports Django's AUTH_PASSWORD_VALIDATORS chain; throws AuthError(400) on first failure. */
export function validatePassword(password: string, opts: { email?: string } = {}): void {
  // 1. UserAttributeSimilarityValidator (against the email and its parts).
  const email = opts.email?.toLowerCase();
  if (email) {
    const parts = new Set<string>([email, ...email.split(/[^a-z0-9]+/i)]);
    for (const part of parts) {
      if (part.length < 3) continue;
      if (quickRatio(password.toLowerCase(), part) >= MAX_SIMILARITY) {
        throw new AuthError(400, "The password is too similar to the email address.");
      }
    }
  }
  // 2. MinimumLengthValidator.
  if (password.length < 8) {
    throw new AuthError(400, "This password is too short. It must contain at least 8 characters.");
  }
  // 3. CommonPasswordValidator.
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new AuthError(400, "This password is too common.");
  }
  // 4. NumericPasswordValidator.
  if (/^\d+$/.test(password)) {
    throw new AuthError(400, "This password is entirely numeric.");
  }
}
