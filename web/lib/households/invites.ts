import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households, invites } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";

export type Invite = typeof invites.$inferSelect;

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateInviteCode(): string {
  return randomBytes(16).toString("base64url");
}

export function createInvite(
  db: Db,
  args: { householdId: string; createdById: string },
  now: Date,
): Invite {
  return db
    .insert(invites)
    .values({
      id: randomUUID(),
      householdId: args.householdId,
      createdById: args.createdById,
      code: generateInviteCode(),
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    })
    .returning()
    .get();
}

export function validateInvite(db: Db, code: string, now: Date): Invite {
  const inv = db.select().from(invites).where(eq(invites.code, code)).get();
  if (!inv) throw new AuthError(400, "Invalid invite code.");
  if (inv.expiresAt.getTime() <= now.getTime()) throw new AuthError(400, "This invite has expired.");
  if (inv.usedById) throw new AuthError(400, "This invite has already been used.");
  return inv;
}

export function consumeInvite(db: Db, inviteId: string, userId: string): void {
  db.update(invites).set({ usedById: userId }).where(eq(invites.id, inviteId)).run();
}

export function getInviteSummary(
  db: Db,
  code: string,
  now: Date,
): { householdName: string; expiresAt: Date } {
  const inv = validateInvite(db, code, now);
  const h = db.select().from(households).where(eq(households.id, inv.householdId)).get();
  if (!h) throw new AuthError(400, "Invalid invite code.");
  return { householdName: h.name, expiresAt: inv.expiresAt };
}
