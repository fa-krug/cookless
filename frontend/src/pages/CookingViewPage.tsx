import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import ProgramStepDisplay from "../components/ProgramStepDisplay";
import { useCookingProgress } from "../hooks/useCookingProgress";
import { useRecipe } from "../hooks/useRecipes";
import { useWakeLock } from "../hooks/useWakeLock";

type Method = "MANUAL" | "MACHINE";

export default function CookingViewPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: recipe, isLoading } = useRecipe(id ?? "");
  const { isActive: wakeLockActive } = useWakeLock();
  const [method, setMethod] = useState<Method>("MANUAL");

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
        <p className="text-center text-sm text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  if (!recipe || !id) {
    return (
      <div className="p-4">
        <p className="text-center text-sm text-gray-500">{t("common.error")}</p>
      </div>
    );
  }

  function handleMethodChange(newMethod: Method) {
    setMethod(newMethod);
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{recipe.title}</h1>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label={t("common.back")}
        >
          <ArrowLeft size={20} />
        </Button>
      </div>

      {/* Wake lock indicator */}
      <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
        <span
          className={`inline-block h-2 w-2 rounded-full ${wakeLockActive ? "bg-green-500" : "bg-gray-300"}`}
        />
        {wakeLockActive ? t("cooking.wakeLockActive") : t("cooking.wakeLockInactive")}
      </div>

      {/* Method tabs */}
      <div className="mt-4 flex rounded-lg border border-gray-200">
        <Button
          type="button"
          variant="ghost"
          onClick={() => handleMethodChange("MANUAL")}
          className={cn(
            "flex-1 rounded-l-lg rounded-r-none",
            method === "MANUAL"
              ? "bg-orange-500 text-white hover:bg-orange-500"
              : "bg-white text-gray-700 hover:bg-gray-50",
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
              ? "bg-orange-500 text-white hover:bg-orange-500"
              : "bg-white text-gray-700 hover:bg-gray-50",
          )}
        >
          {t("cooking.machineMethod")}
        </Button>
      </div>

      {/* Progress bar */}
      {sortedSteps.length > 0 && (
        <div className="mt-4 mb-4">
          <p className="mb-2 text-center text-sm font-medium text-gray-600">
            {t("cooking.stepOf", { current: currentStep + 1, total: sortedSteps.length })}
          </p>
          <div className="flex gap-1">
            {sortedSteps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  index <= currentStep ? "bg-orange-500" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Steps list */}
      {sortedSteps.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-500">{t("cooking.noSteps")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {sortedSteps.map((step, index) => {
            const isCurrent = index === currentStep;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setCurrentStep(index)}
                className={`w-full rounded-lg border p-4 text-left transition-all ${
                  isCurrent
                    ? "border-l-4 border-orange-500 bg-orange-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                {step.program_type ? (
                  <div className="flex items-start gap-2">
                    <span
                      className={`shrink-0 font-semibold ${isCurrent ? "text-lg text-orange-600" : "text-sm text-gray-500"}`}
                    >
                      {step.step_number}.
                    </span>
                    <ProgramStepDisplay step={step} isCurrent={isCurrent} />
                  </div>
                ) : (
                  <>
                    <span
                      className={`font-semibold ${isCurrent ? "text-lg text-orange-600" : "text-sm text-gray-500"}`}
                    >
                      {step.step_number}.
                    </span>
                    <span
                      className={`ml-2 ${isCurrent ? "text-lg text-gray-900" : "text-sm text-gray-700"}`}
                    >
                      {step.instruction}
                    </span>
                  </>
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
