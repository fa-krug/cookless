import type { JSX } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function RecipeListSkeleton(): JSX.Element {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}
