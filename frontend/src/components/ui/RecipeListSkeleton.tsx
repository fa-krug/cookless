import { RecipeCardSkeleton } from "./RecipeCardSkeleton";

export function RecipeListSkeleton() {
  return (
    <div data-testid="recipe-list-skeleton" className="space-y-3">
      {Array.from({ length: 5 }, (_, i) => (
        <RecipeCardSkeleton key={i} />
      ))}
    </div>
  );
}
