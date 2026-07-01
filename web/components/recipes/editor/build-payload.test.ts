import { describe, expect, it } from "vitest";
import { buildPayload } from "./build-payload";
import type { RecipeFormValues } from "@/lib/schemas/recipe";

function values(over: Partial<RecipeFormValues> = {}): RecipeFormValues {
  return {
    title: "Bread", description: "", defaultServings: 2,
    prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null,
    ingredients: [
      { ingredientId: 1, nameEn: "Flour", nameDe: "Mehl", quantity: "500", unitId: 1 },
      { ingredientId: null, nameEn: "Yeast", nameDe: "Yeast", quantity: "7", unitId: 1 },
    ],
    manualSteps: [
      { instruction: "Mix", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [{ recipeIngredientIndex: 0, quantity: "500" }] },
      { instruction: "", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [] }, // empty -> dropped
    ],
    machineSteps: [],
    tagIds: ["t1"],
    ...over,
  };
}

describe("buildPayload", () => {
  it("maps form values to UpsertRecipeInput, indexes ingredients by order", () => {
    const out = buildPayload(values(), "TO_TRY");
    expect(out.listType).toBe("TO_TRY");
    expect(out.ingredients).toHaveLength(2);
    expect(out.ingredients[1]).toMatchObject({ ingredientId: null, nameEn: "Yeast", order: 1 });
    expect(out.steps).toHaveLength(1); // empty manual step dropped
    expect(out.steps[0].method).toBe("MANUAL");
    expect(out.steps[0].stepNumber).toBe(1);
    expect(out.steps[0].ingredients[0].recipeIngredientOrder).toBe(0);
  });

  it("coerces empty ingredient quantity and step-ingredient quantity to '0'", () => {
    const out = buildPayload(values({
      ingredients: [{ ingredientId: 1, nameEn: "Flour", nameDe: "Mehl", quantity: "", unitId: 1 }],
      manualSteps: [
        { instruction: "Mix", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [{ recipeIngredientIndex: 0, quantity: "" }] },
      ],
    }), "TO_TRY");
    expect(out.ingredients[0].quantity).toBe("0");
    expect(out.steps[0].ingredients[0].quantity).toBe("0");
  });

  it("keeps machine steps with a program even when instruction is empty, renumbers per method", () => {
    const out = buildPayload(values({
      manualSteps: [],
      machineSteps: [{ instruction: "", programType: "STEAMING", temperature: 100, durationSeconds: 600, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [] }],
    }), "KNOWN");
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0]).toMatchObject({ method: "MACHINE", programType: "STEAMING", stepNumber: 1 });
  });
});
