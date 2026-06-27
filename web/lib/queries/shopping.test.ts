import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households, mealPlans, planIterations, shoppingLists, shoppingListItems, ingredients, units,
} from "@/lib/db/schema";
import { getLatestShoppingList } from "./shopping";

const now = new Date("2026-06-27T12:00:00Z");
const later = new Date("2026-06-28T12:00:00Z");

function seed() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
  db.insert(ingredients).values([
    { id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" },
    { id: 2, nameEn: "Milk", nameDe: "Milch", category: "DAIRY" },
  ]).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
  db.insert(mealPlans).values({ id: "mp1", householdId: "h1", knownRatio: "0.7", createdAt: now }).run();
  db.insert(planIterations).values({ id: "it1", mealPlanId: "mp1", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now }).run();
  db.insert(shoppingLists).values([
    { id: "sl_old", iterationId: "it1", shoppingDate: "2026-06-20", createdAt: now },
    { id: "sl_new", iterationId: "it1", shoppingDate: "2026-06-22", createdAt: later },
  ]).run();
  db.insert(shoppingListItems).values([
    { id: "i1", shoppingListId: "sl_new", ingredientId: 1, quantity: "200", unitId: 1, isChecked: false },
    { id: "i2", shoppingListId: "sl_new", ingredientId: 2, quantity: "1", unitId: 1, isChecked: true },
  ]).run();
  return db;
}

describe("getLatestShoppingList", () => {
  it("returns null when household has no list", () => {
    expect(getLatestShoppingList(seed(), "h2", "en")).toBeNull();
  });

  it("returns the most-recently-created list, scoped to the household", () => {
    const v = getLatestShoppingList(seed(), "h1", "en")!;
    expect(v.id).toBe("sl_new");
  });

  it("resolves ingredient names by locale and carries category/checked", () => {
    const en = getLatestShoppingList(seed(), "h1", "en")!;
    expect(en.items.find((i) => i.id === "i1")).toMatchObject({
      ingredientName: "Tomato", category: "PRODUCE", quantity: "200", unitAbbreviation: "g", isChecked: false,
    });
    const de = getLatestShoppingList(seed(), "h1", "de")!;
    expect(de.items.find((i) => i.id === "i1")!.ingredientName).toBe("Tomate");
  });
});
