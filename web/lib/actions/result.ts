import { AuthError } from "@/lib/auth/errors";
import { requireHousehold } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { Db } from "@/lib/db";
import type { User } from "@/lib/auth/session-store";

export type Result<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export function fail(e: unknown): Result<never> {
  if (e instanceof AuthError) return { ok: false, status: e.status, message: e.message };
  throw e;
}

/** Runs `fn` inside a household-scoped, error-translated context for a server action. */
export async function withHousehold<T>(
  fn: (ctx: { db: Db; householdId: string; user: User; now: Date }) => Promise<T> | T,
): Promise<Result<T>> {
  try {
    const { user, householdId } = await requireHousehold();
    return { ok: true, data: await fn({ db, householdId, user, now: new Date() }) };
  } catch (e) {
    return fail(e);
  }
}
