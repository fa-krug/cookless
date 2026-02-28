# shad5 — Data Display Components

**Goal:** Replace cards, badges, skeletons, tabs with shadcn equivalents.

## Scope

- Add shadcn: **Card**, **Badge**, **Skeleton**, **Tabs**, **Separator**
- Replace `RecipeCard.tsx` layout → use `Card`, `CardHeader`, `CardContent`, `CardFooter`
- Replace tag color badges → `Badge` with custom variants per category:
  - DIETARY: green
  - PROTEIN: red
  - CUISINE: blue
  - MEAL_TYPE: amber
- Replace `ui/Skeleton.tsx` + all page skeletons → shadcn Skeleton
- Replace KNOWN/TO_TRY tab buttons in `RecipeListPage` → shadcn Tabs (`TabsList`, `TabsTrigger`, `TabsContent`)
- Replace `ui/Spinner.tsx` → keep or replace with shadcn-compatible loading spinner
- Style `EmptyState.tsx` to match shadcn card aesthetic

## New Dependencies

- `@radix-ui/react-tabs`
- `@radix-ui/react-separator`

## Files Changed

- New `src/components/ui/card.tsx` (shadcn)
- New `src/components/ui/badge.tsx` (shadcn)
- New `src/components/ui/skeleton.tsx` (shadcn, replaces old)
- New `src/components/ui/tabs.tsx` (shadcn)
- New `src/components/ui/separator.tsx` (shadcn)
- `src/components/RecipeCard.tsx` (use Card components)
- `src/pages/RecipeListPage.tsx` (use Tabs)
- `src/components/ui/EmptyState.tsx` (restyle)

## Files Removed

- Old `src/components/ui/Skeleton.tsx`
- Old `src/components/ui/RecipeListSkeleton.tsx`
- Old `src/components/ui/RecipeDetailSkeleton.tsx`
- Old `src/components/ui/MealPlanSkeleton.tsx`
- Old `src/components/ui/ShoppingListSkeleton.tsx`
- Old `src/components/ui/SettingsSkeleton.tsx`
- Old `src/components/ui/RecipeCardSkeleton.tsx`

## Tests

Update tests querying skeleton/tab/badge elements — new component structure and class names.
