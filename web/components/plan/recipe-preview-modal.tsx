"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { scaleQuantity } from "@/lib/domain/recipes/scaling";
import { formatQuantity, pickName } from "@/lib/display/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type {
  RecipeDetail,
  IngredientLite,
  UnitLite,
  CookingStepDto,
  StepIngredientDto,
} from "@/lib/queries/recipes";

interface RecipePreviewData {
  recipe: RecipeDetail;
  ingredients: IngredientLite[];
  units: UnitLite[];
}

interface RecipePreviewModalProps {
  recipeId: string;
  servings: number;
  defaultServingsFallback?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecipePreviewModal({
  recipeId,
  servings,
  open,
  onOpenChange,
}: RecipePreviewModalProps) {
  const { locale, t } = useT();
  const [data, setData] = useState<RecipePreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(false);
    setData(null);

    fetch(`/api/recipes/${recipeId}/preview`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<RecipePreviewData>;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [open, recipeId]);

  const recipe = data?.recipe ?? null;
  const ingredientMap = new Map((data?.ingredients ?? []).map((i) => [i.id, i]));
  const unitMap = new Map((data?.units ?? []).map((u) => [u.id, u]));
  const defaultServings = recipe?.defaultServings ?? servings;

  function scaledLine(
    riId: number,
    quantity: string,
    unitId: number,
    ingredientId: number,
  ) {
    const qty = formatQuantity(scaleQuantity(quantity, servings, defaultServings).toString());
    const unit = unitMap.get(unitId);
    const ing = ingredientMap.get(ingredientId);
    const unitStr = unit?.abbreviation ?? "";
    const ingName = ing ? pickName(locale, ing) : "?";
    return `${qty}${unitStr ? " " + unitStr : ""} ${ingName}`.trim();
  }

  function renderStepIngredients(stepIngs: StepIngredientDto[]) {
    if (!recipe || stepIngs.length === 0) return null;
    // Build a map from recipe-ingredient id → ingredient details
    const riById = new Map(recipe.ingredients.map((ri) => [ri.id, ri]));
    return (
      <ul className="mt-1 space-y-0.5 pl-4">
        {stepIngs.map((si) => {
          const ri = riById.get(si.recipeIngredientId);
          if (!ri) return null;
          const qty = formatQuantity(scaleQuantity(si.quantity, servings, defaultServings).toString());
          const unit = unitMap.get(ri.unitId);
          const ing = ingredientMap.get(ri.ingredientId);
          return (
            <li key={si.recipeIngredientId} className="text-xs text-muted-foreground">
              <span className="font-medium">
                {qty}
                {unit?.abbreviation ? ` ${unit.abbreviation}` : ""}
              </span>{" "}
              {ing ? pickName(locale, ing) : "?"}
            </li>
          );
        })}
      </ul>
    );
  }

  function renderSteps(steps: CookingStepDto[], titleKey: string) {
    if (steps.length === 0) return null;
    const sorted = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);
    return (
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-foreground">{t(titleKey)}</h3>
        <ol className="mt-2 space-y-3">
          {sorted.map((step, i) => (
            <li key={step.id} className="text-sm text-foreground">
              <span className="font-medium">{i + 1}.</span> {step.instruction}
              {renderStepIngredients(step.ingredients)}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <>
            <DialogHeader>
              <DialogTitle>{t("common.error")}</DialogTitle>
              <DialogDescription>{t("plan.preview.loadError")}</DialogDescription>
            </DialogHeader>
          </>
        )}

        {!loading && !error && recipe && (
          <>
            <DialogHeader>
              <DialogTitle>{recipe.title}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span>{t("plan.preview.servings", { count: servings })}</span>
                  {recipe.prepTimeMinutes != null && (
                    <span>
                      {t("recipes.prepTime")}: {recipe.prepTimeMinutes} {t("recipes.minutes")}
                    </span>
                  )}
                  {recipe.cookTimeMinutes != null && (
                    <span>
                      {t("recipes.cookTime")}: {recipe.cookTimeMinutes} {t("recipes.minutes")}
                    </span>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>

            {/* Ingredients */}
            {recipe.ingredients.length > 0 && (
              <div className="mt-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("plan.preview.ingredients")}
                </h3>
                <ul className="mt-2 space-y-1">
                  {recipe.ingredients.map((ri) => (
                    <li key={ri.id} className="text-sm text-foreground">
                      {scaledLine(ri.id, ri.quantity, ri.unitId, ri.ingredientId)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Steps */}
            {renderSteps(recipe.manualSteps, "plan.preview.manualSteps")}
            {renderSteps(recipe.machineSteps, "plan.preview.machineSteps")}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
