import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households, ingredients, units, mealPlans, planIterations, shoppingLists, shoppingListItems,
} from "@/lib/db/schema";
import { getShoppingListById } from "./shopping";

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
    { id: "mp1", householdId: "h1", shoppingDay1: 1, servings: 4, knownRatio: "0.7", defaultLeftoverDays: 1, createdAt: now },
    { id: "mp2", householdId: "h2", shoppingDay1: 1, servings: 4, knownRatio: "0.7", defaultLeftoverDays: 1, createdAt: now },
  ]).run();
  db.insert(planIterations).values([
    { id: "it1", mealPlanId: "mp1", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now },
    { id: "it2", mealPlanId: "mp2", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now },
  ]).run();
  db.insert(shoppingLists).values([
    { id: "sl1", iterationId: "it1", shoppingDate: "2026-06-22", createdAt: now },
    { id: "sl2", iterationId: "it2", shoppingDate: "2026-06-22", createdAt: now },
  ]).run();
  db.insert(shoppingListItems).values(
    { id: "i1", shoppingListId: "sl1", ingredientId: 1, quantity: "400", unitId: 1, isChecked: false },
  ).run();
  return db;
}

describe("getShoppingListById", () => {
  it("returns an owned list with its date and items", () => {
    const db = seed();
    const list = getShoppingListById(db, "h1", "sl1", "en");
    expect(list?.id).toBe("sl1");
    expect(list?.shoppingDate).toBe("2026-06-22");
    expect(list?.items.map((i) => i.ingredientName)).toEqual(["Tomato"]);
  });

  it("returns null for a list owned by another household", () => {
    const db = seed();
    expect(getShoppingListById(db, "h1", "sl2", "en")).toBeNull();
  });

  it("returns null for a missing id", () => {
    const db = seed();
    expect(getShoppingListById(db, "h1", "nope", "en")).toBeNull();
  });
});
