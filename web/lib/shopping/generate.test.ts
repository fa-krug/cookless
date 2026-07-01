// web/lib/shopping/generate.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households, recipes, recipeIngredients, ingredients, units,
  mealPlans, planIterations, mealPlanEntries, shoppingLists, shoppingListItems,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateShoppingListsForIteration } from "./generate";

const now = new Date("2026-06-27T12:00:00Z");

function seed() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(ingredients).values([
    { id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" },
    { id: 2, nameEn: "Pasta", nameDe: "Nudeln", category: "PANTRY" },
  ]).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
  db.insert(recipes).values({ id: "r1", householdId: "h1", title: "Pasta", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now }).run();
  db.insert(recipeIngredients).values([
    { recipeId: "r1", ingredientId: 1, quantity: "200", unitId: 1, order: 0 },
    { recipeId: "r1", ingredientId: 2, quantity: "150", unitId: 1, order: 1 },
  ]).run();
  db.insert(mealPlans).values({ id: "mp1", householdId: "h1", shoppingDay1: 1, servings: 4, knownRatio: "0.7", defaultLeftoverDays: 1, createdAt: now }).run();
  db.insert(planIterations).values({ id: "it1", mealPlanId: "mp1", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now }).run();
  // Monday 2026-06-22 is weekday 1. One real lunch + one leftover (excluded from aggregation).
  db.insert(mealPlanEntries).values([
    { id: "e1", iterationId: "it1", date: "2026-06-22", mealType: "LUNCH", recipeId: "r1", servings: 4, isLeftover: false, isLocked: false },
    { id: "e2", iterationId: "it1", date: "2026-06-23", mealType: "LUNCH", recipeId: "r1", servings: 4, isLeftover: true, sourceEntryId: "e1", isLocked: false },
  ]).run();
  return db;
}

describe("generateShoppingListsForIteration", () => {
  it("aggregates non-leftover ingredients scaled to plan servings", () => {
    const db = seed();
    generateShoppingListsForIteration(db, {
      iterationId: "it1", startDate: "2026-06-22", endDate: "2026-06-28", shoppingDays: [1],
    });
    const lists = db.select().from(shoppingLists).where(eq(shoppingLists.iterationId, "it1")).all();
    expect(lists.length).toBe(1);
    const items = db.select().from(shoppingListItems).where(eq(shoppingListItems.shoppingListId, lists[0].id)).all();
    // 200g & 150g scaled by 4/2 = 400 & 300; leftover entry contributes nothing.
    const byIng = Object.fromEntries(items.map((i) => [i.ingredientId, i.quantity]));
    expect(byIng[1]).toBe("400");
    expect(byIng[2]).toBe("300");
  });

  it("replaces existing lists on re-run (idempotent)", () => {
    const db = seed();
    const opts = { iterationId: "it1", startDate: "2026-06-22", endDate: "2026-06-28", shoppingDays: [1] } as const;
    generateShoppingListsForIteration(db, opts);
    generateShoppingListsForIteration(db, opts);
    expect(db.select().from(shoppingLists).where(eq(shoppingLists.iterationId, "it1")).all().length).toBe(1);
  });

  it("scales each entry by its own servings, not a plan-level value", () => {
    const db = seed();
    // Add a second cooking entry on Tue (weekday 2, still in segment) with servings 2 → 1x scale.
    db.insert(recipes).values({ id: "r2", householdId: "h1", title: "Soup", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now }).run();
    db.insert(recipeIngredients).values({ recipeId: "r2", ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
    db.insert(mealPlanEntries).values(
      { id: "e3", iterationId: "it1", date: "2026-06-24", mealType: "LUNCH", recipeId: "r2", servings: 2, isLeftover: false, isLocked: false },
    ).run();
    generateShoppingListsForIteration(db, {
      iterationId: "it1", startDate: "2026-06-22", endDate: "2026-06-28", shoppingDays: [1],
    });
    const lists = db.select().from(shoppingLists).where(eq(shoppingLists.iterationId, "it1")).all();
    const items = db.select().from(shoppingListItems).where(eq(shoppingListItems.shoppingListId, lists[0].id)).all();
    const byIng = Object.fromEntries(items.map((i) => [i.ingredientId, i.quantity]));
    // Tomato: r1 200g * (4/2)=400 + r2 100g * (2/2)=100 → 500. Pasta: r1 150 * 2 = 300.
    expect(byIng[1]).toBe("500");
    expect(byIng[2]).toBe("300");
  });

  it("nulls a leftover's sourceEntryId when its source entry is deleted (A9 SET NULL)", () => {
    const db = seed(); // seeds e1 (source) and e2 (leftover, sourceEntryId 'e1')
    db.delete(mealPlanEntries).where(eq(mealPlanEntries.id, "e1")).run();
    const leftover = db.select().from(mealPlanEntries).where(eq(mealPlanEntries.id, "e2")).get();
    expect(leftover?.sourceEntryId).toBeNull();
  });

  it("creates a list for a segment even when it aggregates to zero items", () => {
    const db = createTestDb();
    db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
    db.insert(mealPlans).values({ id: "mp1", householdId: "h1", shoppingDay1: 1, servings: 4, knownRatio: "0.7", defaultLeftoverDays: 1, createdAt: now }).run();
    db.insert(planIterations).values({ id: "it1", mealPlanId: "mp1", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now }).run();
    // No entries at all → one segment, zero aggregated items.
    generateShoppingListsForIteration(db, {
      iterationId: "it1", startDate: "2026-06-22", endDate: "2026-06-28", shoppingDays: [1],
    });
    const lists = db.select().from(shoppingLists).where(eq(shoppingLists.iterationId, "it1")).all();
    expect(lists.length).toBe(1);
    const items = db.select().from(shoppingListItems).where(eq(shoppingListItems.shoppingListId, lists[0].id)).all();
    expect(items.length).toBe(0);
  });
});
