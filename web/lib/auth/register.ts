import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { householdMembers, users } from "@/lib/db/schema";
import { consumeInvite, validateInvite } from "@/lib/households/invites";
import { AuthError } from "./errors";
import { hashPassword, validatePassword } from "./password";
import type { User } from "./session-store";

/** Role for a newly-registered user: OWNER if the invite creator is inactive (bootstrap), else MEMBER. */
export function roleForInviteCreator(db: Db, createdById: string): "OWNER" | "MEMBER" {
  const creator = db.select().from(users).where(eq(users.id, createdById)).get();
  return creator && !creator.isActive ? "OWNER" : "MEMBER";
}

export async function registerWithPassword(
  db: Db,
  args: { email: string; password: string; inviteCode: string },
  now: Date,
): Promise<User> {
  const invite = validateInvite(db, args.inviteCode, now);
  if (db.select().from(users).where(eq(users.email, args.email)).get()) {
    throw new AuthError(409, "A user with this email already exists.");
  }
  validatePassword(args.password, { email: args.email });

  const user = db
    .insert(users)
    .values({
      id: randomUUID(),
      email: args.email,
      password: await hashPassword(args.password),
      activeHouseholdId: invite.householdId,
      onboardingStep: "COMPLETED",
      createdAt: now,
    })
    .returning()
    .get();

  db.insert(householdMembers)
    .values({
      householdId: invite.householdId,
      userId: user.id,
      role: roleForInviteCreator(db, invite.createdById),
      joinedAt: now,
    })
    .run();

  consumeInvite(db, invite.id, user.id);
  return user;
}
