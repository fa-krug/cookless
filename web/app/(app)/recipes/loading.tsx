import { Skeleton } from "@/components/ui/skeleton";
import { RecipeListSkeleton } from "@/components/recipes/recipe-list-skeleton";

export default function RecipesLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Matches page heading row: h1 + button group */}
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      {/* Filter card placeholder */}
      <Skeleton className="h-12 w-full rounded-xl" />
      {/* Recipe list skeletons */}
      <RecipeListSkeleton />
    </div>
  );
}
