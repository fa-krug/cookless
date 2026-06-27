import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { DEFAULT_TAGS } from "./tag-defaults";

/** Seed default tags for a household. Idempotent — skips existing (category, nameEn) pairs. */
export function seedDefaultTags(db: Db, householdId: string): void {
  const existing = new Set(
    db
      .select({ category: tags.category, nameEn: tags.nameEn })
      .from(tags)
      .where(eq(tags.householdId, householdId))
      .all()
      .map((t) => `${t.category}::${t.nameEn}`),
  );

  const toCreate: (typeof tags.$inferInsert)[] = [];
  for (const [category, list] of Object.entries(DEFAULT_TAGS)) {
    for (const [nameEn, nameDe] of list) {
      if (!existing.has(`${category}::${nameEn}`)) {
        toCreate.push({ id: randomUUID(), householdId, category, nameEn, nameDe, isDefault: true });
      }
    }
  }
  if (toCreate.length > 0) db.insert(tags).values(toCreate).run();
}
