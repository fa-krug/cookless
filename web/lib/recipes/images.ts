import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households, ingredients, recipeIngredients, recipes } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";
import { processToWebp, writeRecipeImage, deleteImageFile } from "@/lib/images/storage";
import { buildImagePrompt } from "@/lib/ai/prompt";

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

export type ImageGenerator = (apiKey: string, prompt: string) => Promise<Buffer>;

export async function generateRecipeImageFromAI(
  db: Db,
  householdId: string,
  recipeId: string,
  now: Date,
  genImage: ImageGenerator,
): Promise<void> {
  const household = db
    .select({ aiEnabled: households.aiEnabled, key: households.geminiApiKey })
    .from(households)
    .where(eq(households.id, householdId))
    .get();
  if (!household) throw new AuthError(404, "Household not found");
  if (!household.aiEnabled) throw new AuthError(403, "AI features are disabled");
  if (!household.key) throw new AuthError(400, "Gemini API key not configured");

  const recipe = db
    .select({ title: recipes.title, oldImage: recipes.image })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
    .get();
  if (!recipe) throw new AuthError(404, "Recipe not found");

  const ingRows = db
    .select({ nameEn: ingredients.nameEn })
    .from(recipeIngredients)
    .innerJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
    .where(eq(recipeIngredients.recipeId, recipeId))
    .orderBy(recipeIngredients.order)
    .all();
  const names = ingRows.slice(0, 10).map((r) => r.nameEn);

  const bytes = await genImage(household.key, buildImagePrompt(recipe.title, names));
  const webp = await processToWebp(bytes);
  const rel = writeRecipeImage(recipeId, webp, now);
  if (recipe.oldImage) deleteImageFile(recipe.oldImage);
  db.update(recipes).set({ image: rel, updatedAt: now }).where(eq(recipes.id, recipeId)).run();
}

export function removeRecipeImage(db: Db, householdId: string, recipeId: string): void {
  const { image } = ownedRecipe(db, householdId, recipeId);
  if (image) deleteImageFile(image);
  db.update(recipes).set({ image: "" }).where(eq(recipes.id, recipeId)).run();
}
