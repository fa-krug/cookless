import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households } from "@/lib/db/schema";

/** Read AI settings for a household WITHOUT leaking the key (only whether it is set). */
export function getHouseholdAiSettings(db: Db, householdId: string): { aiEnabled: boolean; hasKey: boolean } {
  const row = db
    .select({ aiEnabled: households.aiEnabled, key: households.geminiApiKey })
    .from(households)
    .where(eq(households.id, householdId))
    .get();
  return { aiEnabled: row?.aiEnabled ?? false, hasKey: (row?.key ?? "") !== "" };
}
