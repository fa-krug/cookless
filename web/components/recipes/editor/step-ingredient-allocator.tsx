import type { IngredientLite, UnitLite } from "@/lib/queries/recipes";
import type { Locale } from "@/lib/i18n/config";

export function StepIngredientAllocator(_: {
  name: "manualSteps" | "machineSteps";
  index: number;
  ingredients: IngredientLite[];
  units: UnitLite[];
  locale: Locale;
}) {
  return null;
}
