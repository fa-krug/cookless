// web/lib/recipes/upsert.ts
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import {
  recipes, recipeIngredients, cookingSteps, stepIngredients, recipeTags, tags, ingredients,
} from "@/lib/db/schema";
import { validateStepIngredientTotals } from "@/lib/domain/recipes/step-validation";
import { validateProgramStep } from "@/lib/domain/recipes/program-validation";
import { createIngredient } from "./ingredients";

export interface UpsertIngredientInput {
  ingredientId: number | null; // null => auto-create from nameEn/nameDe
  nameEn: string;
  nameDe: string;
  quantity: string;
  unitId: number;
  order: number;
}
export interface UpsertStepIngredientInput {
  recipeIngredientOrder: number; // references UpsertIngredientInput.order
  quantity: string;
}
export interface UpsertStepInput {
  method: "MANUAL" | "MACHINE";
  stepNumber: number;
  instruction: string;
  programType: string; // "" for manual / free-text machine steps
  temperature: number | null;
  durationSeconds: number | null;
  speed: number | null;
  turbo: boolean;
  direction: string; // "" | "LEFT" | "RIGHT"
  weightGrams: number | null;
  ingredients: UpsertStepIngredientInput[];
}
export interface UpsertRecipeInput {
  title: string;
  description: string;
  listType: "KNOWN" | "TO_TRY";
  defaultServings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  leftoverDays: number | null;
  ingredients: UpsertIngredientInput[];
  steps: UpsertStepInput[];
  tagIds: string[];
}

function validate(input: UpsertRecipeInput): void {
  if (!input.title.trim()) throw new AuthError(422, "Title is required");
  if (input.defaultServings < 1) throw new AuthError(422, "Servings must be at least 1");

  // Reject blank quantities before any Decimal parsing.
  for (const ing of input.ingredients) {
    if (ing.quantity.trim() === "") throw new AuthError(422, "Quantity is required");
  }
  const allStepIngredientsEarly = input.steps.flatMap((s) => s.ingredients);
  for (const si of allStepIngredientsEarly) {
    if (si.quantity.trim() === "") throw new AuthError(422, "Quantity is required");
  }

  // Step-ingredient over-allocation (across all steps).
  const allStepIngredients = input.steps.flatMap((s) => s.ingredients);
  const totalErrors = validateStepIngredientTotals(
    input.ingredients.map((i) => ({ order: i.order, quantity: i.quantity })),
    allStepIngredients,
  );
  if (totalErrors.length > 0) throw new AuthError(422, totalErrors.join("; "));

  const validOrders = new Set(input.ingredients.map((i) => i.order));
  for (const step of input.steps) {
    for (const si of step.ingredients) {
      if (!validOrders.has(si.recipeIngredientOrder)) {
        throw new AuthError(422, `Step references unknown ingredient order ${si.recipeIngredientOrder}`);
      }
    }
    if (step.method === "MANUAL") {
      if (step.programType) throw new AuthError(422, "Manual steps cannot have a program type");
      if (!step.instruction.trim()) throw new AuthError(422, "Manual steps require an instruction");
    } else if (step.programType) {
      const errs = validateProgramStep(step.programType, {
        temperature: step.temperature,
        durationSeconds: step.durationSeconds,
        speed: step.speed,
        direction: step.direction || null,
        turbo: step.turbo,
        weightGrams: step.weightGrams,
      });
      if (errs.length > 0) throw new AuthError(422, errs.join("; "));
    } else if (!step.instruction.trim()) {
      throw new AuthError(422, "Free-text machine steps require an instruction");
    }
  }
}

export function upsertRecipe(
  db: Db,
  householdId: string,
  recipeId: string | null,
  input: UpsertRecipeInput,
  now: Date,
): { id: string } {
  validate(input);

  // Ownership check (edit) before opening the transaction.
  if (recipeId !== null) {
    const owned = db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
      .get();
    if (!owned) throw new AuthError(404, "Recipe not found");
  }

  return db.transaction((tx) => {
    const id = recipeId ?? randomUUID();
    const recipeRow = {
      title: input.title,
      description: input.description,
      listType: input.listType,
      defaultServings: input.defaultServings,
      prepTimeMinutes: input.prepTimeMinutes,
      cookTimeMinutes: input.cookTimeMinutes,
      leftoverDays: input.leftoverDays,
      updatedAt: now,
    };

    if (recipeId === null) {
      tx.insert(recipes).values({ id, householdId, image: "", createdAt: now, ...recipeRow }).run();
    } else {
      tx.update(recipes).set(recipeRow).where(eq(recipes.id, id)).run();
      tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).run();
      tx.delete(cookingSteps).where(eq(cookingSteps.recipeId, id)).run();
      tx.delete(recipeTags).where(eq(recipeTags.recipeId, id)).run();
      // stepIngredients cascade-delete with their cookingSteps (FK onDelete cascade).
    }

    // Ingredients (auto-create unknown), mapping order -> new recipeIngredient id.
    const orderToRiId = new Map<number, number>();
    for (const ing of input.ingredients) {
      const ingredientId =
        ing.ingredientId ?? createIngredient(tx as unknown as Db, { nameEn: ing.nameEn, nameDe: ing.nameDe }).id;
      const ri = tx
        .insert(recipeIngredients)
        .values({ recipeId: id, ingredientId, quantity: ing.quantity, unitId: ing.unitId, order: ing.order })
        .returning({ id: recipeIngredients.id })
        .get();
      orderToRiId.set(ing.order, ri.id);
    }

    // Steps + their step-ingredients.
    for (const step of input.steps) {
      const cs = tx
        .insert(cookingSteps)
        .values({
          recipeId: id, method: step.method, stepNumber: step.stepNumber, instruction: step.instruction,
          programType: step.programType, temperature: step.temperature, durationSeconds: step.durationSeconds,
          speed: step.speed, turbo: step.turbo, direction: step.direction, weightGrams: step.weightGrams,
        })
        .returning({ id: cookingSteps.id })
        .get();
      for (const si of step.ingredients) {
        const riId = orderToRiId.get(si.recipeIngredientOrder)!; // validated above
        tx.insert(stepIngredients).values({ stepId: cs.id, recipeIngredientId: riId, quantity: si.quantity }).run();
      }
    }

    // Tags — only those owned by the household.
    if (input.tagIds.length > 0) {
      const owned = tx
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.householdId, householdId), inArray(tags.id, input.tagIds)))
        .all();
      if (owned.length > 0) {
        tx.insert(recipeTags).values(owned.map((t) => ({ recipeId: id, tagId: t.id }))).run();
      }
    }

    return { id };
  });
}
