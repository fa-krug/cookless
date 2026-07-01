import { z } from "zod";

export const generateRecipesSchema = z.object({
  count: z.number().int().min(1).max(20).default(10),
  tagIds: z.array(z.string()).default([]),
  freeText: z.string().default(""),
  generateImages: z.boolean().default(true),
});
export type GenerateRecipesInput = z.infer<typeof generateRecipesSchema>;

export const aiSettingsSchema = z.object({
  aiEnabled: z.boolean().optional(),
  geminiApiKey: z.string().optional(),
});
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

const bulkIngredient = z.object({
  nameEn: z.string(),
  nameDe: z.string(),
  category: z.string().default("OTHER"),
  quantity: z.string(),
  unitAbbreviation: z.string(),
  order: z.number().int().default(0),
});
const bulkStep = z.object({
  stepNumber: z.number().int(),
  instruction: z.string().default(""),
  programType: z.string().optional(),
  temperature: z.number().int().nullable().optional(),
  durationSeconds: z.number().int().nullable().optional(),
  speed: z.number().int().nullable().optional(),
  turbo: z.boolean().optional(),
  direction: z.string().optional(),
  weightGrams: z.number().int().nullable().optional(),
});
const bulkRecipe = z.object({
  title: z.string(),
  description: z.string().optional(),
  defaultServings: z.number().int(),
  prepTimeMinutes: z.number().int().nullable(),
  cookTimeMinutes: z.number().int().nullable(),
  leftoverDays: z.number().int().nullable(),
  ingredients: z.array(bulkIngredient),
  manualSteps: z.array(bulkStep),
  machineSteps: z.array(bulkStep),
  tagIds: z.array(z.string()),
  imageBase64: z.string().nullable().optional(),
});
export const bulkCreateSchema = z.object({ recipes: z.array(bulkRecipe) });
export type BulkCreateInput = z.infer<typeof bulkCreateSchema>;
