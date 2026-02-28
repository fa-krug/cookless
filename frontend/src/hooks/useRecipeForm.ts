import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  recipeFormSchema,
  type RecipeFormValues,
  type IngredientRowValues,
  type StepRowValues,
} from "@/lib/schemas/recipe";
import type {
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

function buildStepRows(steps: Recipe["manual_steps"]): StepRowValues[] {
  return steps.map((s) => ({
    step_number: s.step_number,
    instruction: s.instruction,
  }));
}

function buildMachineStepRows(steps: Recipe["machine_steps"]): StepRowValues[] {
  return steps.map((s) => ({
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

  return {
    title: values.title,
    list_type: recipe?.list_type ?? listType,
    default_servings: values.defaultServings || 1,
    prep_time_minutes: values.prepTime ? Number(values.prepTime) : null,
    cook_time_minutes: values.cookTime ? Number(values.cookTime) : null,
    leftover_days: recipe?.leftover_days ?? null,
    ingredients: resolvedIngredients
      .filter((row) => row.ingredient > 0)
      .map((row, i) => ({
        ingredient: row.ingredient,
        quantity: row.quantity || "0",
        unit: row.unit,
        order: i,
      })),
    manual_steps: values.manualSteps
      .filter((s) => s.instruction.trim())
      .map((s, i) => ({ step_number: i + 1, instruction: s.instruction })),
    machine_steps: values.machineSteps
      .filter((s) => s.instruction.trim() || s.program_type)
      .map((s, i) => ({
        step_number: i + 1,
        instruction: s.instruction || "",
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

  const form = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: {
      title: recipe?.title ?? "",
      defaultServings: recipe?.default_servings ?? 2,
      prepTime: recipe?.prep_time_minutes?.toString() ?? "",
      cookTime: recipe?.cook_time_minutes?.toString() ?? "",
      ingredients: recipe ? buildIngredientRows(recipe, allIngredients, nameKey) : [],
      manualSteps: recipe ? buildStepRows(recipe.manual_steps) : [],
      machineSteps: recipe ? buildMachineStepRows(recipe.machine_steps) : [],
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
