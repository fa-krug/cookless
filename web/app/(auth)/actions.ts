"use server";

import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { loginWithPassword } from "@/lib/auth/login";
import { removePassword, setPassword, skipPasskey } from "@/lib/auth/password-management";
import { registerWithPassword } from "@/lib/auth/register";
import { serializeUser, type UserDto } from "@/lib/auth/serialize";
import { clearSessionCookie, requireUser, setSessionCookie } from "@/lib/auth/session";
import {
  loginPasswordSchema,
  registerPasswordSchema,
  removePasswordSchema,
  setPasswordSchema,
} from "@/lib/schemas/auth";

type Result = { ok: true; user?: UserDto } | { ok: false; status: number; message: string };

function fail(e: unknown): Result {
  if (e instanceof AuthError) return { ok: false, status: e.status, message: e.message };
  throw e;
}

export async function loginPasswordAction(input: unknown): Promise<Result> {
  try {
    const { email, password } = loginPasswordSchema.parse(input);
    const user = await loginWithPassword(db, { email, password });
    await setSessionCookie(user.id);
    return { ok: true, user: serializeUser(db, user) };
  } catch (e) {
    return fail(e);
  }
}

export async function registerPasswordAction(input: unknown): Promise<Result> {
  try {
    const { email, password, inviteCode } = registerPasswordSchema.parse(input);
    const user = await registerWithPassword(db, { email, password, inviteCode }, new Date());
    await setSessionCookie(user.id);
    return { ok: true, user: serializeUser(db, user) };
  } catch (e) {
    return fail(e);
  }
}

export async function logoutAction(): Promise<Result> {
  await clearSessionCookie();
  return { ok: true };
}

export async function setPasswordAction(input: unknown): Promise<Result> {
  try {
    const user = await requireUser();
    await setPassword(db, user.id, setPasswordSchema.parse(input));
    // Re-issue a fresh session for the acting user (all sessions were deleted by setPassword)
    await setSessionCookie(user.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removePasswordAction(input: unknown): Promise<Result> {
  try {
    const user = await requireUser();
    await removePassword(db, user.id, removePasswordSchema.parse(input));
    // Re-issue a fresh session for the acting user (all sessions were deleted by removePassword)
    await setSessionCookie(user.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function skipPasskeyAction(): Promise<Result> {
  try {
    const user = await requireUser();
    skipPasskey(db, user.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
