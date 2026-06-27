import { Calendar } from "lucide-react";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getMealPlanView } from "@/lib/queries/meal-plan";
import { EmptyState } from "@/components/ui/empty-state";
import { IterationCard } from "@/components/plan/iteration-card";

export default async function PlanPage() {
  const { householdId } = await requireHousehold();
  const { locale, t } = await getI18n();
  const todayIso = new Date().toISOString().slice(0, 10);

  const plan = getMealPlanView(db, householdId);
  if (!plan || plan.iterations.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("plan.title")}</h1>
        <EmptyState
          icon={Calendar}
          title={t("plan.noPlanTitle")}
          subtitle={t("plan.noPlanSubtitle")}
          action={
            <button
              type="button"
              disabled
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-50 cursor-not-allowed"
              // TODO(plan-6): generate first iteration
            >
              {t("plan.setup")}
            </button>
          }
        />
      </div>
    );
  }

  const [active, ...archived] = plan.iterations;
  const ended = active && active.endDate < todayIso;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("plan.title")}</h1>

      {ended && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm dark:border-orange-900 dark:bg-orange-950">
          {t("plan.iterationEnded")}
        </div>
      )}

      {active && (
        <IterationCard
          iteration={active}
          shoppingDays={plan.shoppingDays}
          isArchived={false}
          todayIso={todayIso}
        />
      )}

      {archived.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">
            {t("plan.pastIterations")}
          </h2>
          {archived.map((it) => (
            <IterationCard
              key={it.id}
              iteration={it}
              shoppingDays={plan.shoppingDays}
              isArchived
              todayIso={todayIso}
            />
          ))}
        </section>
      )}
    </div>
  );
}
