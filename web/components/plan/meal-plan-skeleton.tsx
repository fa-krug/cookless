import type { JSX } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function MealPlanSkeleton(): JSX.Element {
  return (
    <div className="space-y-4" aria-hidden>
      {/* Iteration header */}
      <Skeleton className="h-6 w-48" />
      {/* Day cards */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border overflow-hidden">
          {/* Day header */}
          <Skeleton className="h-10 w-full rounded-none" />
          {/* Lunch row */}
          <div className="flex items-center gap-2 px-4 py-3">
            <Skeleton className="h-4 w-14 shrink-0" />
            <Skeleton className="h-4 flex-1" />
          </div>
          {/* Dinner row */}
          <div className="flex items-center gap-2 border-t border-border px-4 py-3">
            <Skeleton className="h-4 w-14 shrink-0" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
