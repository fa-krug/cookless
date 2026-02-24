# Plan Page Refactor Design

**Date:** 2026-02-25
**Status:** Approved

## Summary

Refactor the MealPlanPage to simplify the UX: merge duplicate buttons, show shopping list preview on day 1, make day cards clickable to recipe details, show "Kaltes Essen" as a static dinner label, and add configurable leftover spacing.

## Requirements

1. **Single "Neu erstellen" button** — merges "Plan erstellen" (header) and "Neu erstellen" (regenerate) into one highlighted orange button. Opens GenerateDrawer. Old plan is replaced entirely.
2. **Day 1 = shopping day + cooking** — shows compact shopping list preview (item count + icon) + lunch recipe. Clicking shopping preview navigates to `/shopping`. Clicking recipe navigates to `/recipes/{id}`.
3. **Other days** — show lunch recipe name. Clicking navigates to `/recipes/{id}` (existing RecipeDetailPage with "Start Cooking").
4. **Dinner = "Kaltes Essen"** — static label on every day, no recipe assigned. Subtle/greyed styling.
5. **Leftover spacing** — leftovers are spread across non-consecutive days (skip at least 1 day between cooking and leftover).
6. **Configurable `leftover_days`** — per-recipe field (default: 1). Global default in GenerateDrawer overridable per recipe.
7. **Remove lock/swap controls** — algorithm handles leftovers automatically.

## Approach

Refactor existing PlanGrid and MealPlanPage in-place (Approach A). Minimal new files, builds on existing code.

## Design Details

### MealPlanPage — Button Merge & Layout

- Single "Neu erstellen" orange button in header (visible when plan exists)
- Empty state: button says "Plan erstellen"
- Clicking opens GenerateDrawer, which generates a new plan replacing the old one
- Remove separate regenerate button, `useRegeneratePlan` usage, and "week of" date line

### PlanGrid — Day Cards Redesign

- Each day card: **Lunch** (recipe name, clickable) + **Dinner** ("Kaltes Essen" static label, subtle styling)
- Leftover entries show recipe name with "(Reste)" indicator
- Day 1: compact shopping list preview (e.g. "12 Artikel" + grocery icon) above the recipe. Clicking shopping area → `/shopping`. Clicking recipe → `/recipes/{id}`
- Other days: clicking recipe → `/recipes/{id}`
- Remove lock/swap/leftover toggle controls

### Backend — Recipe `leftover_days` & Generation Algorithm

**Recipe model:**
- Add `leftover_days` IntegerField (default: 1). Value 0 = no leftovers.
- Exposed in recipe schemas (In/Out)

**GenerateDrawer:**
- Add "Standard-Reste (Tage)" input (default: 1)
- Passed to generate endpoint as `default_leftover_days`

**Generation algorithm:**
- Only plan lunch — dinner is "Kaltes Essen" (no DB entry, frontend-only)
- Use `recipe.leftover_days` if set, otherwise `default_leftover_days`
- Leftover placement: skip at least 1 day after cooking day
- Spread multiple leftover days across non-consecutive slots
- Keep existing ingredient-overlap scoring for recipe selection

**Shopping list generation:** No changes needed (already skips leftover entries).

### Data Flow

**Plan creation:** Neu erstellen → GenerateDrawer → backend creates plan (deletes old) → PlanGrid renders → shopping list auto-generated.

**Day interaction:**
- Day 1: tap shopping preview → `/shopping`; tap recipe → `/recipes/{id}`
- Other days: tap recipe → `/recipes/{id}` → "Start Cooking" available there

### No Changes To

- RecipeDetailPage, CookingViewPage, ShoppingListPage (all reused as-is)
- Shopping list generation logic
- Auth/permissions
