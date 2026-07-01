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
    const { known, all } = loadSelectablePools(db, "h1", ["tEx"]);
    expect(known.map((r) => r.id).sort()).toEqual(["k1", "k2", "k3"]);
    expect(all.map((r) => r.id).sort()).toEqual(["k1", "k2", "k3", "k4", "t1", "t2"]); // all recipes, tags ignored
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

describe("populateIteration gap-fill (A1)", () => {
  // With one selected recipe over a 7-day iteration and 3 leftover days,
  // days 1/3/5 are empty and must be filled from OTHER recipes (variety),
  // so more than one distinct recipe appears. The old bug recycled the
  // single selected recipe -> exactly one distinct recipe.
  it("fills empty days from recipes outside the selected set", () => {
    const db = seed(); // 6 recipes total (k1-k4 KNOWN, t1-t2 TO_TRY)
    const { iterationId } = setupMealPlan(
      db, "h1",
      { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 1, defaultLeftoverDays: 3, excludedTagIds: [] },
      now, mulberry32(42),
    );
    const entries = db.select().from(mealPlanEntries).where(eq(mealPlanEntries.iterationId, iterationId)).all();
    const distinct = new Set(entries.map((e) => e.recipeId));
    expect(entries.length).toBe(7);           // all days filled
    expect(distinct.size).toBeGreaterThan(1); // gap-fill pulled OTHER recipes
  });

  // When every recipe is already selected, "others" is empty and Django falls
  // back to the full pool. A single-recipe household proves the fallback path:
  // no crash, all days filled, only that recipe used.
  it("falls back to the full pool when no other recipes exist", () => {
    const db = createTestDb();
    db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
    db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
    db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
    db.insert(recipes).values({ id: "only", householdId: "h1", title: "only", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now }).run();
    db.insert(recipeIngredients).values({ recipeId: "only", ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
    const { iterationId } = setupMealPlan(
      db, "h1",
      { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 1, defaultLeftoverDays: 3, excludedTagIds: [] },
      now, mulberry32(5),
    );
    const entries = db.select().from(mealPlanEntries).where(eq(mealPlanEntries.iterationId, iterationId)).all();
    expect(entries.length).toBe(7);
    expect(new Set(entries.map((e) => e.recipeId))).toEqual(new Set(["only"]));
  });

  // Django parity: excluded tags filter the SELECTION pool but NOT the gap-fill
  // pool. With r1 (untagged) selected and r2 (tagged-out) as the only "other"
  // recipe, r2 must appear on gap-fill days.
  it("ignores excluded tags in the gap-fill pool (Django parity)", () => {
    const db = createTestDb();
    db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
    db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
    db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
    db.insert(tags).values({ id: "tEx", householdId: "h1", category: "DIETARY", nameEn: "Spicy", nameDe: "Scharf" }).run();
    db.insert(recipes).values([
      { id: "r1", householdId: "h1", title: "r1", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
      { id: "r2", householdId: "h1", title: "r2", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
    ]).run();
    for (const id of ["r1", "r2"]) db.insert(recipeIngredients).values({ recipeId: id, ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
    db.insert(recipeTags).values({ recipeId: "r2", tagId: "tEx" }).run();
    const { iterationId } = setupMealPlan(
      db, "h1",
      { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 1, defaultLeftoverDays: 3, excludedTagIds: ["tEx"] },
      now, mulberry32(9),
    );
    const used = new Set(db.select().from(mealPlanEntries).where(eq(mealPlanEntries.iterationId, iterationId)).all().map((e) => e.recipeId));
    expect(used.has("r2")).toBe(true); // tagged-out recipe still reached gap-fill
  });
});
