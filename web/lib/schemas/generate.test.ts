import { describe, expect, it } from "vitest";
import { generateRecipesSchema, aiSettingsSchema, bulkCreateSchema } from "./generate";

describe("generateRecipesSchema", () => {
  it("applies defaults", () => {
    expect(generateRecipesSchema.parse({})).toEqual({ count: 10, tagIds: [], freeText: "", generateImages: true });
  });
  it("rejects count out of range", () => {
    expect(() => generateRecipesSchema.parse({ count: 0 })).toThrow();
    expect(() => generateRecipesSchema.parse({ count: 21 })).toThrow();
  });
});

describe("aiSettingsSchema", () => {
  it("allows partial updates", () => {
    expect(aiSettingsSchema.parse({ aiEnabled: true })).toEqual({ aiEnabled: true });
  });
});

describe("bulkCreateSchema", () => {
  it("accepts a minimal recipe", () => {
    const r = bulkCreateSchema.parse({
      recipes: [{ title: "A", defaultServings: 2, prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null, ingredients: [], manualSteps: [], machineSteps: [], tagIds: [] }],
    });
    expect(r.recipes[0].title).toBe("A");
  });
});
