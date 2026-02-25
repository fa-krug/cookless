import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import GenerateDrawer from "../components/GenerateDrawer";
import IterationCard from "../components/IterationCard";
import {
  useMealPlans,
  useNextIteration,
  useRenewIteration,
} from "../hooks/useMealPlan";
import { useToast } from "../hooks/useToast";

function getToday(): string {
  return new Date().toISOString().split("T")[0];
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.993 6.993 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-gray-500">{t("common.loading")}</p>
      )}

      {/* Empty state */}
      {!isLoading && !currentPlan && (
        <div className="mt-12 text-center">
          <p className="text-gray-500">{t("plan.noPlan")}</p>
          <button
            onClick={() => setDrawerOpen(true)}
            className="mt-4 rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600"
          >
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
                className="mt-3 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
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
