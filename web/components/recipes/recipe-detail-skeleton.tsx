import type { JSX } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function RecipeDetailSkeleton(): JSX.Element {
  return (
    <div className="space-y-6" aria-hidden>
      {/* back link */}
      <Skeleton className="h-4 w-24" />
      {/* hero image */}
      <Skeleton className="h-56 w-full rounded-xl" />
      {/* title */}
      <Skeleton className="h-9 w-2/3" />
      {/* meta row */}
      <div className="flex gap-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      {/* ingredients + steps cards */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
