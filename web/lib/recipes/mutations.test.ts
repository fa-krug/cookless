// web/lib/recipes/mutations.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { households, recipes } from "@/lib/db/schema";
import { moveRecipe, deleteRecipe } from "./mutations";
import { AuthError } from "@/lib/auth/errors";
import { eq } from "drizzle-orm";

const now = new Date("2026-06-27T12:00:00Z");

function seed() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
  db.insert(recipes).values([
    { id: "r1", householdId: "h1", title: "Pasta", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
    { id: "rX", householdId: "h2", title: "Secret", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
  ]).run();
  return db;
}

describe("moveRecipe", () => {
  it("toggles KNOWN -> TO_TRY -> KNOWN", () => {
    const db = seed();
    expect(moveRecipe(db, "h1", "r1", now)).toBe("TO_TRY");
    expect(moveRecipe(db, "h1", "r1", now)).toBe("KNOWN");
  });
  it("refuses a cross-household recipe", () => {
    const db = seed();
    expect(() => moveRecipe(db, "h1", "rX", now)).toThrow(AuthError);
  });
});

describe("deleteRecipe", () => {
  it("deletes an owned recipe", () => {
    const db = seed();
    deleteRecipe(db, "h1", "r1");
    expect(db.select().from(recipes).where(eq(recipes.id, "r1")).get()).toBeUndefined();
  });
  it("refuses a cross-household recipe", () => {
    const db = seed();
    expect(() => deleteRecipe(db, "h1", "rX")).toThrow(AuthError);
    expect(db.select().from(recipes).where(eq(recipes.id, "rX")).get()).toBeDefined();
  });
});
