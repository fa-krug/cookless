import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households, householdMembers } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";

export interface HouseholdDto {
  id: string;
  name: string;
  aiEnabled: boolean;
  geminiApiKeySet: boolean;
  role: string;
  memberCount: number;
}

export function serializeHousehold(db: Db, householdId: string, userId: string): HouseholdDto {
  const h = db.select().from(households).where(eq(households.id, householdId)).get();
  if (!h) throw new AuthError(404, "Household not found.");
  const membership = db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
    .get();
  const memberCount = db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .all().length;
  return {
    id: h.id,
    name: h.name,
    aiEnabled: h.aiEnabled,
    geminiApiKeySet: h.geminiApiKey !== "",
    role: membership?.role ?? "",
    memberCount,
  };
}
