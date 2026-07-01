import { Skeleton } from "@/components/ui/skeleton";
import { MealPlanSkeleton } from "@/components/plan/meal-plan-skeleton";

export default function PlanLoading() {
  return (
    <div className="space-y-4">
      {/* Matches page heading row: h1 + config button */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      {/* Day-card skeletons */}
      <MealPlanSkeleton />
    </div>
  );
}
