// web/lib/meal-plan/iterations.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households, recipes, recipeIngredients, ingredients, units,
  mealPlans, planIterations, mealPlanEntries,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mulberry32 } from "@/lib/domain/rng";
import { setupMealPlan } from "./setup";
import { renewIteration, generateNextIteration } from "./iterations";
import { AuthError } from "@/lib/auth/errors";

const now = new Date("2026-06-27T12:00:00Z");

function seededPlan() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
  db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
  const rows = ["k1", "k2", "k3", "k4", "k5", "k6"].map((id) => ({ id, householdId: "h1", title: id, description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now }));
  db.insert(recipes).values(rows).run();
  for (const r of rows) db.insert(recipeIngredients).values({ recipeId: r.id, ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
  const { iterationId } = setupMealPlan(db, "h1", { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 0.7, defaultLeftoverDays: 1, excludedTagIds: [] }, now, mulberry32(7));
  return { db, iterationId };
}

describe("renewIteration", () => {
  it("keeps the date window and replaces entries", () => {
    const { db, iterationId } = seededPlan();
    const before = db.select().from(planIterations).where(eq(planIterations.id, iterationId)).get()!;
    renewIteration(db, "h1", iterationId, mulberry32(99));
    const after = db.select().from(planIterations).where(eq(planIterations.id, iterationId)).get()!;
    expect(after.startDate).toBe(before.startDate);
    expect(after.endDate).toBe(before.endDate);
    expect(db.select().from(mealPlanEntries).where(eq(mealPlanEntries.iterationId, iterationId)).all().length).toBeGreaterThan(0);
  });
  it("refuses a cross-household iteration", () => {
    const { db, iterationId } = seededPlan();
    expect(() => renewIteration(db, "h2", iterationId, mulberry32(1))).toThrow(AuthError);
  });
});

function seededTwoIterations() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
  db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
  // 14 KNOWN recipes, leftoverDays:0 -> 7 cook days fully tile a 1-week iteration, no gap-fill.
  const rows = Array.from({ length: 14 }, (_, i) => ({
    id: `r${i}`, householdId: "h1", title: `r${i}`, description: "",
    listType: "KNOWN", defaultServings: 2, leftoverDays: 0, createdAt: now, updatedAt: now,
  }));
  db.insert(recipes).values(rows).run();
  for (const r of rows) db.insert(recipeIngredients).values({ recipeId: r.id, ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
  const { iterationId: it1 } = setupMealPlan(
    db, "h1",
    { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 1, defaultLeftoverDays: 0, excludedTagIds: [] },
    now, mulberry32(11),
  );
  const { iterationId: it2 } = generateNextIteration(db, "h1", now, mulberry32(12));
  return { db, it1, it2 };
}

function recipeSet(db: ReturnType<typeof createTestDb>, iterationId: string): Set<string> {
  return new Set(
    db.select({ recipeId: mealPlanEntries.recipeId }).from(mealPlanEntries)
      .where(eq(mealPlanEntries.iterationId, iterationId)).all().map((e) => e.recipeId),
  );
}

describe("renewIteration exclusion baseline (A2)", () => {
  it("excludes the date-previous iteration's recipes, not its own (Django parity)", () => {
    const { db, it1, it2 } = seededTwoIterations();
    const s1 = recipeSet(db, it1);
    const s2 = recipeSet(db, it2);
    // Preconditions: two disjoint 7-recipe iterations partitioning the 14 recipes.
    expect(s1.size).toBe(7);
    expect(s2.size).toBe(7);
    expect([...s2].some((id) => s1.has(id))).toBe(false);

    renewIteration(db, "h1", it2, mulberry32(13));
    const renewed = recipeSet(db, it2);
    // Django parity: renewed iteration avoids the DATE-PREVIOUS iteration (s1).
    // (Under the old own-set behavior it would exclude s2 and reselect s1.)
    expect([...renewed].some((id) => s1.has(id))).toBe(false);
    expect(renewed).toEqual(s2);
  });
});

describe("generateNextIteration", () => {
  it("archives the current iteration and creates a new active one", () => {
    const { db, iterationId } = seededPlan();
    const { iterationId: next } = generateNextIteration(db, "h1", now, mulberry32(3));
    const old = db.select().from(planIterations).where(eq(planIterations.id, iterationId)).get()!;
    const created = db.select().from(planIterations).where(eq(planIterations.id, next)).get()!;
    expect(old.status).toBe("ARCHIVED");
    expect(created.status).toBe("ACTIVE");
    expect(created.startDate > old.endDate).toBe(true);
  });
  it("throws when the household has no plan", () => {
    const { db } = seededPlan();
    expect(() => generateNextIteration(db, "h2", now, mulberry32(1))).toThrow(AuthError);
  });
});
