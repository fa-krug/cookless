import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { ingredients, units } from "@/lib/db/schema";
import { seed } from "./seed";

describe("seed", () => {
  it("inserts units and ingredients into a fresh DB", () => {
    const db = createTestDb();
    seed(db);
    const unitCount = db.select().from(units).all().length;
    const ingredientCount = db.select().from(ingredients).all().length;
    expect(unitCount).toBeGreaterThan(0);
    expect(ingredientCount).toBeGreaterThan(0);
  });

  it("is idempotent: running seed twice does not change row counts", () => {
    const db = createTestDb();
    seed(db);
    const unitsAfterFirst = db.select().from(units).all().length;
    const ingredientsAfterFirst = db.select().from(ingredients).all().length;
    seed(db);
    const unitsAfterSecond = db.select().from(units).all().length;
    const ingredientsAfterSecond = db.select().from(ingredients).all().length;
    expect(unitsAfterSecond).toBe(unitsAfterFirst);
    expect(ingredientsAfterSecond).toBe(ingredientsAfterFirst);
  });
});
