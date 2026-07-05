import type { JSX } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function RecipeEditorSkeleton(): JSX.Element {
  return (
    <div className="space-y-6" aria-hidden>
      {/* header: back link + title + save button */}
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      {/* form field cards */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
