// web/lib/meal-plan/setup.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households, recipes, recipeIngredients, recipeTags, tags, ingredients, units,
  mealPlans, mealPlanExcludedTags, planIterations, mealPlanEntries, shoppingLists,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mulberry32 } from "@/lib/domain/rng";
import { setupMealPlan, loadSelectablePools } from "./setup";
import { AuthError } from "@/lib/auth/errors";

const now = new Date("2026-06-27T12:00:00Z"); // a Saturday

function seed() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
  db.insert(ingredients).values([
    { id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" },
    { id: 2, nameEn: "Pasta", nameDe: "Nudeln", category: "PANTRY" },
  ]).run();
  db.insert(tags).values({ id: "tEx", householdId: "h1", category: "DIETARY", nameEn: "Spicy", nameDe: "Scharf" }).run();
  // 4 KNOWN + 2 TO_TRY recipes, each with one ingredient.
  const recRows = [
    ...["k1", "k2", "k3", "k4"].map((id) => ({ id, householdId: "h1", title: id, description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now })),
    ...["t1", "t2"].map((id) => ({ id, householdId: "h1", title: id, description: "", listType: "TO_TRY", defaultServings: 2, createdAt: now, updatedAt: now })),
  ];
  db.insert(recipes).values(recRows).run();
  for (const r of recRows) {
    db.insert(recipeIngredients).values({ recipeId: r.id, ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
  }
  db.insert(recipeTags).values({ recipeId: "k4", tagId: "tEx" }).run(); // k4 is excluded when tEx excluded
  return db;
}

describe("loadSelectablePools", () => {
  it("excludes recipes carrying an excluded tag", () => {
    const db = seed();
    const { known } = loadSelectablePools(db, "h1", ["tEx"]);
    expect(known.map((r) => r.id).sort()).toEqual(["k1", "k2", "k3"]);
  });
});

describe("setupMealPlan", () => {
  it("creates the plan, one active iteration, entries, and shopping lists", () => {
    const db = seed();
    const { iterationId } = setupMealPlan(
      db, "h1",
      { iterationWeeks: 1, shoppingDays: [1], servings: 4, knownRatio: 0.7, defaultLeftoverDays: 1, excludedTagIds: [] },
      now, mulberry32(42),
    );
    expect(db.select().from(mealPlans).where(eq(mealPlans.householdId, "h1")).get()).toBeDefined();
    const its = db.select().from(planIterations).all();
    expect(its.length).toBe(1);
    expect(its[0].status).toBe("ACTIVE");
    const entries = db.select().from(mealPlanEntries).where(eq(mealPlanEntries.iterationId, iterationId)).all();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.mealType === "LUNCH")).toBe(true);
    expect(entries.every((e) => e.servings === 4)).toBe(true);
    expect(db.select().from(shoppingLists).where(eq(shoppingLists.iterationId, iterationId)).all().length).toBeGreaterThan(0);
  });

  it("is idempotent: a second setup replaces (one plan, one iteration)", () => {
    const db = seed();
    const input = { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 0.7, defaultLeftoverDays: 1, excludedTagIds: [] };
    setupMealPlan(db, "h1", input, now, mulberry32(1));
    setupMealPlan(db, "h1", input, now, mulberry32(2));
    expect(db.select().from(mealPlans).where(eq(mealPlans.householdId, "h1")).all().length).toBe(1);
    expect(db.select().from(planIterations).all().length).toBe(1);
  });

  it("rejects invalid shopping days with 422", () => {
    const db = seed();
    expect(() =>
      setupMealPlan(db, "h1", { iterationWeeks: 1, shoppingDays: [], servings: 2, knownRatio: 0.7, defaultLeftoverDays: 1, excludedTagIds: [] }, now),
    ).toThrow(AuthError);
  });

  it("persists excluded tags", () => {
    const db = seed();
    setupMealPlan(db, "h1", { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 0.7, defaultLeftoverDays: 1, excludedTagIds: ["tEx"] }, now, mulberry32(1));
    expect(db.select().from(mealPlanExcludedTags).all().map((r) => r.tagId)).toEqual(["tEx"]);
  });
});
