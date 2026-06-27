import type { Db } from "@/lib/db";
import { ingredients } from "@/lib/db/schema";

export function createIngredient(
  db: Db,
  input: { nameEn: string; nameDe: string; category?: string },
): { id: number } {
  const row = db
    .insert(ingredients)
    .values({ nameEn: input.nameEn, nameDe: input.nameDe, category: input.category ?? "OTHER" })
    .returning({ id: ingredients.id })
    .get();
  return { id: row.id };
}
