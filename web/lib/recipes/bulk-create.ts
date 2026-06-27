import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  recipes, recipeIngredients, cookingSteps, recipeTags, ingredients, units, tags,
} from "@/lib/db/schema";
import { processToWebp, writeRecipeImage } from "@/lib/images/storage";

export interface BulkIngredientInput {
  nameEn: string;
  nameDe: string;
  category: string;
  quantity: string;
  unitAbbreviation: string;
  order: number;
}
export interface BulkStepInput {
  stepNumber: number;
  instruction: string;
  programType?: string;
  temperature?: number | null;
  durationSeconds?: number | null;
  speed?: number | null;
  turbo?: boolean;
  direction?: string;
  weightGrams?: number | null;
}
export interface BulkRecipeInput {
  title: string;
  description?: string;
  defaultServings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  leftoverDays: number | null;
  ingredients: BulkIngredientInput[];
  manualSteps: BulkStepInput[];
  machineSteps: BulkStepInput[];
  tagIds: string[];
  imageBase64?: string | null;
}

export async function bulkCreateRecipes(
  db: Db,
  householdId: string,
  input: { recipes: BulkRecipeInput[] },
  now: Date,
): Promise<{ createdIds: string[] }> {
  // Pre-process images OUTSIDE the (synchronous) transaction. Map index -> webp bytes (or null).
  const recipeIds = input.recipes.map(() => randomUUID());
  const processedImages: (Buffer | null)[] = await Promise.all(
    input.recipes.map(async (r) => {
      if (!r.imageBase64) return null;
      try {
        return await processToWebp(Buffer.from(r.imageBase64, "base64"));
      } catch {
        return null; // silently skip invalid images (parity)
      }
    }),
  );

  // Lookup maps (case-insensitive), matching the Django pre-load.
  const unitMap = new Map(db.select().from(units).all().map((u) => [u.abbreviation.toLowerCase(), u.id]));
  const ingMap = new Map(db.select().from(ingredients).all().map((i) => [i.nameEn.toLowerCase(), i.id]));

  db.transaction((tx) => {
    input.recipes.forEach((r, idx) => {
      const id = recipeIds[idx];
      const webp = processedImages[idx];
      const image = webp ? writeRecipeImage(id, webp, now) : "";

      tx.insert(recipes).values({
        id, householdId, title: r.title, description: r.description ?? "", listType: "TO_TRY",
        defaultServings: r.defaultServings, prepTimeMinutes: r.prepTimeMinutes,
        cookTimeMinutes: r.cookTimeMinutes, leftoverDays: r.leftoverDays, image,
        createdAt: now, updatedAt: now,
      }).run();

      for (const ing of r.ingredients) {
        const unitId = unitMap.get(ing.unitAbbreviation.toLowerCase());
        if (unitId === undefined) continue; // skip unknown units
        let ingredientId = ingMap.get(ing.nameEn.toLowerCase());
        if (ingredientId === undefined) {
          ingredientId = tx
            .insert(ingredients)
            .values({ nameEn: ing.nameEn, nameDe: ing.nameDe, category: ing.category })
            .returning({ id: ingredients.id })
            .get().id;
          ingMap.set(ing.nameEn.toLowerCase(), ingredientId);
        }
        tx.insert(recipeIngredients).values({
          recipeId: id, ingredientId, quantity: ing.quantity, unitId, order: ing.order,
        }).run();
      }

      const insertSteps = (steps: BulkStepInput[], method: "MANUAL" | "MACHINE") => {
        for (const s of steps) {
          tx.insert(cookingSteps).values({
            recipeId: id, method, stepNumber: s.stepNumber, instruction: s.instruction,
            programType: s.programType ?? "", temperature: s.temperature ?? null,
            durationSeconds: s.durationSeconds ?? null, speed: s.speed ?? null,
            turbo: s.turbo ?? false, direction: s.direction ?? "", weightGrams: s.weightGrams ?? null,
          }).run();
        }
      };
      insertSteps(r.manualSteps, "MANUAL");
      insertSteps(r.machineSteps, "MACHINE");

      if (r.tagIds.length) {
        const allowed = tx
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.householdId, householdId), inArray(tags.id, r.tagIds)))
          .all();
        if (allowed.length) {
          tx.insert(recipeTags).values(allowed.map((t) => ({ recipeId: id, tagId: t.id }))).run();
        }
      }
    });
  });

  return { createdIds: recipeIds };
}
