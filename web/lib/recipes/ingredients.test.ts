import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { ingredients } from "@/lib/db/schema";
import { createIngredient, findOrCreateIngredient } from "./ingredients";

describe("createIngredient", () => {
  it("creates a global ingredient and returns its id", () => {
    const db = createTestDb();
    const { id } = createIngredient(db, { nameEn: "Saffron", nameDe: "Safran", category: "PANTRY" });
    const row = db.select().from(ingredients).where(eq(ingredients.id, id)).get();
    expect(row?.nameEn).toBe("Saffron");
    expect(row?.category).toBe("PANTRY");
  });
  it("defaults category to OTHER", () => {
    const db = createTestDb();
    const { id } = createIngredient(db, { nameEn: "Mystery", nameDe: "Mysterium" });
    expect(db.select().from(ingredients).where(eq(ingredients.id, id)).get()?.category).toBe("OTHER");
  });
});

describe("findOrCreateIngredient", () => {
  it("reuses an existing ingredient matched case-insensitively", () => {
    const db = createTestDb();
    const first = findOrCreateIngredient(db, { nameEn: "Basil", nameDe: "Basilikum" });
    const again = findOrCreateIngredient(db, { nameEn: "basil", nameDe: "Basilikum" });
    expect(again.id).toBe(first.id);
  });

  it("creates a new ingredient when the name is unknown", () => {
    const db = createTestDb();
    const a = findOrCreateIngredient(db, { nameEn: "Basil", nameDe: "Basilikum" });
    const b = findOrCreateIngredient(db, { nameEn: "Thyme", nameDe: "Thymian" });
    expect(b.id).not.toBe(a.id);
  });
});
