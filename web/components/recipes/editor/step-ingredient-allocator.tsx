"use client";

import { useFormContext, useFieldArray } from "react-hook-form";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateStepIngredientTotals } from "@/lib/domain/recipes/step-validation";
import type { RecipeFormValues } from "@/lib/schemas/recipe";
import type { IngredientLite, UnitLite } from "@/lib/queries/recipes";
import type { Locale } from "@/lib/i18n/config";

export function StepIngredientAllocator({
  name,
  index,
  ingredients,
  locale,
}: {
  name: "manualSteps" | "machineSteps";
  index: number;
  ingredients: IngredientLite[];
  units: UnitLite[];
  locale: Locale;
}) {
  const { t } = useT();
  const { control, register, watch } = useFormContext<RecipeFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `${name}.${index}.ingredients`,
  });

  const recipeIngredients = watch("ingredients");
  const manualSteps = watch("manualSteps");
  const machineSteps = watch("machineSteps");

  // Compute over-allocation across ALL steps (mirrors server validation).
  const allStepIngredients = [...manualSteps, ...machineSteps].flatMap((s) =>
    s.ingredients.map((si) => ({
      recipeIngredientOrder: si.recipeIngredientIndex,
      quantity: si.quantity || "0",
    })),
  );
  const overErrors = validateStepIngredientTotals(
    recipeIngredients.map((ri, order) => ({ order, quantity: ri.quantity || "0" })),
    allStepIngredients,
  );
  const overAllocated = overErrors.length > 0;

  const displayName = (ri: RecipeFormValues["ingredients"][number]) => {
    if (ri.ingredientId) {
      const match = ingredients.find((i) => i.id === ri.ingredientId);
      if (match) return locale === "de" ? match.nameDe : match.nameEn;
    }
    return ri.nameEn || t("steps.unnamedIngredient");
  };

  return (
    <div className="space-y-1">
      {fields.map((f, i) => (
        <div key={f.id} className="flex items-center gap-2">
          <select
            className="rounded-md border bg-background p-1 text-sm"
            {...register(`${name}.${index}.ingredients.${i}.recipeIngredientIndex`, {
              valueAsNumber: true,
            })}
          >
            {recipeIngredients.map((ri, order) => (
              <option key={order} value={order}>
                {displayName(ri)}
              </option>
            ))}
          </select>
          <Input
            className={`w-20 ${overAllocated ? "border-destructive" : ""}`}
            placeholder={t("ingredients.quantity")}
            {...register(`${name}.${index}.ingredients.${i}.quantity`)}
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
            {t("common.remove")}
          </Button>
        </div>
      ))}
      {recipeIngredients.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ recipeIngredientIndex: 0, quantity: "" })}
        >
          {t("steps.addStepIngredient")}
        </Button>
      )}
      {overAllocated && <p className="text-xs text-destructive">{t("steps.overAllocated")}</p>}
    </div>
  );
}
