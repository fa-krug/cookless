import { ArrowLeft, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import ProgramStepDisplay from "../components/ProgramStepDisplay";
import { useCookingProgress } from "../hooks/useCookingProgress";
import { useIngredients } from "../hooks/useIngredients";
import { useRecipe } from "../hooks/useRecipes";
import { useUnits } from "../hooks/useUnits";
import { useWakeLock } from "../hooks/useWakeLock";
import { formatQty } from "../lib/exportRecipe";

type Method = "MANUAL" | "MACHINE";

export default function CookingViewPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: recipe, isLoading } = useRecipe(id ?? "");
  const { data: ingredients } = useIngredients();
  const { data: units } = useUnits();
  const { isActive: wakeLockActive } = useWakeLock();
  const [method, setMethod] = useState<Method>("MANUAL");
  const [servings, setServings] = useState<number | null>(null);

  const lang = i18n.language === "de" ? "de" : "en";
  const nameKey = lang === "de" ? "name_de" : "name_en";

  const ingredientMap = useMemo(
    () => new Map(ingredients?.map((i) => [i.id, i])),
    [ingredients],
  );
  const unitMap = useMemo(
    () => new Map(units?.map((u) => [u.id, u])),
    [units],
  );

  const currentServings = servings ?? recipe?.default_servings ?? 1;
  const scale = recipe && recipe.default_servings > 0
    ? currentServings / recipe.default_servings
    : 1;

  const sortedSteps = useMemo(() => {
    if (!recipe) return [];
    const steps = method === "MANUAL" ? recipe.manual_steps : recipe.machine_steps;
    return [...steps].sort((a, b) => a.step_number - b.step_number);
  }, [recipe, method]);

  const { currentStep, setStep: setCurrentStep, clearProgress } = useCookingProgress(
    id ?? "",
    method,
    sortedSteps.length,
  );

  if (isLoading) {
    return (
      <div className="p-4">
        <p className="text-center text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (!recipe || !id) {
    return (
      <div className="p-4">
        <p className="text-center text-sm text-muted-foreground">{t("common.error")}</p>
      </div>
    );
  }

  // Build a map from recipe_ingredient_id to RecipeIngredient for step ingredient display
  const riMap = new Map(recipe.ingredients.map((ri) => [ri.id, ri]));

  function handleMethodChange(newMethod: Method) {
    setMethod(newMethod);
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{recipe.title}</h1>
        <IconButton
          type="button"
          variant="ghost"
          onClick={() => navigate(-1)}
          tooltip={t("common.back")}
          aria-label={t("common.back")}
        >
          <ArrowLeft size={20} />
        </IconButton>
      </div>

      {/* Servings + Wake lock */}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconButton
            type="button"
            variant="outline"
            className="h-7 w-7"
            onClick={() => setServings(Math.max(1, currentServings - 1))}
            tooltip={t("cooking.lessServings")}
            aria-label={t("cooking.lessServings")}
          >
            <Minus size={14} />
          </IconButton>
          <span className="text-sm font-medium">
            {currentServings} {t("recipes.servings")}
          </span>
          <IconButton
            type="button"
            variant="outline"
            className="h-7 w-7"
            onClick={() => setServings(currentServings + 1)}
            tooltip={t("cooking.moreServings")}
            aria-label={t("cooking.moreServings")}
          >
            <Plus size={14} />
          </IconButton>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={`inline-block h-2 w-2 rounded-full ${wakeLockActive ? "bg-green-500" : "bg-border"}`}
          />
          {wakeLockActive ? t("cooking.wakeLockActive") : t("cooking.wakeLockInactive")}
        </div>
      </div>

      {/* Method tabs */}
      <div className="mt-4 flex rounded-lg border border-border">
        <Button
          type="button"
          variant="ghost"
          onClick={() => handleMethodChange("MANUAL")}
          className={cn(
            "flex-1 rounded-l-lg rounded-r-none",
            method === "MANUAL"
              ? "bg-primary/100 text-white hover:bg-primary/100"
              : "bg-card text-foreground hover:bg-muted",
          )}
        >
          {t("cooking.manualMethod")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => handleMethodChange("MACHINE")}
          className={cn(
            "flex-1 rounded-r-lg rounded-l-none",
            method === "MACHINE"
              ? "bg-primary/100 text-white hover:bg-primary/100"
              : "bg-card text-foreground hover:bg-muted",
          )}
        >
          {t("cooking.machineMethod")}
        </Button>
      </div>

      {/* Progress bar */}
      {sortedSteps.length > 0 && (
        <div className="mt-4 mb-4">
          <p className="mb-2 text-center text-sm font-medium text-muted-foreground">
            {t("cooking.stepOf", { current: currentStep + 1, total: sortedSteps.length })}
          </p>
          <div className="flex gap-1">
            {sortedSteps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  index <= currentStep ? "bg-primary/100" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Steps list */}
      {sortedSteps.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t("cooking.noSteps")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {sortedSteps.map((step, index) => {
            const isCurrent = index === currentStep;
            const stepIngredients = step.ingredients ?? [];
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setCurrentStep(index)}
                className={`w-full rounded-lg border p-4 text-left transition-all ${
                  isCurrent
                    ? "border-l-4 border-primary bg-primary/10"
                    : "border-border bg-card"
                }`}
              >
                {step.program_type ? (
                  <div className="flex items-start gap-2">
                    <span
                      className={`shrink-0 font-semibold ${isCurrent ? "text-lg text-primary" : "text-sm text-muted-foreground"}`}
                    >
                      {step.step_number}.
                    </span>
                    <ProgramStepDisplay step={step} isCurrent={isCurrent} />
                  </div>
                ) : (
                  <>
                    <span
                      className={`font-semibold ${isCurrent ? "text-lg text-primary" : "text-sm text-muted-foreground"}`}
                    >
                      {step.step_number}.
                    </span>
                    <span
                      className={`ml-2 ${isCurrent ? "text-lg text-foreground" : "text-sm text-foreground"}`}
                    >
                      {step.instruction}
                    </span>
                  </>
                )}

                {/* Step ingredients */}
                {stepIngredients.length > 0 && (
                  <ul className={`mt-2 space-y-0.5 ${isCurrent ? "" : "opacity-70"}`}>
                    {stepIngredients.map((si) => {
                      const ri = riMap.get(si.recipe_ingredient_id);
                      if (!ri) return null;
                      const ing = ingredientMap.get(ri.ingredient);
                      const unit = unitMap.get(ri.unit);
                      const scaledQty = parseFloat(si.quantity) * scale;
                      return (
                        <li
                          key={si.recipe_ingredient_id}
                          className="text-sm text-muted-foreground"
                        >
                          <span className="font-medium">
                            {formatQty(scaledQty)} {unit?.abbreviation ?? ""}
                          </span>{" "}
                          {ing ? ing[nameKey] : "?"}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Done button on last step */}
      {currentStep >= sortedSteps.length - 1 && sortedSteps.length > 0 && (
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full"
          onClick={() => {
            clearProgress();
            navigate(`/recipes/${id}`);
          }}
        >
          {t("cooking.done")}
        </Button>
      )}
    </div>
  );
}
