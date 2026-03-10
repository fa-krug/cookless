import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  recipeFormSchema,
  type RecipeFormValues,
  type IngredientRowValues,
  type StepRowValues,
  type StepIngredientRowValues,
} from "@/lib/schemas/recipe";
import type {
  CookingStep,
  Direction,
  Ingredient,
  ListType,
  ProgramType,
  Recipe,
  RecipeUpdatePayload,
} from "../api/types";
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
): IngredientRowValues[] {
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

function mapStepIngredients(
  step: CookingStep,
  riIdToIndex: Map<number, number>,
): StepIngredientRowValues[] {
  return (step.ingredients ?? [])
    .map((si) => {
      const idx = riIdToIndex.get(si.recipe_ingredient_id);
      if (idx === undefined) return null;
      return { ingredientIndex: idx, quantity: si.quantity };
    })
    .filter((x): x is StepIngredientRowValues => x !== null);
}

function buildStepRows(
  steps: Recipe["manual_steps"],
  riIdToIndex: Map<number, number>,
): StepRowValues[] {
  return steps.map((s) => ({
    step_number: s.step_number,
    instruction: s.instruction,
    ingredients: mapStepIngredients(s, riIdToIndex),
  }));
}

function buildMachineStepRows(
  steps: Recipe["machine_steps"],
  riIdToIndex: Map<number, number>,
): StepRowValues[] {
  return steps.map((s) => ({
    step_number: s.step_number,
    instruction: s.instruction,
    ingredients: mapStepIngredients(s, riIdToIndex),
    ...(s.program_type && {
      program_type: s.program_type,
      temperature: s.temperature,
      duration_seconds: s.duration_seconds,
      speed: s.speed,
      turbo: s.turbo,
      direction: s.direction,
      weight_grams: s.weight_grams,
    }),
  }));
}

export async function buildRecipePayload(
  values: RecipeFormValues,
  recipe?: Recipe,
  listType: ListType = "KNOWN",
): Promise<RecipeUpdatePayload> {
  const resolvedIngredients = await Promise.all(
    values.ingredients.map(async (row) => {
      if (row.ingredient > 0 || !row.ingredientName.trim()) return row;
      const created = await createIngredient(row.ingredientName.trim());
      return { ...row, ingredient: created.id };
    }),
  );

  const filteredIngredients = resolvedIngredients.filter((row) => row.ingredient > 0);
  const ingredientOrders = filteredIngredients.map((_, i) => i);

  // Build a mapping from original form index to filtered index
  const originalToFiltered = new Map<number, number>();
  let filteredIdx = 0;
  for (let i = 0; i < resolvedIngredients.length; i++) {
    if (resolvedIngredients[i].ingredient > 0) {
      originalToFiltered.set(i, filteredIdx++);
    }
  }

  function remapStepIngredients(step: StepRowValues) {
    return (step.ingredients ?? [])
      .filter((si) => originalToFiltered.has(si.ingredientIndex))
      .map((si) => ({
        recipe_ingredient_order: ingredientOrders[originalToFiltered.get(si.ingredientIndex)!],
        quantity: si.quantity || "0",
      }));
  }

  return {
    title: values.title,
    list_type: recipe?.list_type ?? listType,
    default_servings: values.defaultServings || 1,
    prep_time_minutes: values.prepTime ? Number(values.prepTime) : null,
    cook_time_minutes: values.cookTime ? Number(values.cookTime) : null,
    leftover_days: recipe?.leftover_days ?? null,
    ingredients: filteredIngredients.map((row, i) => ({
      ingredient: row.ingredient,
      quantity: row.quantity || "0",
      unit: row.unit,
      order: i,
    })),
    manual_steps: values.manualSteps
      .filter((s) => s.instruction.trim())
      .map((s, i) => ({
        step_number: i + 1,
        instruction: s.instruction,
        ingredients: remapStepIngredients(s),
      })),
    machine_steps: values.machineSteps
      .filter((s) => s.instruction.trim() || s.program_type)
      .map((s, i) => ({
        step_number: i + 1,
        instruction: s.instruction || "",
        ingredients: remapStepIngredients(s),
        ...(s.program_type && {
          program_type: s.program_type as ProgramType,
          temperature: s.temperature ?? null,
          duration_seconds: s.duration_seconds ?? null,
          speed: s.speed ?? null,
          turbo: s.turbo ?? false,
          direction: (s.direction as Direction) ?? null,
          weight_grams: s.weight_grams ?? null,
        }),
      })),
    tag_ids: values.tagIds,
  };
}

export function useRecipeForm({
  recipe,
  listType = "KNOWN",
  allIngredients = [],
}: UseRecipeFormOptions) {
  const { i18n } = useTranslation();
  const lang = i18n.language === "de" ? "de" : "en";
  const nameKey = lang === "de" ? "name_de" : "name_en";

  // Map recipe_ingredient.id → index in the ingredients array for step ingredient hydration
  const riIdToIndex = new Map<number, number>();
  if (recipe) {
    recipe.ingredients.forEach((ri, idx) => {
      riIdToIndex.set(ri.id, idx);
    });
  }

  const form = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: {
      title: recipe?.title ?? "",
      defaultServings: recipe?.default_servings ?? 2,
      prepTime: recipe?.prep_time_minutes?.toString() ?? "",
      cookTime: recipe?.cook_time_minutes?.toString() ?? "",
      ingredients: recipe ? buildIngredientRows(recipe, allIngredients, nameKey) : [],
      manualSteps: recipe ? buildStepRows(recipe.manual_steps, riIdToIndex) : [],
      machineSteps: recipe ? buildMachineStepRows(recipe.machine_steps, riIdToIndex) : [],
      tagIds: recipe?.tags.map((tag) => tag.id) ?? [],
    },
  });

  const ingredientFields = useFieldArray({
    control: form.control,
    name: "ingredients",
  });

  const manualStepFields = useFieldArray({
    control: form.control,
    name: "manualSteps",
  });

  const machineStepFields = useFieldArray({
    control: form.control,
    name: "machineSteps",
  });

  return {
    form,
    ingredientFields,
    manualStepFields,
    machineStepFields,
    async buildPayload(values: RecipeFormValues) {
      return buildRecipePayload(values, recipe, listType);
    },
  };
}
