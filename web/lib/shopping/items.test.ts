// web/lib/shopping/items.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households, mealPlans, planIterations, shoppingLists, shoppingListItems, ingredients, units,
} from "@/lib/db/schema";
import { toggleShoppingItem, setShoppingItemsChecked } from "./items";
import { AuthError } from "@/lib/auth/errors";

const now = new Date("2026-06-27T12:00:00Z");

function seed() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
  db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
  db.insert(mealPlans).values([
    { id: "mp1", householdId: "h1", shoppingDay1: 5, servings: 2, knownRatio: "0.7", defaultLeftoverDays: 1, createdAt: now },
    { id: "mp2", householdId: "h2", shoppingDay1: 5, servings: 2, knownRatio: "0.7", defaultLeftoverDays: 1, createdAt: now },
  ]).run();
  db.insert(planIterations).values([
    { id: "it1", mealPlanId: "mp1", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now },
    { id: "it2", mealPlanId: "mp2", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now },
  ]).run();
  db.insert(shoppingLists).values([
    { id: "sl1", iterationId: "it1", shoppingDate: "2026-06-22", createdAt: now },
    { id: "sl2", iterationId: "it2", shoppingDate: "2026-06-22", createdAt: now },
  ]).run();
  db.insert(shoppingListItems).values([
    { id: "i1", shoppingListId: "sl1", ingredientId: 1, quantity: "200", unitId: 1, isChecked: false },
    { id: "i2", shoppingListId: "sl1", ingredientId: 1, quantity: "100", unitId: 1, isChecked: true },
    { id: "iX", shoppingListId: "sl2", ingredientId: 1, quantity: "50", unitId: 1, isChecked: false }, // other household
  ]).run();
  return db;
}

describe("toggleShoppingItem", () => {
  it("flips checked state for an owned item", () => {
    const db = seed();
    expect(toggleShoppingItem(db, "h1", "i1")).toBe(true);
    expect(toggleShoppingItem(db, "h1", "i1")).toBe(false);
  });
  it("refuses a cross-household item", () => {
    const db = seed();
    expect(() => toggleShoppingItem(db, "h1", "iX")).toThrow(AuthError);
  });
});

describe("setShoppingItemsChecked", () => {
  it("bulk-unchecks only owned items and ignores foreign ids", () => {
    const db = seed();
    const n = setShoppingItemsChecked(db, "h1", ["i1", "i2", "iX"], false);
    expect(n).toBe(2);
    const rows = db.select().from(shoppingListItems).all();
    expect(rows.find((r) => r.id === "i2")!.isChecked).toBe(false);
    expect(rows.find((r) => r.id === "iX")!.isChecked).toBe(false); // untouched (was already false)
  });
});
