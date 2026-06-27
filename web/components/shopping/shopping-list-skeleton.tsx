import { Skeleton } from "@/components/ui/skeleton";

export function ShoppingListSkeleton() {
  return (
    <div className="space-y-4">
      {/* Page title */}
      <Skeleton className="h-8 w-48" />
      {/* Info bar */}
      <Skeleton className="h-5 w-40" />
      {/* Category sections */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card shadow-sm">
            {/* Category header */}
            <div className="flex items-center justify-between px-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
            {/* Items */}
            <div className="divide-y divide-border border-t border-border">
              {[1, 2, 3].map((j) => (
                <div key={j} className="flex items-center gap-3 px-4 py-2.5">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-full max-w-xs" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
