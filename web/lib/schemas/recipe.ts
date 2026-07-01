import { z } from "zod";

export const formIngredientSchema = z.object({
  ingredientId: z.number().nullable(),
  nameEn: z.string(),
  nameDe: z.string(),
  quantity: z.string(),
  unitId: z.number(),
});
export const formStepIngredientSchema = z.object({
  recipeIngredientIndex: z.number(), // index into the ingredients array (becomes `order`)
  quantity: z.string(),
});
export const formStepSchema = z.object({
  instruction: z.string(),
  programType: z.string(), // "" for manual / free-text
  temperature: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  speed: z.number().nullable(),
  turbo: z.boolean(),
  direction: z.string(),
  weightGrams: z.number().nullable(),
  ingredients: z.array(formStepIngredientSchema),
});
export const recipeFormSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  defaultServings: z.number().min(1),
  prepTimeMinutes: z.number().nullable(),
  cookTimeMinutes: z.number().nullable(),
  leftoverDays: z.number().nullable(),
  ingredients: z.array(formIngredientSchema),
  manualSteps: z.array(formStepSchema),
  machineSteps: z.array(formStepSchema),
  tagIds: z.array(z.string()),
});
export type RecipeFormValues = z.infer<typeof recipeFormSchema>;
export type FormStepValues = z.infer<typeof formStepSchema>;
export type FormIngredientValues = z.infer<typeof formIngredientSchema>;
