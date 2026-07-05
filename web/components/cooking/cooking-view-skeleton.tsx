import type { JSX } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function CookingViewSkeleton(): JSX.Element {
  return (
    <div className="space-y-6" aria-hidden>
      {/* header: back link + title */}
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-1/2" />
      {/* current step block */}
      <Skeleton className="h-40 w-full rounded-xl" />
      {/* step navigation */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-24 rounded-md" />
      </div>
    </div>
  );
}
