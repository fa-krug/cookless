import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMealPlans } from "../hooks/useMealPlan";
import PlanGrid from "../components/PlanGrid";
import GenerateDrawer from "../components/GenerateDrawer";

export default function MealPlanPage() {
  const { t } = useTranslation();
  const { data: plans, isLoading } = useMealPlans();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentPlan = plans?.[0] ?? null;

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("plan.title")}</h1>
        {currentPlan && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            {t("plan.newPlan")}
          </button>
        )}
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

      {currentPlan && <PlanGrid plan={currentPlan} />}

      <GenerateDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
