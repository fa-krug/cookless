import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households,
  recipes,
  tags,
  recipeTags,
  ingredients,
  units,
  recipeIngredients,
  cookingSteps,
  stepIngredients,
} from "@/lib/db/schema";
import { listRecipes, getRecipe, listTags, listIngredients as listIngredientsQuery, listUnits } from "./recipes";

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

  it("sorts the WHOLE collection before paginating (newest, not page-local)", () => {
    // seed() has r1 Pasta (2026-06-27) and r2 Pizza (2026-06-28) in KNOWN.
    const { items } = listRecipes(seed(), "h1", { listType: "KNOWN", sort: "newest", limit: 1 });
    expect(items.map((r) => r.id)).toEqual(["r2"]); // newest first, not alphabetical "Pasta"
  });

  it("orders by name ascending by default", () => {
    const { items } = listRecipes(seed(), "h1", { listType: "KNOWN" });
    expect(items.map((r) => r.id)).toEqual(["r1", "r2"]); // Pasta, Pizza
  });

  it("orders by name descending", () => {
    const { items } = listRecipes(seed(), "h1", { listType: "KNOWN", sort: "name-desc" });
    expect(items.map((r) => r.id)).toEqual(["r2", "r1"]); // Pizza, Pasta
  });

  it("paginates with a stable totalCount", () => {
    const p1 = listRecipes(seed(), "h1", { listType: "KNOWN", limit: 1, offset: 0 });
    const p2 = listRecipes(seed(), "h1", { listType: "KNOWN", limit: 1, offset: 1 });
    expect(p1.totalCount).toBe(2);
    expect(p2.totalCount).toBe(2);
    expect(p1.items.map((r) => r.id)).toEqual(["r1"]);
    expect(p2.items.map((r) => r.id)).toEqual(["r2"]);
  });

  it("fuzzy search tolerates diacritics and ranks by relevance", () => {
    const db = createTestDb();
    db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
    db.insert(recipes).values([
      { id: "a", householdId: "h1", title: "Pürée Soup", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
      { id: "b", householdId: "h1", title: "Chunky Puree Bowl", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
      { id: "c", householdId: "h1", title: "Pizza", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
    ]).run();
    const { items, totalCount } = listRecipes(db, "h1", { search: "puree" });
    expect(totalCount).toBe(2);              // Pizza excluded
    expect(items.map((r) => r.id)).toEqual(["a", "b"]); // prefix "Pürée…" ranks above substring
  });
});

function seedDetail() {
  const db = createTestDb();
  db.insert(households)
    .values([
      { id: "h1", name: "Home", createdAt: now },
      { id: "h2", name: "Other", createdAt: now },
    ])
    .run();
  db.insert(ingredients)
    .values([
      { id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" },
      { id: 2, nameEn: "Pasta", nameDe: "Nudeln", category: "PANTRY" },
    ])
    .run();
  db.insert(units)
    .values([{ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }])
    .run();
  db.insert(tags)
    .values({
      id: "t1",
      householdId: "h1",
      category: "CUISINE",
      nameEn: "Italian",
      nameDe: "Italienisch",
    })
    .run();
  db.insert(recipes)
    .values([
      {
        id: "r1",
        householdId: "h1",
        title: "Pasta",
        description: "Yum",
        listType: "KNOWN",
        defaultServings: 2,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "rX",
        householdId: "h2",
        title: "Secret",
        description: "",
        listType: "KNOWN",
        defaultServings: 2,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();
  db.insert(recipeTags).values({ recipeId: "r1", tagId: "t1" }).run();
  db.insert(recipeIngredients)
    .values([
      { id: 10, recipeId: "r1", ingredientId: 1, quantity: "200", unitId: 1, order: 0 },
      { id: 11, recipeId: "r1", ingredientId: 2, quantity: "150", unitId: 1, order: 1 },
    ])
    .run();
  db.insert(cookingSteps)
    .values([
      {
        id: 100,
        recipeId: "r1",
        method: "MANUAL",
        stepNumber: 1,
        instruction: "Boil water",
        programType: "",
        turbo: false,
        direction: "",
      },
      {
        id: 101,
        recipeId: "r1",
        method: "MACHINE",
        stepNumber: 1,
        instruction: "Chop",
        programType: "CHOPPING",
        speed: 5,
        turbo: false,
        direction: "",
      },
    ])
    .run();
  db.insert(stepIngredients)
    .values({ stepId: 101, recipeIngredientId: 10, quantity: "200" })
    .run();
  return db;
}

describe("getRecipe", () => {
  it("returns null for missing or cross-household recipe", () => {
    const db = seedDetail();
    expect(getRecipe(db, "h1", "missing")).toBeNull();
    expect(getRecipe(db, "h1", "rX")).toBeNull(); // belongs to h2
  });

  it("returns full detail with ordered ingredients, split steps, and tags", () => {
    const r = getRecipe(seedDetail(), "h1", "r1")!;
    expect(r.title).toBe("Pasta");
    expect(r.ingredients.map((i) => i.ingredientId)).toEqual([1, 2]); // ordered by `order`
    expect(r.manualSteps.map((s) => s.id)).toEqual([100]);
    expect(r.machineSteps.map((s) => s.id)).toEqual([101]);
    expect(r.machineSteps[0]!.ingredients).toEqual([{ recipeIngredientId: 10, quantity: "200" }]);
    expect(r.tags.map((t) => t.id)).toEqual(["t1"]);
  });
});

describe("global lists", () => {
  it("listTags scopes to household", () => {
    expect(listTags(seedDetail(), "h1").map((t) => t.id)).toEqual(["t1"]);
    expect(listTags(seedDetail(), "h2")).toEqual([]);
  });
  it("listIngredients / listUnits return global rows", () => {
    expect(listIngredientsQuery(seedDetail()).map((i) => i.id)).toEqual([1, 2]);
    expect(listUnits(seedDetail()).map((u) => u.abbreviation)).toEqual(["g"]);
  });
});
