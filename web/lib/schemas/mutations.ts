import { z } from "zod";

export const bulkToggleSchema = z.object({
  itemIds: z.array(z.string().uuid()),
  isChecked: z.boolean(),
});
export type BulkToggleInput = z.infer<typeof bulkToggleSchema>;

export const setupPlanSchema = z.object({
  iterationWeeks: z.number().int().min(1).max(3),
  shoppingDays: z.array(z.number().int().min(0).max(6)).min(1).max(2),
  servings: z.number().int().min(1).max(12),
  knownRatio: z.number().min(0).max(1),
  defaultLeftoverDays: z.number().int().min(0).max(3),
  excludedTagIds: z.array(z.string().uuid()).default([]),
});
export type SetupPlanInput = z.infer<typeof setupPlanSchema>;
