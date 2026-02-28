import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "./skeleton";

export function SettingsSkeleton() {
  return (
    <div data-testid="settings-skeleton" className="space-y-3">
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i}>
          <CardContent className="flex items-center justify-between px-3 py-2">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-1 h-3 w-24" />
            </div>
            <Skeleton className="ml-3 h-8 w-8 shrink-0 rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
