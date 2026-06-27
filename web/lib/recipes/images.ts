import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { recipes } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";
import { processToWebp, writeRecipeImage, deleteImageFile } from "@/lib/images/storage";

function ownedRecipe(db: Db, householdId: string, recipeId: string): { image: string } {
  const row = db
    .select({ image: recipes.image })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
    .get();
  if (!row) throw new AuthError(404, "Recipe not found");
  return row;
}

export async function setRecipeImage(
  db: Db,
  householdId: string,
  recipeId: string,
  input: Buffer,
  now: Date,
): Promise<void> {
  const { image: old } = ownedRecipe(db, householdId, recipeId);
  const webp = await processToWebp(input);
  const rel = writeRecipeImage(recipeId, webp, now);
  if (old) deleteImageFile(old);
  db.update(recipes).set({ image: rel, updatedAt: now }).where(eq(recipes.id, recipeId)).run();
}

export function removeRecipeImage(db: Db, householdId: string, recipeId: string): void {
  const { image } = ownedRecipe(db, householdId, recipeId);
  if (image) deleteImageFile(image);
  db.update(recipes).set({ image: "" }).where(eq(recipes.id, recipeId)).run();
}
