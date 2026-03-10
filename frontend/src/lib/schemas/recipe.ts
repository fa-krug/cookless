import { z } from "zod";

export const ingredientRowSchema = z.object({
  ingredient: z.number(),
  ingredientName: z.string(),
  quantity: z.string(),
  unit: z.number(),
  order: z.number(),
});

export const stepIngredientRowSchema = z.object({
  ingredientIndex: z.number(),
  quantity: z.string(),
});

export type StepIngredientRowValues = z.infer<typeof stepIngredientRowSchema>;

export const stepRowSchema = z.object({
  step_number: z.number(),
  instruction: z.string(),
  program_type: z.string().nullish(),
  temperature: z.number().nullish(),
  duration_seconds: z.number().nullish(),
  speed: z.number().nullish(),
  turbo: z.boolean().optional(),
  direction: z.string().nullish(),
  weight_grams: z.number().nullish(),
  ingredients: z.array(stepIngredientRowSchema),
});

export const recipeFormSchema = z.object({
  title: z.string().min(1),
  defaultServings: z.number().min(1),
  prepTime: z.string(),
  cookTime: z.string(),
  ingredients: z.array(ingredientRowSchema),
  manualSteps: z.array(stepRowSchema),
  machineSteps: z.array(stepRowSchema),
  tagIds: z.array(z.string()),
});

export type IngredientRowValues = z.infer<typeof ingredientRowSchema>;
export type StepRowValues = z.infer<typeof stepRowSchema>;
export type RecipeFormValues = z.infer<typeof recipeFormSchema>;
