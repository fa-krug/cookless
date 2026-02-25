import { Skeleton } from "./Skeleton";

export function RecipeDetailSkeleton() {
  return (
    <div data-testid="recipe-detail-skeleton" className="p-4">
      {/* Title */}
      <Skeleton className="h-7 w-2/3" />

      {/* Meta row */}
      <div className="mt-3 flex gap-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>

      {/* Ingredients section */}
      <Skeleton className="mt-6 h-5 w-24" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>

      {/* Steps section */}
      <Skeleton className="mt-6 h-5 w-20" />
      <div className="mt-3 space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
