import { describe, expect, it } from "vitest";
import { toInitialValues } from "./to-initial-values";
import type { RecipeDetail } from "@/lib/queries/recipes";

const recipe: RecipeDetail = {
  id: "r1", title: "Bread", description: "Tasty", listType: "KNOWN", defaultServings: 4,
  prepTimeMinutes: 10, cookTimeMinutes: 30, leftoverDays: null, image: "",
  tags: [{ id: "t1", category: "CUISINE", nameEn: "Italian", nameDe: "Italienisch" }],
  ingredients: [
    { id: 11, ingredientId: 1, quantity: "500", unitId: 1, order: 0 },
    { id: 12, ingredientId: 2, quantity: "7", unitId: 1, order: 1 },
  ],
  manualSteps: [
    { id: 21, method: "MANUAL", stepNumber: 1, instruction: "Mix", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [{ recipeIngredientId: 11, quantity: "500" }] },
  ],
  machineSteps: [
    { id: 22, method: "MACHINE", stepNumber: 1, instruction: "", programType: "STEAMING", temperature: 100, durationSeconds: 600, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [] },
  ],
} as unknown as RecipeDetail;

describe("toInitialValues", () => {
  it("maps RecipeDetail to form values and converts recipeIngredientId -> ingredient index", () => {
    const v = toInitialValues(recipe);
    expect(v.title).toBe("Bread");
    expect(v.description).toBe("Tasty");
    expect(v.tagIds).toEqual(["t1"]);
    expect(v.ingredients).toHaveLength(2);
    expect(v.ingredients[0].ingredientId).toBe(1);
    // step-ingredient referencing recipeIngredientId 11 (order 0) -> index 0
    expect(v.manualSteps[0].ingredients[0].recipeIngredientIndex).toBe(0);
    expect(v.machineSteps[0].programType).toBe("STEAMING");
  });
});
