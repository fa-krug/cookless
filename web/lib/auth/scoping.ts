import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { householdMembers } from "@/lib/db/schema";
import { AuthError } from "./errors";
import type { User } from "./session-store";

export function isHouseholdMember(db: Db, userId: string, householdId: string): boolean {
  const row = db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(eq(householdMembers.userId, userId), eq(householdMembers.householdId, householdId)))
    .get();
  return row != null;
}

/** Decision core of requireHousehold (port of Django require_household_member). */
export function assertHouseholdAccess(
  user: User,
  isMember: boolean,
): { user: User; householdId: string } {
  if (!user.activeHouseholdId) {
    throw new AuthError(403, "No active household");
  }
  if (!isMember) {
    throw new AuthError(403, "Not a member of active household");
  }
  return { user, householdId: user.activeHouseholdId };
}
