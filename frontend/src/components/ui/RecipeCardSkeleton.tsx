import { Skeleton } from "./Skeleton";

export function RecipeCardSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-6 w-3/4" />
        <div className="mt-1 flex gap-x-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
      <Skeleton className="ml-3 h-9 w-9 shrink-0 rounded-md" />
    </div>
  );
}
