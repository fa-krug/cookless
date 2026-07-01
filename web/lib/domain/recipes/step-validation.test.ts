import { describe, expect, it } from "vitest";
import { validateStepIngredientTotals } from "./step-validation";

describe("validateStepIngredientTotals", () => {
  it("passes when step totals stay within recipe quantities", () => {
    const errors = validateStepIngredientTotals(
      [{ order: 1, quantity: "200" }],
      [{ recipeIngredientOrder: 1, quantity: "120" }, { recipeIngredientOrder: 1, quantity: "80" }],
    );
    expect(errors).toEqual([]);
  });

  it("flags when step totals exceed the recipe quantity", () => {
    const errors = validateStepIngredientTotals(
      [{ order: 1, quantity: "200" }],
      [{ recipeIngredientOrder: 1, quantity: "150" }, { recipeIngredientOrder: 1, quantity: "100" }],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("order 1");
    expect(errors[0]).toContain("250");
    expect(errors[0]).toContain("200");
  });

  it("ignores step ingredients with no matching recipe order", () => {
    const errors = validateStepIngredientTotals(
      [{ order: 1, quantity: "200" }],
      [{ recipeIngredientOrder: 9, quantity: "999" }],
    );
    expect(errors).toEqual([]);
  });

  it("compares with decimal precision (no float drift)", () => {
    const errors = validateStepIngredientTotals(
      [{ order: 1, quantity: "0.3" }],
      [{ recipeIngredientOrder: 1, quantity: "0.1" }, { recipeIngredientOrder: 1, quantity: "0.2" }],
    );
    expect(errors).toEqual([]); // 0.1 + 0.2 == 0.3 exactly with Decimal
  });
});
