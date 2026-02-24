import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
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
  const [currentStep, setCurrentStep] = useState(0);

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

  const steps = method === "MANUAL" ? recipe.manual_steps : recipe.machine_steps;
  const sortedSteps = [...steps].sort((a, b) => a.step_number - b.step_number);

  function handleMethodChange(newMethod: Method) {
    setMethod(newMethod);
    setCurrentStep(0);
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{recipe.title}</h1>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          {t("common.back")}
        </button>
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
        <button
          type="button"
          onClick={() => handleMethodChange("MANUAL")}
          className={`flex-1 rounded-l-lg px-4 py-2 text-sm font-medium transition-colors ${
            method === "MANUAL"
              ? "bg-orange-500 text-white"
              : "bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          {t("cooking.manualMethod")}
        </button>
        <button
          type="button"
          onClick={() => handleMethodChange("MACHINE")}
          className={`flex-1 rounded-r-lg px-4 py-2 text-sm font-medium transition-colors ${
            method === "MACHINE"
              ? "bg-orange-500 text-white"
              : "bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          {t("cooking.machineMethod")}
        </button>
      </div>

      {/* Step counter */}
      {sortedSteps.length > 0 && (
        <p className="mt-4 text-center text-sm text-gray-500">
          {t("cooking.stepOf", { current: currentStep + 1, total: sortedSteps.length })}
        </p>
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
                <span
                  className={`font-semibold ${isCurrent ? "text-lg text-orange-600" : "text-sm text-gray-500"}`}
                >
                  {step.step_number}.
                </span>
                <span className={`ml-2 ${isCurrent ? "text-lg text-gray-900" : "text-sm text-gray-700"}`}>
                  {step.instruction}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
