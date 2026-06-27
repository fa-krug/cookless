import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { createTestDb } from "@/lib/test/db";
import {
  households, ingredients, units, tags, recipes, recipeIngredients, cookingSteps, recipeTags,
} from "@/lib/db/schema";
import { bulkCreateRecipes } from "./bulk-create";

const now = new Date("2026-06-27T12:00:00Z");
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cookless-bulk-"));
  process.env.MEDIA_ROOT = dir;
});
afterEach(() => {
  delete process.env.MEDIA_ROOT;
  rmSync(dir, { recursive: true, force: true });
});

function seed() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g" }).run();
  db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
  db.insert(tags).values({ id: "t1", householdId: "h1", category: "DIETARY", nameEn: "Vegan", nameDe: "Vegan", isDefault: true }).run();
  return db;
}

describe("bulkCreateRecipes", () => {
  it("creates recipes as TO_TRY with ingredients, steps, and tags", async () => {
    const db = seed();
    const res = await bulkCreateRecipes(db, "h1", {
      recipes: [{
        title: "Pasta", defaultServings: 2, prepTimeMinutes: 10, cookTimeMinutes: 20, leftoverDays: 1,
        ingredients: [{ nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE", quantity: "100", unitAbbreviation: "g", order: 0 }],
        manualSteps: [{ stepNumber: 1, instruction: "Boil" }],
        machineSteps: [],
        tagIds: ["t1"],
      }],
    }, now);
    expect(res.createdIds).toHaveLength(1);
    const id = res.createdIds[0];
    expect(db.select().from(recipes).where(eq(recipes.id, id)).get()?.listType).toBe("TO_TRY");
    expect(db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).all()).toHaveLength(1);
    expect(db.select().from(cookingSteps).where(eq(cookingSteps.recipeId, id)).all()).toHaveLength(1);
    expect(db.select().from(recipeTags).where(eq(recipeTags.recipeId, id)).all()).toHaveLength(1);
  });

  it("auto-creates unknown ingredients (case-insensitive match)", async () => {
    const db = seed();
    await bulkCreateRecipes(db, "h1", {
      recipes: [{
        title: "New", defaultServings: 2, prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null,
        ingredients: [{ nameEn: "Basil", nameDe: "Basilikum", category: "PRODUCE", quantity: "5", unitAbbreviation: "g", order: 0 }],
        manualSteps: [], machineSteps: [], tagIds: [],
      }],
    }, now);
    expect(db.select().from(ingredients).all().length).toBe(2); // Tomato + Basil
  });

  it("skips ingredients with unknown units", async () => {
    const db = seed();
    const res = await bulkCreateRecipes(db, "h1", {
      recipes: [{
        title: "X", defaultServings: 2, prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null,
        ingredients: [{ nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE", quantity: "1", unitAbbreviation: "zzz", order: 0 }],
        manualSteps: [], machineSteps: [], tagIds: [],
      }],
    }, now);
    expect(db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, res.createdIds[0])).all()).toHaveLength(0);
  });

  it("ignores tag ids from another household", async () => {
    const db = seed();
    const res = await bulkCreateRecipes(db, "h1", {
      recipes: [{
        title: "Y", defaultServings: 2, prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null,
        ingredients: [], manualSteps: [], machineSteps: [], tagIds: ["does-not-exist"],
      }],
    }, now);
    expect(db.select().from(recipeTags).where(eq(recipeTags.recipeId, res.createdIds[0])).all()).toHaveLength(0);
  });

  it("skips invalid steps (empty manual, out-of-range machine program param) but keeps valid steps", async () => {
    const db = seed();
    const res = await bulkCreateRecipes(db, "h1", {
      recipes: [{
        title: "StepTest", defaultServings: 2, prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null,
        ingredients: [],
        manualSteps: [
          { stepNumber: 1, instruction: "Valid manual step" },   // valid: kept
          { stepNumber: 2, instruction: "   " },                 // invalid: empty instruction → skipped
        ],
        machineSteps: [
          // invalid: temperature 999 is out-of-range [37, 130] for MANUAL_COOKING → skipped
          { stepNumber: 3, instruction: "", programType: "MANUAL_COOKING", temperature: 999, durationSeconds: 300, speed: 5, direction: "LEFT" },
        ],
        tagIds: [],
      }],
    }, now);
    const id = res.createdIds[0];
    const steps = db.select().from(cookingSteps).where(eq(cookingSteps.recipeId, id)).all();
    expect(steps).toHaveLength(1);
    expect(steps[0].method).toBe("MANUAL");
  });

  it("decodes and stores image_base64, skipping invalid images", async () => {
    const db = seed();
    const png = await sharp({ create: { width: 60, height: 60, channels: 3, background: "red" } }).png().toBuffer();
    const res = await bulkCreateRecipes(db, "h1", {
      recipes: [
        { title: "Img", defaultServings: 2, prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null, ingredients: [], manualSteps: [], machineSteps: [], tagIds: [], imageBase64: png.toString("base64") },
        { title: "Bad", defaultServings: 2, prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null, ingredients: [], manualSteps: [], machineSteps: [], tagIds: [], imageBase64: "not-base64-image" },
      ],
    }, now);
    expect(db.select().from(recipes).where(eq(recipes.id, res.createdIds[0])).get()?.image).toMatch(/\.webp$/);
    expect(db.select().from(recipes).where(eq(recipes.id, res.createdIds[1])).get()?.image).toBe("");
  });
});
