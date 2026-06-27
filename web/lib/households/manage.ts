import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households, householdMembers, users } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";
import { isHouseholdMember } from "@/lib/auth/scoping";
import { type HouseholdDto, serializeHousehold } from "./serialize";

// Optional: seed default tags for a new household. Plan 2's domain layer does not own this;
// if a seeder exists at @/lib/domain or @/lib/households, call it here. Until then this is a no-op.
function seedDefaultTags(_db: Db, _householdId: string): void {
  // Intentionally empty — default-tag seeding is wired in a later plan (recipe tagging).
}

export function createHousehold(
  db: Db,
  userId: string,
  args: { name: string },
  now: Date,
): { id: string } {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new AuthError(404, "User not found.");
  if (!args.name.trim()) throw new AuthError(400, "Household name is required.");

  const id = randomUUID();
  db.insert(households).values({ id, name: args.name, createdAt: now }).run();
  db.insert(householdMembers)
    .values({ householdId: id, userId, role: "OWNER", joinedAt: now })
    .run();
  seedDefaultTags(db, id);

  const update: Partial<typeof users.$inferInsert> = {};
  if (!user.activeHouseholdId) update.activeHouseholdId = id;
  if (user.onboardingStep === "CREATE_HOUSEHOLD") update.onboardingStep = "COMPLETED";
  if (Object.keys(update).length > 0) {
    db.update(users).set(update).where(eq(users.id, userId)).run();
  }
  return { id };
}

export function listHouseholds(db: Db, userId: string): HouseholdDto[] {
  const memberships = db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .all();
  return memberships.map((m) => serializeHousehold(db, m.householdId, userId));
}

export function requireOwner(db: Db, userId: string, householdId: string): void {
  const row = db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
    .get();
  if (!row || row.role !== "OWNER") throw new AuthError(403, "Owner access required");
}

export function updateHousehold(
  db: Db,
  userId: string,
  householdId: string,
  args: { name: string },
): void {
  requireOwner(db, userId, householdId);
  if (!args.name.trim()) throw new AuthError(400, "Household name is required.");
  db.update(households).set({ name: args.name }).where(eq(households.id, householdId)).run();
}

export function updateHouseholdSettings(
  db: Db,
  userId: string,
  householdId: string,
  args: { aiEnabled?: boolean; geminiApiKey?: string },
): void {
  requireOwner(db, userId, householdId);
  const update: Partial<typeof households.$inferInsert> = {};
  if (args.aiEnabled !== undefined) update.aiEnabled = args.aiEnabled;
  if (args.geminiApiKey !== undefined) update.geminiApiKey = args.geminiApiKey;
  if (Object.keys(update).length > 0) {
    db.update(households).set(update).where(eq(households.id, householdId)).run();
  }
}

export function switchHousehold(db: Db, userId: string, householdId: string): void {
  if (!isHouseholdMember(db, userId, householdId)) {
    throw new AuthError(403, "Not a member of that household.");
  }
  db.update(users).set({ activeHouseholdId: householdId }).where(eq(users.id, userId)).run();
}
