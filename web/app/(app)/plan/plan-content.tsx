import { Calendar } from "lucide-react";
import type { TVars } from "@/lib/i18n/translate";
import { db } from "@/lib/db";
import { getMealPlanView } from "@/lib/queries/meal-plan";
import { listTags } from "@/lib/queries/recipes";
import { EmptyState } from "@/components/ui/empty-state";
import { IterationCard } from "@/components/plan/iteration-card";
import { GeneratePlanDrawer } from "@/components/plan/generate-plan-drawer";
import { NextIterationButton } from "@/components/plan/iteration-actions";

type PlanContentProps = {
  householdId: string;
  todayIso: string;
  t: (key: string, vars?: TVars) => string;
};

/**
 * Async server component holding the meal-plan data query and the full page
 * body (including the header action row, which depends on plan data). Rendered
 * inside a <Suspense> boundary so the page paints its skeleton immediately and
 * this content streams in once the query resolves.
 */
export async function PlanContent({ householdId, todayIso, t }: PlanContentProps) {
  const tags = listTags(db, householdId);
  const plan = getMealPlanView(db, householdId);

  if (!plan || plan.iterations.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <h1 className="text-2xl font-bold">{t("plan.title")}</h1>
        <EmptyState
          fill
          icon={Calendar}
          title={t("plan.noPlanTitle")}
          subtitle={t("plan.noPlanSubtitle")}
          action={
            <GeneratePlanDrawer
              triggerLabel={t("plan.setup")}
              tags={tags}
              triggerClassName="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            />
          }
        />
      </div>
    );
  }

  const defaults = {
    iterationWeeks: plan.iterationWeeks,
    shoppingDays: plan.shoppingDays,
    servings: plan.servings,
    knownRatio: Number(plan.knownRatio),
    defaultLeftoverDays: plan.defaultLeftoverDays,
    excludedTagIds: plan.excludedTagIds,
  };

  const active = plan.iterations.find((it) => it.status === "ACTIVE") ?? null;
  const archived = plan.iterations.filter((it) => it.id !== active?.id);
  const ended = active !== null && active.endDate < todayIso;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("plan.title")}</h1>
        <GeneratePlanDrawer
          triggerLabel={t("plan.updateConfig")}
          tags={tags}
          defaults={defaults}
          triggerClassName="rounded-md border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
        />
      </div>

      {ended && (
        <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-primary/10 p-3 text-sm dark:border-orange-900">
          <span>{t("plan.iterationEnded")}</span>
          <NextIterationButton />
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

      {!active && (
        <EmptyState
          icon={Calendar}
          title={t("plan.noActiveTitle")}
          subtitle={t("plan.noActiveSubtitle")}
          action={<NextIterationButton />}
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
