import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households, householdMembers, users } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";
import { consumeInvite, createInvite, validateInvite } from "./invites";
import { requireOwner } from "./manage";
import { isHouseholdMember } from "@/lib/auth/scoping";

export interface MemberDto {
  id: number;
  userId: string;
  email: string;
  role: string;
  joinedAt: Date;
}

function clearActiveHouseholdIfPointingHere(db: Db, userId: string, householdId: string): void {
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  if (u?.activeHouseholdId === householdId) {
    db.update(users).set({ activeHouseholdId: null }).where(eq(users.id, userId)).run();
  }
}

export function listMembers(db: Db, householdId: string): MemberDto[] {
  return db
    .select({
      id: householdMembers.id,
      userId: householdMembers.userId,
      email: users.email,
      role: householdMembers.role,
      joinedAt: householdMembers.joinedAt,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, householdId))
    .all();
}

function memberById(db: Db, householdId: string, memberId: number) {
  const m = db
    .select()
    .from(householdMembers)
    .where(and(eq(householdMembers.id, memberId), eq(householdMembers.householdId, householdId)))
    .get();
  if (!m) throw new AuthError(404, "Member not found.");
  return m;
}

export function leaveHousehold(db: Db, userId: string, householdId: string): void {
  const me = db
    .select()
    .from(householdMembers)
    .where(and(eq(householdMembers.userId, userId), eq(householdMembers.householdId, householdId)))
    .get();
  if (!me) throw new AuthError(403, "Not a member of that household.");

  const others = db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .all()
    .filter((m) => m.userId !== userId);
  if (me.role === "OWNER" && others.length > 0) {
    throw new AuthError(400, "Transfer ownership before leaving.");
  }
  db.delete(householdMembers).where(eq(householdMembers.id, me.id)).run();
  clearActiveHouseholdIfPointingHere(db, userId, householdId);
}

export function removeMember(
  db: Db,
  actorId: string,
  householdId: string,
  memberId: number,
): void {
  requireOwner(db, actorId, householdId);
  const member = memberById(db, householdId, memberId);
  if (member.userId === actorId) {
    throw new AuthError(400, "Use leave to remove yourself.");
  }
  db.delete(householdMembers).where(eq(householdMembers.id, member.id)).run();
  clearActiveHouseholdIfPointingHere(db, member.userId, householdId);
}

export function transferOwnership(
  db: Db,
  actorId: string,
  householdId: string,
  memberId: number,
): void {
  requireOwner(db, actorId, householdId);
  const target = memberById(db, householdId, memberId);
  db.update(householdMembers).set({ role: "OWNER" }).where(eq(householdMembers.id, target.id)).run();
  db.update(householdMembers)
    .set({ role: "MEMBER" })
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, actorId)))
    .run();
}

export function deleteHousehold(db: Db, userId: string, householdId: string): void {
  requireOwner(db, userId, householdId);
  const count = db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .all().length;
  if (count > 1) throw new AuthError(400, "You must be the sole member to delete a household.");
  db.delete(households).where(eq(households.id, householdId)).run(); // cascades members
  clearActiveHouseholdIfPointingHere(db, userId, householdId);
}

export function joinHousehold(
  db: Db,
  userId: string,
  code: string,
  now: Date,
): { id: string; name: string } {
  const invite = validateInvite(db, code, now);
  if (isHouseholdMember(db, userId, invite.householdId)) {
    throw new AuthError(400, "You are already a member of this household.");
  }
  const h = db.select().from(households).where(eq(households.id, invite.householdId)).get();
  if (!h) throw new AuthError(400, "Invalid invite code.");

  db.transaction(() => {
    db.insert(householdMembers)
      .values({ householdId: invite.householdId, userId, role: "MEMBER", joinedAt: now })
      .run();
    consumeInvite(db, invite.id, userId);
    const u = db.select().from(users).where(eq(users.id, userId)).get();
    if (u && !u.activeHouseholdId) {
      db.update(users).set({ activeHouseholdId: invite.householdId }).where(eq(users.id, userId)).run();
    }
  });
  return { id: h.id, name: h.name };
}

export function createHouseholdInvite(
  db: Db,
  userId: string,
  householdId: string,
  now: Date,
): { code: string; expiresAt: Date } {
  requireOwner(db, userId, householdId);
  const invite = createInvite(db, { householdId, createdById: userId }, now);
  return { code: invite.code, expiresAt: invite.expiresAt };
}
