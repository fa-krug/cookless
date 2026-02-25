import { Skeleton } from "./Skeleton";

export function SettingsSkeleton() {
  return (
    <div data-testid="settings-skeleton" className="space-y-6">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <Skeleton className="h-5 w-32" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
