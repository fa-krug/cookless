"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { scaleQuantity } from "@/lib/domain/recipes/scaling";
import { formatQuantity, pickName } from "@/lib/display/format";
import { Button } from "@/components/ui/button";
import type { RecipeDetail, IngredientLite, UnitLite, CookingStepDto } from "@/lib/queries/recipes";

interface Props {
  recipe: RecipeDetail;
  ingredients: IngredientLite[];
  units: UnitLite[];
  locale: string;
}

export function CookingView({ recipe, ingredients, units, locale }: Props) {
  const { t } = useT();
  const ingredientMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const hasManual = recipe.manualSteps.length > 0;
  const hasMachine = recipe.machineSteps.length > 0;
  const [method, setMethod] = useState<"MANUAL" | "MACHINE" | null>(
    hasManual && hasMachine ? null : hasManual ? "MANUAL" : hasMachine ? "MACHINE" : "MANUAL",
  );
  const [servings, setServings] = useState(recipe.defaultServings);
  const [started, setStarted] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  const steps: CookingStepDto[] = useMemo(() => {
    const list = method === "MACHINE" ? recipe.machineSteps : recipe.manualSteps;
    return [...list].sort((a, b) => a.stepNumber - b.stepNumber);
  }, [method, recipe]);

  const progressKey = `cookless-cooking-${recipe.id}-${method}`;

  // Restore progress.
  useEffect(() => {
    if (!started || !method) return;
    const saved = localStorage.getItem(progressKey);
    if (saved) {
      const n = Number(saved);
      if (Number.isFinite(n) && n >= 0 && n < steps.length) setStepIdx(n);
    }
  }, [started, method, progressKey, steps.length]);

  // Persist progress.
  useEffect(() => {
    if (started && method) localStorage.setItem(progressKey, String(stepIdx));
  }, [started, method, progressKey, stepIdx]);

  if (!started) {
    return (
      <div className="space-y-6">
        <Link
          href={`/recipes/${recipe.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={16} />
          {t("common.back")}
        </Link>
        <h1 className="text-2xl font-bold">{recipe.title}</h1>

        <div className="flex items-center gap-3">
          <span className="text-sm">{t("recipes.servings")}</span>
          <Button variant="outline" size="icon" onClick={() => setServings((s) => Math.max(1, s - 1))}>
            <Minus size={16} />
          </Button>
          <span className="w-8 text-center text-lg font-semibold">{servings}</span>
          <Button variant="outline" size="icon" onClick={() => setServings((s) => Math.min(12, s + 1))}>
            <Plus size={16} />
          </Button>
        </div>

        {hasManual && hasMachine && (
          <div className="flex gap-2">
            <Button variant={method === "MANUAL" ? "default" : "outline"} onClick={() => setMethod("MANUAL")}>
              {t("steps.manualSteps")}
            </Button>
            <Button variant={method === "MACHINE" ? "default" : "outline"} onClick={() => setMethod("MACHINE")}>
              {t("steps.machineSteps")}
            </Button>
          </div>
        )}

        <Button
          className="w-full"
          disabled={steps.length === 0 && method === null}
          onClick={() => {
            if (!method) setMethod(hasManual ? "MANUAL" : "MACHINE");
            setStarted(true);
          }}
        >
          {t("cooking.start")}
        </Button>
      </div>
    );
  }

  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button type="button" className="text-sm text-muted-foreground" onClick={() => setStarted(false)}>
          <ChevronLeft size={16} className="inline" /> {recipe.title}
        </button>
        <span className="text-sm text-muted-foreground">
          {t("cooking.stepOf", { current: stepIdx + 1, total: steps.length })}
        </span>
      </div>

      <div className="rounded-xl border bg-card p-6">
        {step?.programType && (
          <p className="mb-2 text-sm font-medium text-primary">{t(`steps.programs.${step.programType}`)}</p>
        )}
        <p className="text-lg leading-relaxed">{step?.instruction}</p>
        {step && step.ingredients.length > 0 && (
          <ul className="mt-4 space-y-1 border-t pt-3 text-sm text-muted-foreground">
            {step.ingredients.map((si) => {
              const ri = recipe.ingredients.find((x) => x.id === si.recipeIngredientId);
              if (!ri) return null;
              const ing = ingredientMap.get(ri.ingredientId);
              const unit = unitMap.get(ri.unitId);
              const qty = formatQuantity(
                scaleQuantity(si.quantity, servings, recipe.defaultServings).toString(),
              );
              return (
                <li key={si.recipeIngredientId}>
                  {qty}
                  {unit ? ` ${unit.abbreviation}` : ""} {ing ? pickName(locale, ing) : "?"}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={stepIdx === 0}
          onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft size={16} /> {t("cooking.prevStep")}
        </Button>
        {isLast ? (
          <Button asChild onClick={() => localStorage.removeItem(progressKey)}>
            <Link href={`/recipes/${recipe.id}`}>{t("cooking.done")}</Link>
          </Button>
        ) : (
          <Button onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}>
            {t("cooking.nextStep")} <ChevronRight size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}
