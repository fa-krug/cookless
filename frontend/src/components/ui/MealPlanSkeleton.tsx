import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "./skeleton";

export function MealPlanSkeleton() {
  return (
    <div data-testid="meal-plan-skeleton" className="space-y-4">
      {/* Header bar */}
      <Skeleton className="h-6 w-40" />
      {/* Day cards */}
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
