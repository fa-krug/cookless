import { ArrowLeft, ChefHat, ChevronLeft, ChevronRight, Hand, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [method, setMethod] = useState<Method | null>(null);
  const [servings, setServings] = useState<number | null>(null);
  const [started, setStarted] = useState(false);

  // Swipe state
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swipeContainerRef = useRef<HTMLDivElement>(null);

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
  const scale =
    recipe && recipe.default_servings > 0 ? currentServings / recipe.default_servings : 1;

  const resolvedMethod = method ?? "MANUAL";

  const sortedSteps = useMemo(() => {
    if (!recipe) return [];
    const steps = resolvedMethod === "MANUAL" ? recipe.manual_steps : recipe.machine_steps;
    return [...steps].sort((a, b) => a.step_number - b.step_number);
  }, [recipe, resolvedMethod]);

  const { currentStep, setStep: setCurrentStep, clearProgress } = useCookingProgress(
    id ?? "",
    resolvedMethod,
    sortedSteps.length,
  );

  const hasManualSteps = (recipe?.manual_steps.length ?? 0) > 0;
  const hasMachineSteps = (recipe?.machine_steps.length ?? 0) > 0;

  const goNext = useCallback(() => {
    if (currentStep < sortedSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  }, [currentStep, sortedSteps.length, setCurrentStep]);

  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep, setCurrentStep]);

  // Touch handlers for swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      const minSwipeDistance = 50;

      // Only trigger if horizontal swipe is dominant
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
        if (deltaX < 0) {
          goNext();
        } else {
          goPrev();
        }
      }
      touchStartX.current = null;
      touchStartY.current = null;
    },
    [goNext, goPrev],
  );

  // Arrow-key navigation while cooking (laptop/tablet keyboards in the kitchen)
  useEffect(() => {
    if (!started) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [started, goNext, goPrev]);

  if (isLoading) {
    return (
      <div className="p-4">
        <p className="text-center text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (!recipe || !id) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4">
        <p className="text-center text-sm text-muted-foreground">{t("common.error")}</p>
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          {t("common.back")}
        </Button>
      </div>
    );
  }

  const riMap = new Map(recipe.ingredients.map((ri) => [ri.id, ri]));

  // ── Setup screen (before cooking starts) ──────────────────────
  if (!started) {
    return (
      <div className="flex min-h-[60vh] flex-col p-4">
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

        <div className="mt-8 flex flex-1 flex-col items-center justify-center gap-8">
          {/* Portions */}
          <div className="text-center">
            <p className="mb-3 text-sm font-medium text-muted-foreground">
              {t("cooking.howManyServings")}
            </p>
            <div className="flex items-center justify-center gap-4">
              <IconButton
                type="button"
                variant="outline"
                className="h-10 w-10"
                onClick={() => setServings(Math.max(1, currentServings - 1))}
                tooltip={t("cooking.lessServings")}
                aria-label={t("cooking.lessServings")}
              >
                <Minus size={18} />
              </IconButton>
              <span className="min-w-[3rem] text-center text-3xl font-bold">
                {currentServings}
              </span>
              <IconButton
                type="button"
                variant="outline"
                className="h-10 w-10"
                onClick={() => setServings(currentServings + 1)}
                tooltip={t("cooking.moreServings")}
                aria-label={t("cooking.moreServings")}
              >
                <Plus size={18} />
              </IconButton>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t("recipes.servings")}</p>
          </div>

          {/* Cooking mode */}
          {hasManualSteps && hasMachineSteps && (
            <div className="w-full max-w-sm text-center">
              <p className="mb-3 text-sm font-medium text-muted-foreground">
                {t("cooking.howToCook")}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMethod("MANUAL")}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                    (method ?? "MANUAL") === "MANUAL"
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-muted-foreground/30",
                  )}
                >
                  <Hand size={28} className={(method ?? "MANUAL") === "MANUAL" ? "text-primary" : "text-muted-foreground"} />
                  <span className={cn("text-sm font-medium", (method ?? "MANUAL") === "MANUAL" ? "text-primary" : "text-muted-foreground")}>
                    {t("cooking.manualMethod")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("MACHINE")}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                    method === "MACHINE"
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-muted-foreground/30",
                  )}
                >
                  <ChefHat size={28} className={method === "MACHINE" ? "text-primary" : "text-muted-foreground"} />
                  <span className={cn("text-sm font-medium", method === "MACHINE" ? "text-primary" : "text-muted-foreground")}>
                    {t("cooking.machineMethod")}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Start button */}
          <Button
            type="button"
            className="w-full max-w-sm text-lg"
            size="lg"
            onClick={() => {
              // Default to whichever method has steps
              if (!method) {
                if (hasManualSteps) setMethod("MANUAL");
                else if (hasMachineSteps) setMethod("MACHINE");
              }
              setStarted(true);
            }}
          >
            {t("cooking.start")}
          </Button>
        </div>
      </div>
    );
  }

  // ── Cooking screen ────────────────────────────────────────────
  const currentStepData = sortedSteps[currentStep];
  const isLastStep = currentStep >= sortedSteps.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <div className="flex min-h-[60vh] flex-col p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{recipe.title}</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`inline-block h-2 w-2 rounded-full ${wakeLockActive ? "bg-green-500" : "bg-border"}`}
            />
          </div>
          <IconButton
            type="button"
            variant="ghost"
            onClick={() => {
              setStarted(false);
            }}
            tooltip={t("common.back")}
            aria-label={t("common.back")}
          >
            <ArrowLeft size={20} />
          </IconButton>
        </div>
      </div>

      {/* Servings (compact) */}
      <div className="mt-1 flex items-center justify-between">
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
        <span className="text-xs text-muted-foreground">
          {resolvedMethod === "MANUAL" ? t("cooking.manualMethod") : t("cooking.machineMethod")}
        </span>
      </div>

      {/* Progress bar */}
      {sortedSteps.length > 0 && (
        <div className="mt-3 mb-2">
          <p className="mb-1.5 text-center text-sm font-medium text-muted-foreground">
            {t("cooking.stepOf", { current: currentStep + 1, total: sortedSteps.length })}
          </p>
          <div className="flex gap-1">
            {sortedSteps.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setCurrentStep(index)}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  index <= currentStep ? "bg-primary/100" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Current step (big, swipeable) */}
      {sortedSteps.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t("cooking.noSteps")}</p>
      ) : currentStepData ? (
        <div
          ref={swipeContainerRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="mt-2 flex flex-1 flex-col"
        >
          <div className="flex-1 rounded-xl border border-primary bg-primary/5 p-5">
            {/* Step instruction */}
            {currentStepData.program_type ? (
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-2xl font-bold text-primary">
                  {currentStepData.step_number}.
                </span>
                <div className="[&>div]:!mt-0">
                  <ProgramStepDisplay step={currentStepData} isCurrent />
                </div>
              </div>
            ) : (
              <div>
                <span className="text-2xl font-bold text-primary">
                  {currentStepData.step_number}.
                </span>
                <p className="mt-2 text-xl leading-relaxed text-foreground">
                  {currentStepData.instruction}
                </p>
              </div>
            )}

            {/* Step ingredients */}
            {(currentStepData.ingredients ?? []).length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-border/50 pt-3">
                {(currentStepData.ingredients ?? []).map((si) => {
                  const ri = riMap.get(si.recipe_ingredient_id);
                  if (!ri) return null;
                  const ing = ingredientMap.get(ri.ingredient);
                  const unit = unitMap.get(ri.unit);
                  const scaledQty = parseFloat(si.quantity) * scale;
                  return (
                    <li key={si.recipe_ingredient_id} className="text-base text-muted-foreground">
                      <span className="font-medium">
                        {formatQty(scaledQty)} {unit?.abbreviation ?? ""}
                      </span>{" "}
                      {ing ? ing[nameKey] : "?"}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Navigation buttons */}
          <div className="mt-4 flex items-center gap-3">
            <IconButton
              type="button"
              variant="outline"
              className="h-12 w-12"
              onClick={goPrev}
              disabled={isFirstStep}
              tooltip={t("cooking.prevStep")}
              aria-label={t("cooking.prevStep")}
            >
              <ChevronLeft size={24} />
            </IconButton>

            {isLastStep ? (
              <Button
                type="button"
                className="h-12 flex-1 text-base"
                onClick={() => {
                  clearProgress();
                  navigate(`/recipes/${id}`);
                }}
              >
                {t("cooking.done")}
              </Button>
            ) : (
              <Button
                type="button"
                className="h-12 flex-1 text-base"
                onClick={goNext}
              >
                {t("cooking.nextStep")}
              </Button>
            )}

            <IconButton
              type="button"
              variant="outline"
              className="h-12 w-12"
              onClick={goNext}
              disabled={isLastStep}
              tooltip={t("cooking.nextStep")}
              aria-label={t("cooking.nextStep")}
            >
              <ChevronRight size={24} />
            </IconButton>
          </div>

          {/* Swipe hint on mobile */}
          <p className="mt-2 text-center text-xs text-muted-foreground sm:hidden">
            {t("cooking.swipeHint")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
