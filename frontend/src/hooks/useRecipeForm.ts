import { useState } from "react";
import type { Ingredient, ListType, Recipe, RecipeUpdatePayload } from "../api/types";
import type { IngredientRow } from "../components/IngredientForm";
import type { StepRow } from "../components/StepEditor";
import { createIngredient } from "./useIngredients";
import { useTranslation } from "react-i18next";

interface UseRecipeFormOptions {
  recipe?: Recipe;
  listType?: ListType;
  allIngredients?: Ingredient[];
}

function buildIngredientRows(
  recipe: Recipe,
  allIngredients: Ingredient[],
  nameKey: "name_de" | "name_en",
): IngredientRow[] {
  return recipe.ingredients.map((ri) => {
    const ing = allIngredients.find((i) => i.id === ri.ingredient);
    return {
      ingredient: ri.ingredient,
      ingredientName: ing ? ing[nameKey] : String(ri.ingredient),
      quantity: ri.quantity,
      unit: ri.unit,
      order: ri.order,
    };
  });
}

function buildStepRows(steps: Recipe["manual_steps"]): StepRow[] {
  return steps.map((s) => ({
    step_number: s.step_number,
    instruction: s.instruction,
  }));
}

export function useRecipeForm({
  recipe,
  listType = "KNOWN",
  allIngredients = [],
}: UseRecipeFormOptions) {
  const { i18n } = useTranslation();
  const lang = i18n.language === "de" ? "de" : "en";
  const nameKey = lang === "de" ? "name_de" : "name_en";

  const [title, setTitle] = useState(recipe?.title ?? "");
  const [defaultServings, setDefaultServings] = useState(recipe?.default_servings ?? 2);
  const [prepTime, setPrepTime] = useState(recipe?.prep_time_minutes?.toString() ?? "");
  const [cookTime, setCookTime] = useState(recipe?.cook_time_minutes?.toString() ?? "");
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    recipe ? buildIngredientRows(recipe, allIngredients, nameKey) : [],
  );
  const [manualSteps, setManualSteps] = useState<StepRow[]>(
    recipe ? buildStepRows(recipe.manual_steps) : [],
  );
  const [machineSteps, setMachineSteps] = useState<StepRow[]>(
    recipe
      ? recipe.machine_steps.map((s) => ({
          step_number: s.step_number,
          instruction: s.instruction,
          ...(s.program_type && {
            program_type: s.program_type,
            temperature: s.temperature,
            duration_seconds: s.duration_seconds,
            speed: s.speed,
            turbo: s.turbo,
            direction: s.direction,
            weight_grams: s.weight_grams,
          }),
        }))
      : [],
  );
  const [tagIds, setTagIds] = useState<string[]>(recipe?.tags.map((tag) => tag.id) ?? []);

  async function buildPayload(): Promise<RecipeUpdatePayload> {
    const resolvedIngredients = await Promise.all(
      ingredients.map(async (row) => {
        if (row.ingredient > 0 || !row.ingredientName.trim()) return row;
        const created = await createIngredient(row.ingredientName.trim());
        return { ...row, ingredient: created.id };
      }),
    );

    return {
      title,
      list_type: recipe?.list_type ?? listType,
      default_servings: defaultServings || 1,
      prep_time_minutes: prepTime ? Number(prepTime) : null,
      cook_time_minutes: cookTime ? Number(cookTime) : null,
      leftover_days: recipe?.leftover_days ?? null,
      ingredients: resolvedIngredients
        .filter((row) => row.ingredient > 0)
        .map((row, i) => ({
          ingredient: row.ingredient,
          quantity: row.quantity || "0",
          unit: row.unit,
          order: i,
        })),
      manual_steps: manualSteps
        .filter((s) => s.instruction.trim())
        .map((s, i) => ({ step_number: i + 1, instruction: s.instruction })),
      machine_steps: machineSteps
        .filter((s) => s.instruction.trim() || s.program_type)
        .map((s, i) => ({
          step_number: i + 1,
          instruction: s.instruction || "",
          ...(s.program_type && {
            program_type: s.program_type,
            temperature: s.temperature ?? null,
            duration_seconds: s.duration_seconds ?? null,
            speed: s.speed ?? null,
            turbo: s.turbo ?? false,
            direction: s.direction ?? null,
            weight_grams: s.weight_grams ?? null,
          }),
        })),
      tag_ids: tagIds,
    };
  }

  return {
    title,
    setTitle,
    defaultServings,
    setDefaultServings,
    prepTime,
    setPrepTime,
    cookTime,
    setCookTime,
    ingredients,
    setIngredients,
    manualSteps,
    setManualSteps,
    machineSteps,
    setMachineSteps,
    tagIds,
    setTagIds,
    buildPayload,
  };
}
