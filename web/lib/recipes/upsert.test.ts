// web/lib/recipes/upsert.test.ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import {
  households, recipes, ingredients, units, recipeIngredients, cookingSteps, stepIngredients,
  tags, recipeTags,
} from "@/lib/db/schema";
import { upsertRecipe, type UpsertRecipeInput } from "./upsert";
import { AuthError } from "@/lib/auth/errors";

const now = new Date("2026-06-27T12:00:00Z");

function seed() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
  db.insert(units).values({ id: 1, nameDe: "Gramm", nameEn: "Gram", abbreviation: "g" }).run();
  db.insert(ingredients).values({ id: 1, nameDe: "Mehl", nameEn: "Flour", category: "PANTRY" }).run();
  db.insert(tags).values([
    { id: "t1", householdId: "h1", category: "CUISINE", nameEn: "Italian", nameDe: "Italienisch", isDefault: true },
    { id: "tX", householdId: "h2", category: "CUISINE", nameEn: "Foreign", nameDe: "Fremd", isDefault: true },
  ]).run();
  return db;
}

function baseInput(over: Partial<UpsertRecipeInput> = {}): UpsertRecipeInput {
  return {
    title: "Bread", description: "", listType: "TO_TRY", defaultServings: 2,
    prepTimeMinutes: 10, cookTimeMinutes: 30, leftoverDays: null,
    ingredients: [{ ingredientId: 1, nameEn: "Flour", nameDe: "Mehl", quantity: "500", unitId: 1, order: 0 }],
    steps: [{ method: "MANUAL", stepNumber: 1, instruction: "Mix", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [{ recipeIngredientOrder: 0, quantity: "500" }] }],
    tagIds: ["t1"],
    ...over,
  };
}

describe("upsertRecipe — create", () => {
  it("creates a recipe with ingredients, steps, step-ingredients and tags", () => {
    const db = seed();
    const { id } = upsertRecipe(db, "h1", null, baseInput(), now);
    expect(db.select().from(recipes).where(eq(recipes.id, id)).get()?.title).toBe("Bread");
    expect(db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).all()).toHaveLength(1);
    expect(db.select().from(cookingSteps).where(eq(cookingSteps.recipeId, id)).all()).toHaveLength(1);
    expect(db.select().from(recipeTags).where(eq(recipeTags.recipeId, id)).all()).toHaveLength(1);
    const si = db.select().from(stepIngredients).all();
    expect(si).toHaveLength(1);
  });

  it("auto-creates an ingredient referenced by name with no id", () => {
    const db = seed();
    const input = baseInput({
      ingredients: [{ ingredientId: null, nameEn: "Yeast", nameDe: "Hefe", quantity: "7", unitId: 1, order: 0 }],
      steps: [{ method: "MANUAL", stepNumber: 1, instruction: "Add", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [] }],
    });
    const { id } = upsertRecipe(db, "h1", null, input, now);
    const created = db.select().from(ingredients).where(eq(ingredients.nameEn, "Yeast")).get();
    expect(created).toBeDefined();
    const ri = db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).get();
    expect(ri?.ingredientId).toBe(created!.id);
  });

  it("drops tag ids not owned by the household", () => {
    const db = seed();
    const { id } = upsertRecipe(db, "h1", null, baseInput({ tagIds: ["t1", "tX"] }), now);
    const rt = db.select().from(recipeTags).where(eq(recipeTags.recipeId, id)).all();
    expect(rt).toHaveLength(1);
  });

  it("rejects step-ingredient over-allocation with 422", () => {
    const db = seed();
    const input = baseInput({
      steps: [{ method: "MANUAL", stepNumber: 1, instruction: "Mix", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [{ recipeIngredientOrder: 0, quantity: "999" }] }],
    });
    expect(() => upsertRecipe(db, "h1", null, input, now)).toThrow(AuthError);
  });

  it("rejects invalid machine program params with 422", () => {
    const db = seed();
    const input = baseInput({
      steps: [{ method: "MACHINE", stepNumber: 1, instruction: "", programType: "STEAMING", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [] }],
    });
    expect(() => upsertRecipe(db, "h1", null, input, now)).toThrow(AuthError); // STEAMING requires temperature + duration
  });
});

describe("upsertRecipe — edit", () => {
  it("replaces nested data on update", () => {
    const db = seed();
    const { id } = upsertRecipe(db, "h1", null, baseInput(), now);
    upsertRecipe(db, "h1", id, baseInput({
      title: "Sourdough",
      ingredients: [
        { ingredientId: 1, nameEn: "Flour", nameDe: "Mehl", quantity: "400", unitId: 1, order: 0 },
        { ingredientId: 1, nameEn: "Flour", nameDe: "Mehl", quantity: "100", unitId: 1, order: 1 },
      ],
      steps: [{ method: "MANUAL", stepNumber: 1, instruction: "Knead", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [] }],
    }), now);
    expect(db.select().from(recipes).where(eq(recipes.id, id)).get()?.title).toBe("Sourdough");
    expect(db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).all()).toHaveLength(2);
  });

  it("refuses to edit a cross-household recipe (404)", () => {
    const db = seed();
    const { id } = upsertRecipe(db, "h2", null, baseInput({ tagIds: ["tX"] }), now);
    expect(() => upsertRecipe(db, "h1", id, baseInput({ tagIds: [] }), now)).toThrow(AuthError);
  });
});
