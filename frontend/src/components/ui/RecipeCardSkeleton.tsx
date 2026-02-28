import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "./skeleton";

export function RecipeCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-6 w-3/4" />
            <div className="mt-1 flex gap-x-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        </div>
        <Skeleton className="ml-3 h-9 w-9 shrink-0 rounded-md" />
      </CardContent>
    </Card>
  );
}
