import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_TTL_MS, getAuthSecret, getAllowedRpIds, resolveRpId } from "./config";
import { assertHouseholdAccess, isHouseholdMember } from "./scoping";
import { createSession, deleteSession, loadSession, type User } from "./session-store";
import { sign, unsign } from "./signing";

// Memoized per request: the layout, page, and i18n each resolve the session
// independently, so without cache() this HMAC verify + 2 SQLite reads runs
// several times per navigation.
export const getSession = cache(async (): Promise<User | null> => {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const id = unsign(raw, getAuthSecret());
  if (!id) return null;
  return loadSession(db, id, new Date());
});

export async function requireUser(): Promise<User> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

export async function requireHousehold(): Promise<{ user: User; householdId: string }> {
  const user = await requireUser();
  const member = user.activeHouseholdId
    ? isHouseholdMember(db, user.id, user.activeHouseholdId)
    : false;
  return assertHouseholdAccess(user, member);
}

export async function setSessionCookie(userId: string): Promise<void> {
  const id = createSession(db, userId, new Date());
  (await cookies()).set(SESSION_COOKIE, sign(id, getAuthSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) {
    const id = unsign(raw, getAuthSecret());
    if (id) deleteSession(db, id);
  }
  store.delete(SESSION_COOKIE);
}

/** RP id derived from the current request Host header (port-stripped, validated). */
export async function currentRpId(): Promise<string> {
  const host = (await headers()).get("host") ?? "localhost";
  return resolveRpId(host, getAllowedRpIds());
}
