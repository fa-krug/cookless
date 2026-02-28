import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "./skeleton";

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
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>

      {/* Steps section */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-20" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
