import { Skeleton } from "./Skeleton";

export function MealPlanSkeleton() {
  return (
    <div data-testid="meal-plan-skeleton" className="space-y-4">
      {/* Header bar */}
      <Skeleton className="h-6 w-40" />
      {/* Day cards */}
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <Skeleton className="h-5 w-24" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
