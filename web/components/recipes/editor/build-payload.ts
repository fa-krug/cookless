import type { RecipeFormValues, FormStepValues } from "@/lib/schemas/recipe";
import type { UpsertRecipeInput, UpsertStepInput } from "@/lib/recipes/upsert";

function isEmptyStep(s: FormStepValues): boolean {
  return !s.instruction.trim() && !s.programType;
}

function toStep(s: FormStepValues, method: "MANUAL" | "MACHINE", stepNumber: number): UpsertStepInput {
  return {
    method,
    stepNumber,
    instruction: s.instruction,
    programType: method === "MANUAL" ? "" : s.programType,
    temperature: s.temperature,
    durationSeconds: s.durationSeconds,
    speed: s.speed,
    turbo: s.turbo,
    direction: s.direction,
    weightGrams: s.weightGrams,
    ingredients: s.ingredients.map((si) => ({
      recipeIngredientOrder: si.recipeIngredientIndex,
      quantity: si.quantity || "0",
    })),
  };
}

export function buildPayload(values: RecipeFormValues, listType: "KNOWN" | "TO_TRY"): UpsertRecipeInput {
  const manual = values.manualSteps.filter((s) => !isEmptyStep(s));
  const machine = values.machineSteps.filter((s) => !isEmptyStep(s));
  let n = 0;
  const steps: UpsertStepInput[] = [
    ...manual.map((s) => toStep(s, "MANUAL", ++n)),
  ];
  n = 0;
  steps.push(...machine.map((s) => toStep(s, "MACHINE", ++n)));

  return {
    title: values.title,
    description: values.description,
    listType,
    defaultServings: values.defaultServings,
    prepTimeMinutes: values.prepTimeMinutes,
    cookTimeMinutes: values.cookTimeMinutes,
    leftoverDays: values.leftoverDays,
    ingredients: values.ingredients.map((ing, order) => ({
      ingredientId: ing.ingredientId,
      nameEn: ing.nameEn,
      nameDe: ing.nameDe || ing.nameEn,
      quantity: ing.quantity || "0",
      unitId: ing.unitId,
      order,
    })),
    steps,
    tagIds: values.tagIds,
  };
}
