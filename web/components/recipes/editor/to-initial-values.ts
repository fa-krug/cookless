import type { RecipeDetail, CookingStepDto } from "@/lib/queries/recipes";
import type { RecipeFormValues, FormStepValues } from "@/lib/schemas/recipe";

export function toInitialValues(recipe: RecipeDetail): RecipeFormValues {
  // recipeIngredient PK -> its index in the ingredients array (sorted by order).
  const sortedIngredients = [...recipe.ingredients].sort((a, b) => a.order - b.order);
  const riIdToIndex = new Map<number, number>();
  sortedIngredients.forEach((ri, idx) => riIdToIndex.set(ri.id, idx));

  const toFormStep = (s: CookingStepDto): FormStepValues => ({
    instruction: s.instruction,
    programType: s.programType,
    temperature: s.temperature,
    durationSeconds: s.durationSeconds,
    speed: s.speed,
    turbo: s.turbo,
    direction: s.direction,
    weightGrams: s.weightGrams,
    ingredients: s.ingredients
      .filter((si) => riIdToIndex.has(si.recipeIngredientId))
      .map((si) => ({ recipeIngredientIndex: riIdToIndex.get(si.recipeIngredientId)!, quantity: si.quantity })),
  });

  return {
    title: recipe.title,
    description: recipe.description,
    defaultServings: recipe.defaultServings,
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    leftoverDays: recipe.leftoverDays,
    ingredients: sortedIngredients.map((ri) => ({
      ingredientId: ri.ingredientId,
      nameEn: "",
      nameDe: "",
      quantity: ri.quantity,
      unitId: ri.unitId,
    })),
    manualSteps: [...recipe.manualSteps].sort((a, b) => a.stepNumber - b.stepNumber).map(toFormStep),
    machineSteps: [...recipe.machineSteps].sort((a, b) => a.stepNumber - b.stepNumber).map(toFormStep),
    tagIds: recipe.tags.map((t) => t.id),
  };
}
