# UX1: Skeleton Loading States

## Problem

Every page shows plain text "One moment..." while data loads. This causes layout shift when content appears and makes the app feel slow, especially on mobile connections.

## Goal

Replace text-based loading indicators with skeleton placeholders that mirror the final layout, eliminating layout shift and improving perceived performance.

## Design

### Skeleton Components

Create a shared `Skeleton` primitive — a rounded `div` with a shimmer animation (`animate-pulse` or a custom CSS keyframe sliding gradient). Build composed skeletons from it:

- **`RecipeCardSkeleton`** — matches `RecipeCard` dimensions: a row with a text block area (title line + two short metadata lines) and a trailing icon placeholder.
- **`RecipeListSkeleton`** — renders 5 `RecipeCardSkeleton` items in a `space-y-3` stack, plus a tab bar placeholder at the top.
- **`RecipeDetailSkeleton`** — title bar, 3-column grid placeholders, ingredient rows (4 shimmer rows), step section placeholders.
- **`MealPlanSkeleton`** — header bar + 3 day-card placeholders stacked vertically.
- **`ShoppingListSkeleton`** — 3 category headers with 2-3 item rows each.
- **`SettingsSkeleton`** — 3 card section placeholders.

### Integration Points

Each page replaces its `if (isLoading)` branch with the corresponding skeleton:

| Page | Current | Replacement |
|------|---------|-------------|
| `RecipeListPage` | `"One moment..."` | `<RecipeListSkeleton />` |
| `RecipeDetailPage` | text fallback | `<RecipeDetailSkeleton />` |
| `MealPlanPage` | text fallback | `<MealPlanSkeleton />` |
| `ShoppingListPage` | text fallback | `<ShoppingListSkeleton />` |
| `SettingsPage` | text fallback | `<SettingsSkeleton />` |

### Shimmer Animation

Use Tailwind's `animate-pulse` on a `bg-gray-200 rounded` base. This avoids custom CSS and stays consistent with the existing Tailwind design system.

### File Structure

```
frontend/src/components/ui/
  Skeleton.tsx          # base primitive
  RecipeCardSkeleton.tsx
  RecipeListSkeleton.tsx
  RecipeDetailSkeleton.tsx
  MealPlanSkeleton.tsx
  ShoppingListSkeleton.tsx
  SettingsSkeleton.tsx
```

## Out of Scope

- Skeleton for `CookingViewPage` (data is typically cached from the preview modal).
- Error state redesign (separate concern).
- Suspense boundaries (would require router-level changes).

## Testing

- Visual verification: each skeleton matches the dimensions of its loaded counterpart.
- Unit tests: each page renders the skeleton when query `isLoading` is true.
