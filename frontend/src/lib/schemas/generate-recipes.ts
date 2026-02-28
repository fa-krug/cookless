import { z } from "zod";

export const generateRecipesSchema = z.object({
  count: z.number().min(1).max(20),
  selectedTagIds: z.array(z.string()),
  freeText: z.string(),
  generateImages: z.boolean(),
});

export type GenerateRecipesFormValues = z.infer<typeof generateRecipesSchema>;
