import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useGeneratePlan, useCreateShoppingList } from "../hooks/useMealPlan";

interface GenerateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlanId?: string;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export default function GenerateDrawer({ isOpen, onClose, currentPlanId }: GenerateDrawerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const generatePlan = useGeneratePlan();
  const createShoppingList = useCreateShoppingList();

  const defaults = user?.settings;
  const [days, setDays] = useState(defaults?.plan_days ?? 7);
  const [servings, setServings] = useState(defaults?.default_servings ?? 2);
  const [knownRatio, setKnownRatio] = useState(defaults?.known_new_ratio ?? 0.7);

  function handleGenerate() {
    generatePlan.mutate(
      {
        start_date: todayISO(),
        days,
        servings,
        known_ratio: knownRatio,
      },
      { onSuccess: () => onClose() },
    );
  }

  function handleCreateShoppingList() {
    if (!currentPlanId) return;
    createShoppingList.mutate(currentPlanId, {
      onSuccess: (data) => {
        onClose();
        navigate(`/shopping/${data.id}`);
      },
    });
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden="true" />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 transform rounded-t-2xl bg-white shadow-xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto max-w-lg px-6 pb-8 pt-4">
          {/* Handle */}
          <div className="mb-4 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-gray-300" />
          </div>

          <h2 className="mb-6 text-lg font-semibold text-gray-900">{t("plan.generate")}</h2>

          {/* Days */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("plan.days")}
            </label>
            <div className="flex gap-2">
              {[7, 14].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    days === d
                      ? "bg-orange-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Servings */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("plan.servings")}
            </label>
            <input
              type="number"
              min={1}
              max={12}
              value={servings}
              onChange={(e) => setServings(Number(e.target.value))}
              className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Known/New Ratio */}
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("plan.knownRatio")} — {Math.round(knownRatio * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={knownRatio}
              onChange={(e) => setKnownRatio(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-400">
              <span>{t("recipes.toTry")}</span>
              <span>{t("recipes.known")}</span>
            </div>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleGenerate}
              disabled={generatePlan.isPending}
              className="w-full rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {generatePlan.isPending ? t("common.loading") : t("plan.generate")}
            </button>

            {currentPlanId && (
              <button
                onClick={handleCreateShoppingList}
                disabled={createShoppingList.isPending}
                className="w-full rounded-lg border border-orange-500 px-4 py-3 text-sm font-semibold text-orange-500 hover:bg-orange-50 disabled:opacity-50"
              >
                {createShoppingList.isPending
                  ? t("common.loading")
                  : t("plan.createShoppingList")}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
