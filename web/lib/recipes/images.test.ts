import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { createTestDb } from "@/lib/test/db";
import { households, recipes, ingredients, recipeIngredients, units } from "@/lib/db/schema";
import { resolveMediaPath } from "@/lib/images/storage";
import { setRecipeImage, removeRecipeImage, generateRecipeImageFromAI } from "./images";
import { AuthError } from "@/lib/auth/errors";

const now = new Date("2026-06-27T12:00:00Z");
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cookless-svc-"));
  process.env.MEDIA_ROOT = dir;
});
afterEach(() => {
  delete process.env.MEDIA_ROOT;
  rmSync(dir, { recursive: true, force: true });
});

function seed() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(households).values({ id: "h2", name: "Other", createdAt: now }).run();
  db.insert(recipes)
    .values({ id: "r1", householdId: "h1", title: "Soup", listType: "KNOWN", createdAt: now, updatedAt: now })
    .run();
  return db;
}
const png = () => sharp({ create: { width: 100, height: 100, channels: 3, background: "green" } }).png().toBuffer();

describe("setRecipeImage", () => {
  it("processes, stores, and records the relative path", async () => {
    const db = seed();
    await setRecipeImage(db, "h1", "r1", await png(), now);
    const row = db.select().from(recipes).where(eq(recipes.id, "r1")).get();
    expect(row?.image).toMatch(/^recipes\/r1_\d+\.webp$/);
    expect(existsSync(resolveMediaPath(row!.image)!)).toBe(true);
  });

  it("deletes the previous file when replacing", async () => {
    const db = seed();
    await setRecipeImage(db, "h1", "r1", await png(), new Date(1000));
    const first = db.select().from(recipes).where(eq(recipes.id, "r1")).get()!.image;
    await setRecipeImage(db, "h1", "r1", await png(), new Date(2000));
    const second = db.select().from(recipes).where(eq(recipes.id, "r1")).get()!.image;
    expect(second).not.toBe(first);
    expect(existsSync(resolveMediaPath(first)!)).toBe(false);
  });

  it("rejects a recipe from another household with 404", async () => {
    const db = seed();
    await expect(setRecipeImage(db, "h2", "r1", await png(), now)).rejects.toMatchObject({ status: 404 });
  });
});

describe("generateRecipeImageFromAI", () => {
  function seedAi(opts: { aiEnabled: boolean; key: string }) {
    const db = createTestDb();
    db.insert(households).values({ id: "h1", name: "Home", aiEnabled: opts.aiEnabled, geminiApiKey: opts.key, createdAt: now }).run();
    db.insert(recipes).values({ id: "r1", householdId: "h1", title: "Soup", listType: "KNOWN", createdAt: now, updatedAt: now }).run();
    db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
    db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g" }).run();
    db.insert(recipeIngredients).values({ recipeId: "r1", ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
    return db;
  }
  const fakeGen = async () =>
    (await import("sharp")).default({ create: { width: 80, height: 80, channels: 3, background: "red" } }).png().toBuffer();

  it("generates, processes, and stores an image", async () => {
    const db = seedAi({ aiEnabled: true, key: "k" });
    await generateRecipeImageFromAI(db, "h1", "r1", now, fakeGen);
    const row = db.select().from(recipes).where(eq(recipes.id, "r1")).get();
    expect(row?.image).toMatch(/^recipes\/r1_\d+\.webp$/);
  });
  it("rejects when AI disabled (403)", async () => {
    const db = seedAi({ aiEnabled: false, key: "k" });
    await expect(generateRecipeImageFromAI(db, "h1", "r1", now, fakeGen)).rejects.toMatchObject({ status: 403 });
  });
  it("rejects when no key (400)", async () => {
    const db = seedAi({ aiEnabled: true, key: "" });
    await expect(generateRecipeImageFromAI(db, "h1", "r1", now, fakeGen)).rejects.toMatchObject({ status: 400 });
  });
  it("rejects cross-household (404)", async () => {
    const db = seedAi({ aiEnabled: true, key: "k" });
    await expect(generateRecipeImageFromAI(db, "hX", "r1", now, fakeGen)).rejects.toMatchObject({ status: 404 });
  });
});

describe("removeRecipeImage", () => {
  it("clears the field and deletes the file", async () => {
    const db = seed();
    await setRecipeImage(db, "h1", "r1", await png(), now);
    const rel = db.select().from(recipes).where(eq(recipes.id, "r1")).get()!.image;
    removeRecipeImage(db, "h1", "r1");
    expect(db.select().from(recipes).where(eq(recipes.id, "r1")).get()!.image).toBe("");
    expect(existsSync(resolveMediaPath(rel)!)).toBe(false);
  });

  it("no-ops when there is no image", () => {
    const db = seed();
    expect(() => removeRecipeImage(db, "h1", "r1")).not.toThrow();
  });

  it("rejects cross-household with 404", () => {
    const db = seed();
    expect(() => removeRecipeImage(db, "h2", "r1")).toThrow(AuthError);
  });
});
