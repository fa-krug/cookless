import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { DEFAULT_TAGS } from "./tag-defaults";
import { AuthError } from "@/lib/auth/errors";

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

const VALID_CATEGORIES = new Set(["DIETARY", "PROTEIN", "CUISINE", "MEAL_TYPE"]);

function ownedTag(db: Db, householdId: string, tagId: string) {
  const row = db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.householdId, householdId)))
    .get();
  if (!row) throw new AuthError(404, "Tag not found");
  return row;
}

export function createTag(
  db: Db,
  householdId: string,
  input: { category: string; nameEn: string; nameDe: string },
): { id: string } {
  if (!VALID_CATEGORIES.has(input.category)) {
    throw new AuthError(422, `Invalid category: ${input.category}`);
  }
  if (!input.nameEn.trim() || !input.nameDe.trim()) {
    throw new AuthError(422, "Tag names are required");
  }
  const id = randomUUID();
  db.insert(tags)
    .values({ id, householdId, category: input.category, nameEn: input.nameEn, nameDe: input.nameDe, isDefault: false })
    .run();
  return { id };
}

export function updateTag(
  db: Db,
  householdId: string,
  tagId: string,
  input: { nameEn: string; nameDe: string },
): void {
  ownedTag(db, householdId, tagId);
  if (!input.nameEn.trim() || !input.nameDe.trim()) {
    throw new AuthError(422, "Tag names are required");
  }
  db.update(tags).set({ nameEn: input.nameEn, nameDe: input.nameDe }).where(eq(tags.id, tagId)).run();
}

export function deleteTag(db: Db, householdId: string, tagId: string): void {
  ownedTag(db, householdId, tagId);
  db.delete(tags).where(eq(tags.id, tagId)).run();
}

export function resetTags(db: Db, householdId: string): void {
  db.transaction((tx) => {
    tx.delete(tags).where(eq(tags.householdId, householdId)).run();
    seedDefaultTags(tx as unknown as Db, householdId);
  });
}
