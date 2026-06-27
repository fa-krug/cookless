import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { AuthError } from "./errors";
import { isHouseholdMember } from "./scoping";
import type { User } from "./session-store";

const LANGUAGES = new Set(["en", "de"]);

export function updateUser(
  db: Db,
  userId: string,
  args: { preferredLanguage?: string; activeHouseholdId?: string },
): User {
  const update: Partial<typeof users.$inferInsert> = {};

  if (args.preferredLanguage !== undefined) {
    if (!LANGUAGES.has(args.preferredLanguage)) {
      throw new AuthError(400, "Unsupported language.");
    }
    update.preferredLanguage = args.preferredLanguage;
  }

  if (args.activeHouseholdId !== undefined) {
    if (!isHouseholdMember(db, userId, args.activeHouseholdId)) {
      throw new AuthError(403, "Not a member of that household.");
    }
    update.activeHouseholdId = args.activeHouseholdId;
  }

  const updated = db.update(users).set(update).where(eq(users.id, userId)).returning().get();
  if (!updated) throw new AuthError(404, "User not found.");
  return updated;
}
