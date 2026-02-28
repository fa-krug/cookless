import { Calendar, CalendarPlus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
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
import { toast } from "sonner";

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MealPlanPage() {
  const { t } = useTranslation();
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
      onError: () => toast.error(t("errors.planGenerate")),
    });
  }

  function handleNextIteration() {
    nextIteration.mutate(undefined, {
      onError: () => toast.error(t("errors.planGenerate")),
    });
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("plan.title")}</h1>
        {currentPlan && (
          <IconButton
            variant="ghost"
            onClick={() => setDrawerOpen(true)}
            tooltip={t("plan.updateConfig")}
            aria-label={t("plan.updateConfig")}
          >
            <Settings size={20} />
          </IconButton>
        )}
      </div>

      {isLoading && <MealPlanSkeleton />}

      {/* Empty state */}
      {!isLoading && !currentPlan && (
        <EmptyState
          icon={Calendar}
          title={t("plan.noPlanTitle")}
          subtitle={t("plan.noPlanSubtitle")}
          action={{ label: t("plan.setup"), onClick: () => setDrawerOpen(true) }}
        />
      )}

      {currentPlan && (
        <>
          {/* Active iteration ended prompt */}
          {activeIterationEnded && (
            <div className="mb-4 rounded-lg border border-orange-200 bg-primary/10 p-4 text-center">
              <p className="text-sm text-foreground">
                {t("plan.iterationEnded")}
              </p>
              <Button
                className="mt-3"
                onClick={handleNextIteration}
                disabled={nextIteration.isPending}
              >
                {nextIteration.isPending ? <Spinner /> : <CalendarPlus size={16} />}
                {nextIteration.isPending
                  ? t("common.loading")
                  : t("plan.generateNext")}
              </Button>
            </div>
          )}

          {/* Active iteration */}
          {activeIteration && (
            <IterationCard
              iteration={activeIteration}
              shoppingDays={currentPlan.shopping_days}
              isArchived={false}
              onRenew={handleRenew}
              isRenewing={renewIteration.isPending}
            />
          )}

          {/* No active iteration */}
          {!activeIteration && !activeIterationEnded && (
            <EmptyState
              icon={CalendarPlus}
              title={t("plan.noActiveTitle")}
              subtitle={t("plan.noActiveSubtitle")}
              action={{ label: t("plan.generateNext"), onClick: handleNextIteration }}
            />
          )}

          {/* Archived iterations */}
          {archivedIterations.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
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
