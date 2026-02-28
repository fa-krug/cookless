import { z } from "zod";

/** Check that all selected shopping days are at least 3 apart (mod 7). */
export function validateShoppingDayGap(days: number[]): boolean {
  if (days.length < 2) return true;
  const sorted = [...days].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const diff = sorted[j] - sorted[i];
      const circularDiff = Math.min(diff, 7 - diff);
      if (circularDiff < 3) return false;
    }
  }
  return true;
}

export const generatePlanSchema = z
  .object({
    iterationWeeks: z.number().min(1).max(3),
    shoppingDays: z.array(z.number().min(0).max(6)),
    servings: z.number().min(1).max(12),
    knownRatio: z.number().min(0).max(1),
    defaultLeftoverDays: z.number().min(0).max(3),
    excludedTagIds: z.array(z.string()),
  })
  .refine((d) => d.shoppingDays.length > 0, {
    message: "shopping_days_required",
    path: ["shoppingDays"],
  })
  .refine((d) => validateShoppingDayGap(d.shoppingDays), {
    message: "shopping_days_too_close",
    path: ["shoppingDays"],
  });

export type GeneratePlanFormValues = z.infer<typeof generatePlanSchema>;
