import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { households, recipes, tags, recipeTags } from "@/lib/db/schema";
import { listRecipes } from "./recipes";

const now = new Date("2026-06-27T12:00:00Z");

function seed() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(households).values({ id: "h2", name: "Other", createdAt: now }).run();
  db.insert(tags).values({ id: "t1", householdId: "h1", category: "CUISINE", nameEn: "Italian", nameDe: "Italienisch" }).run();
  db.insert(recipes).values([
    { id: "r1", householdId: "h1", title: "Pasta", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
    { id: "r2", householdId: "h1", title: "Pizza", description: "", listType: "KNOWN", defaultServings: 2, createdAt: new Date("2026-06-28T12:00:00Z"), updatedAt: now },
    { id: "r3", householdId: "h1", title: "Tofu Curry", description: "", listType: "TO_TRY", defaultServings: 2, createdAt: now, updatedAt: now },
    { id: "rX", householdId: "h2", title: "Secret", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
  ]).run();
  db.insert(recipeTags).values({ recipeId: "r1", tagId: "t1" }).run();
  return db;
}

describe("listRecipes", () => {
  it("scopes to the household (never leaks other households)", () => {
    const { items, totalCount } = listRecipes(seed(), "h1");
    expect(items.map((r) => r.id).sort()).toEqual(["r1", "r2", "r3"]);
    expect(totalCount).toBe(3);
    expect(items.find((r) => r.id === "rX")).toBeUndefined();
  });

  it("filters by listType", () => {
    const { items, totalCount } = listRecipes(seed(), "h1", { listType: "TO_TRY" });
    expect(items.map((r) => r.id)).toEqual(["r3"]);
    expect(totalCount).toBe(1);
  });

  it("filters by case-insensitive title search", () => {
    const { items } = listRecipes(seed(), "h1", { search: "piz" });
    expect(items.map((r) => r.id)).toEqual(["r2"]);
  });

  it("filters by tag membership", () => {
    const { items } = listRecipes(seed(), "h1", { tagIds: ["t1"] });
    expect(items.map((r) => r.id)).toEqual(["r1"]);
  });

  it("attaches tags to each summary", () => {
    const { items } = listRecipes(seed(), "h1", { listType: "KNOWN", search: "pasta" });
    expect(items[0]!.tags).toEqual([
      { id: "t1", category: "CUISINE", nameEn: "Italian", nameDe: "Italienisch" },
    ]);
  });

  it("paginates with limit/offset but reports full totalCount", () => {
    const { items, totalCount } = listRecipes(seed(), "h1", { limit: 2, offset: 0 });
    expect(items.length).toBe(2);
    expect(totalCount).toBe(3);
  });
});
