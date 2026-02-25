import { Skeleton } from "./Skeleton";

export function ShoppingListSkeleton() {
  return (
    <div data-testid="shopping-list-skeleton" className="space-y-4">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i}>
          <Skeleton className="h-5 w-28" />
          <div className="mt-2 space-y-2">
            {Array.from({ length: i + 2 }, (_, j) => (
              <Skeleton key={j} className="h-5 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
