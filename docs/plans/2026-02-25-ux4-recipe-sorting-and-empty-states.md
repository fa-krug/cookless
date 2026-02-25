# UX4: Recipe Sorting & Empty State Polish

## Problem

The recipe list has a search filter but no sort options — recipes appear in server-default order. Empty states across the app are plain text with no visual hierarchy or clear calls to action.

## Goal

Add sort controls to the recipe list and redesign empty states across the app with illustrations and prominent CTAs.

## Design

### Recipe Sorting

Add a sort control next to the search input on `RecipeListPage`. Options:

- **Name A-Z** (default)
- **Name Z-A**
- **Newest first** (by `created_at`)
- **Recently updated** (by `updated_at`)

Implementation:
- A small dropdown/select (`<select>`) styled consistently with the app, placed to the right of the search input.
- Sorting is client-side since all recipes are already fetched. Apply `Array.sort()` after the search filter.
- Sort preference is stored in `localStorage` so it persists across sessions.
- Sort respects the current locale for alphabetical ordering (`localeCompare` with the active language).

### Empty States

Replace plain text empty states with a structured layout: icon/illustration + heading + subtitle + CTA button.

| Location | Current Text | New Design |
|----------|-------------|------------|
| Recipe list (no recipes) | "Your recipe collection is empty..." | Large `BookOpen` icon (lucide), heading "No recipes yet", subtitle "Start building your collection", orange "Add your first recipe" button → `/recipes/new` |
| Recipe list (search no results) | "No recipes found" | `Search` icon, "No matches", "Try a different search term", no CTA |
| Meal plan (no plan) | "No meal plan yet..." | Already has a CTA button — add a `Calendar` icon above the text |
| Shopping list (empty) | "Nothing to shop for yet..." | `ShoppingCart` icon, "Nothing to shop for", "Create a meal plan to generate your shopping list", "Go to meal plan" button → `/plan` |
| Shopping list detail (all checked) | (none) | `CheckCircle` icon, "All done!", "Everything on this list has been checked off" |

### Component

Create a reusable `EmptyState` component:

```
Props:
  icon: LucideIcon
  title: string
  subtitle?: string
  action?: { label: string, to: string } | { label: string, onClick: () => void }
```

Renders a centered flex column: icon (48px, gray-400), title (`text-lg font-semibold text-gray-600`), subtitle (`text-sm text-gray-500`), and an optional orange button or link.

### File Structure

```
frontend/src/components/ui/
  EmptyState.tsx
  SortSelect.tsx       # small styled select for sort options
```

## Out of Scope

- Server-side sorting or pagination (all recipes load at once; this is fine for typical household recipe counts).
- Illustrated SVG artwork (using lucide icons keeps it simple and consistent).
- Filtering by tag/category (no tags feature exists yet).

## Testing

- Unit test: sort options reorder the recipe list correctly.
- Unit test: `EmptyState` renders icon, title, subtitle, and action.
- Unit test: sort preference persists in localStorage.

## i18n

Add keys for:
- Sort option labels: "Name A-Z", "Name Z-A", "Newest first", "Recently updated"
- Empty state titles and subtitles for each location
- Sort accessibility label: "Sort recipes"
