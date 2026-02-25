import { CalendarPlus, Settings, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import GenerateDrawer from "../components/GenerateDrawer";
import IterationCard from "../components/IterationCard";
import { MealPlanSkeleton } from "../components/ui/MealPlanSkeleton";
import {
  useMealPlans,
  useNextIteration,
  useRenewIteration,
} from "../hooks/useMealPlan";
import { useToast } from "../hooks/useToast";

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MealPlanPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const { data: plans, isLoading } = useMealPlans();
  const nextIteration = useNextIteration();
  const renewIteration = useRenewIteration();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentPlan = plans?.[0] ?? null;

  const today = useMemo(() => getToday(), []);

  const activeIteration = currentPlan?.iterations.find(
    (it) => it.status === "ACTIVE",
  );
  const archivedIterations = useMemo(
    () =>
      currentPlan?.iterations
        .filter((it) => it.status === "ARCHIVED")
        .sort(
          (a, b) =>
            new Date(b.start_date).getTime() -
            new Date(a.start_date).getTime(),
        ) ?? [],
    [currentPlan?.iterations],
  );

  const activeIterationEnded = activeIteration
    ? activeIteration.end_date < today
    : false;

  function handleRenew() {
    if (!activeIteration) return;
    renewIteration.mutate(activeIteration.id, {
      onError: () => addToast(t("errors.planGenerate"), "error"),
    });
  }

  function handleNextIteration() {
    nextIteration.mutate(undefined, {
      onError: () => addToast(t("errors.planGenerate"), "error"),
    });
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("plan.title")}</h1>
        {currentPlan && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label={t("plan.updateConfig")}
          >
            <Settings size={20} />
          </button>
        )}
      </div>

      {isLoading && <MealPlanSkeleton />}

      {/* Empty state */}
      {!isLoading && !currentPlan && (
        <div className="mt-12 text-center">
          <p className="text-gray-500">{t("plan.noPlan")}</p>
          <button
            onClick={() => setDrawerOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600"
          >
            <Sparkles size={16} />
            {t("plan.setup")}
          </button>
        </div>
      )}

      {currentPlan && (
        <>
          {/* Active iteration ended prompt */}
          {activeIterationEnded && (
            <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-4 text-center">
              <p className="text-sm text-gray-700">
                {t("plan.iterationEnded")}
              </p>
              <button
                onClick={handleNextIteration}
                disabled={nextIteration.isPending}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                <CalendarPlus size={16} />
                {nextIteration.isPending
                  ? t("common.loading")
                  : t("plan.generateNext")}
              </button>
            </div>
          )}

          {/* Active iteration */}
          {activeIteration && (
            <IterationCard
              iteration={activeIteration}
              shoppingDays={currentPlan.shopping_days}
              isArchived={false}
              onRenew={handleRenew}
            />
          )}

          {/* Archived iterations */}
          {archivedIterations.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-gray-400">
                {t("plan.pastIterations")}
              </h2>
              <div className="space-y-4">
                {archivedIterations.map((it) => (
                  <IterationCard
                    key={it.id}
                    iteration={it}
                    shoppingDays={currentPlan.shopping_days}
                    isArchived
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <GenerateDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        existingPlan={currentPlan}
      />
    </div>
  );
}
