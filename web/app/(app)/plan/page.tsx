import { Suspense } from "react";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { Skeleton } from "@/components/ui/skeleton";
import { MealPlanSkeleton } from "@/components/plan/meal-plan-skeleton";
import { PlanContent } from "./plan-content";

export default async function PlanPage() {
  const { householdId } = await requireHousehold();
  const { t } = await getI18n();
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
          <MealPlanSkeleton />
        </div>
      }
    >
      <PlanContent householdId={householdId} todayIso={todayIso} t={t} />
    </Suspense>
  );
}
