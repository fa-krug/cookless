import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMealPlans, useRegeneratePlan } from "../hooks/useMealPlan";
import PlanGrid from "../components/PlanGrid";
import GenerateDrawer from "../components/GenerateDrawer";

export default function MealPlanPage() {
  const { t } = useTranslation();
  const { data: plans, isLoading } = useMealPlans();
  const regeneratePlan = useRegeneratePlan();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentPlan = plans?.[0] ?? null;

  function handleRegenerate() {
    if (!currentPlan) return;
    regeneratePlan.mutate(currentPlan.id);
  }

  function formatWeekOf(dateStr: string): string {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("plan.title")}</h1>
        <button
          onClick={() => setDrawerOpen(true)}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          {t("plan.generate")}
        </button>
      </div>

      {isLoading && <p className="text-sm text-gray-500">{t("common.loading")}</p>}

      {!isLoading && !currentPlan && (
        <div className="mt-12 text-center">
          <p className="text-gray-500">{t("plan.noPlan")}</p>
          <button
            onClick={() => setDrawerOpen(true)}
            className="mt-4 rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600"
          >
            {t("plan.generate")}
          </button>
        </div>
      )}

      {currentPlan && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {t("plan.weekOf", { date: formatWeekOf(currentPlan.start_date) })}
            </p>
            <button
              onClick={handleRegenerate}
              disabled={regeneratePlan.isPending}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-orange-500 hover:bg-orange-50 disabled:opacity-50"
            >
              {regeneratePlan.isPending ? t("common.loading") : t("plan.regenerate")}
            </button>
          </div>

          <PlanGrid plan={currentPlan} />
        </div>
      )}

      <GenerateDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentPlanId={currentPlan?.id}
      />
    </div>
  );
}
