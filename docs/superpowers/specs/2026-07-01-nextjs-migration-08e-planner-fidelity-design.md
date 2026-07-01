# Plan 8e — Planner Gap-Fill & Renew Fidelity + Edit-Config Trigger — Design

**Date:** 2026-07-01
**Branch:** `design/nextjs-migration`
**Audit items closed:** A1 (gap-fill repeats selected set), A2 (renew exclusion baseline), M13 (no edit-config trigger once a plan exists)
**Predecessor:** Plan 8d (recipe list). Part of the Section B parity roadmap in `docs/superpowers/plans/2026-06-27-nextjs-migration-08-cutover.md`.

## Problem

Three planner regressions surfaced in the 2026-06-27 old-vs-new parity audit. All three are faithfulness gaps vs the Django `planner/services.py` port; none is a data or scoping bug.

### A1 — gap-fill repeats the selected set instead of pulling other recipes for variety
`web/lib/meal-plan/setup.ts:130` calls `assignSchedule({ … fallbackRecipes: scheduleRecipes … })`, passing the **selected** recipe set as the gap-fill pool, with a comment `// cycle the selected set to fill gaps (Django parity)`. **That comment is wrong.** Django's `_assign_schedule_lunch_only` (`backend/planner/services.py:275–296`) fills leftover empty dates from *other* household recipes:

```python
empty_dates = [d for d in dates if d not in assigned]
if empty_dates:
    all_recipes = list(
        Recipe.objects.filter(household=iteration.meal_plan.household).exclude(
            id__in=[r.id for r in recipes]          # recipes NOT already selected
        )
    )
    if not all_recipes:                              # only if that pool is empty
        all_recipes = list(Recipe.objects.filter(household=iteration.meal_plan.household))
    random.shuffle(all_recipes)
    recipe_cycle = all_recipes * ((len(empty_dates) // max(len(all_recipes), 1)) + 1)
    ...
```

So Django's gap-fill pool is **all household recipes minus the selected set** (for variety), falling back to **all household recipes** only when the "others" pool is empty. The new app instead recycles the already-selected recipes, so a plan with few sessions but many empty days repeats the same handful of dishes rather than introducing variety.

### A2 — renew exclusion baseline differs (current vs date-previous iteration), untested
`web/lib/meal-plan/iterations.ts` `renewIteration` computes its exclusion set via `previousRecipeIds(db, iterationId)` — the recipes of **the iteration being renewed itself**. Django's `renew_iteration` (`services.py:63–74`) instead excludes the recipes of the **date-previous** iteration via `_get_previous_iteration_recipe_ids(plan, iteration)` (`services.py:131–138`):

```python
previous = plan.iterations.filter(start_date__lt=current.start_date).order_by("-start_date").first()
if not previous:
    return set()
return set(previous.entries.filter(is_leftover=False).values_list("recipe_id", flat=True))
```

`generateNextIteration` already matches Django (it excludes `prev.id`, the max-`start_date` iteration, computed *before* the new row is inserted). Only `renewIteration` diverges. The divergence is also untested.

### M13 — no edit-config trigger once a plan exists
`web/app/(app)/plan/page.tsx` renders `<GeneratePlanDrawer>` **only** in the no-plan empty state. Once a plan exists there is no way to change iteration length, servings, known ratio, leftover days, shopping days, or excluded tags. The old React `MealPlanPage.tsx` showed a gear/Settings `IconButton` in the page header (labelled `plan.updateConfig`) whenever a plan existed, reopening the same drawer prefilled with the current config (`GenerateDrawer existingPlan={currentPlan}`).

The new plan page also drops the old **"no active iteration"** empty state (`services` parity: old app showed `noActiveTitle`/`noActiveSubtitle` + a "Generate next" action when a plan existed but had no ACTIVE iteration).

## Decisions (locked via AskUserQuestion 2026-07-01)

1. **A2 renew baseline → Django parity (date-previous).** `renewIteration` excludes the recipes of the date-previous iteration, matching Django and `generateNextIteration`. Renewing the first/only iteration therefore excludes nothing (the pool auto-falls-back anyway).
2. **A1 gap-fill excluded tags → Django parity (ignore tags).** The variety fallback pool is *all* household recipes minus the selected set, **ignoring** the plan's excluded tags — a faithful port. A tagged-out recipe can appear on a gap-fill day, exactly as in Django. (Excluded tags still filter the primary selection pool via `loadSelectablePools`, unchanged.)
3. **Scope → A1 + A2 + M13 + restore the no-active-iteration empty state.**

## Why parity over "improvement"

The whole Section B roadmap exists to close audit divergences by restoring old-app behavior, not to redesign the planner. Both A1 and A2 have defensible "improved" alternatives (respect excluded tags in gap-fill; exclude the current set on re-roll), but the migration's contract with the user is faithful parity so existing households see identical planning behavior after cutover. We port Django exactly and cover the behavior with tests it never had.

## Architecture

The planner is a pure domain layer (`web/lib/domain/meal-plan/`) wired by a thin persistence layer (`web/lib/meal-plan/`). A1 touches the wiring layer's fallback-pool construction; A2 touches the wiring layer's exclusion query; M13 is pure UI wiring in the `(app)/plan` route. No schema, migration, domain-algorithm, or server-action-signature changes.

### 1. A1 — real "other recipes" gap-fill pool
File: `web/lib/meal-plan/setup.ts`

`loadSelectablePools` already loads every household recipe row (`recRows`) and its ingredient map before splitting into `known`/`tryList` and dropping excluded-tag recipes. Extend it (or add a sibling that reuses the same query) to also return the **full** household recipe set as `PoolRecipe[]` — every recipe regardless of `listType` or excluded tags — so `populateIteration` can build the gap-fill pool without a second DB round-trip.

Proposed shape:
```ts
export function loadSelectablePools(
  db: Db, householdId: string, excludedTagIds: string[],
): { known: PoolRecipe[]; tryList: PoolRecipe[]; all: PoolRecipe[] } // + all
```
`all` is every household recipe as `{ id, ingredientIds, leftoverDays }`, built from the same `recRows`/`ingByRecipe` already in scope (no extra query, no tag/list filtering).

In `populateIteration`, after `selectRecipes` yields `selected`, build the gap-fill pool the Django way:
```ts
const selectedIds = new Set(selected.map((r) => r.id));
const others = all.filter((r) => !selectedIds.has(r.id));
const fallbackPool = others.length > 0 ? others : all;   // Django's "if not all_recipes" fallback
const fallbackRecipes: ScheduleRecipe[] = fallbackPool.map((r) => ({
  id: r.id, leftoverDays: r.leftoverDays,
}));
```
Pass `fallbackRecipes` (not `scheduleRecipes`) to `assignSchedule`. Delete the misleading comment. `assignSchedule`'s existing fallback branch (`schedule.ts:74–94`) already shuffles + cycles the pool over the empty dates and creates single non-leftover entries — matching Django — so no domain change is needed.

`leftoverById` (used to build `scheduleRecipes` for the selected set) must be built from `all` (or `known ∪ tryList ∪ all`) so any recipe id resolves; `all` is a superset of `known ∪ tryList`, so building it from `all` alone is sufficient and simpler.

### 2. A2 — date-previous exclusion baseline for renew
File: `web/lib/meal-plan/iterations.ts`

Add a helper that ports `_get_previous_iteration_recipe_ids`:
```ts
function previousIterationRecipeIds(db: Db, planId: string, currentStartDate: string): Set<string> {
  const prev = db.select({ id: planIterations.id })
    .from(planIterations)
    .where(and(eq(planIterations.mealPlanId, planId), lt(planIterations.startDate, currentStartDate)))
    .orderBy(desc(planIterations.startDate))
    .get();
  if (!prev) return new Set();
  return previousRecipeIds(db, prev.id);   // reuse existing non-leftover recipe-id reader
}
```
`renewIteration` switches its exclusion set from `previousRecipeIds(db, iterationId)` to `previousIterationRecipeIds(db, it.planId, it.startDate)`. `ownedIteration` already returns `planId` and `startDate`, so no extra query is needed there. `previousRecipeIds` (current-iteration reader) stays — it's still the correct primitive, now called on the date-previous iteration's id.

`generateNextIteration` is unchanged: its `prev` (max `start_date`, read before insert) *is* the date-previous iteration, so it already matches. Optionally it can be refactored to call the new helper for symmetry, but that is not required and risks re-introducing the ordering subtlety; leave it as-is.

`lt` must be added to the `drizzle-orm` import in `iterations.ts`.

### 3. M13 — edit-config trigger + no-active-iteration state
File: `web/app/(app)/plan/page.tsx` (+ possibly a small header client wrapper)

The `GeneratePlanDrawer` already accepts a `defaults` prop and `getMealPlanView` already returns `iterationWeeks`, `shoppingDays`, `servings`, `knownRatio` (string), `defaultLeftoverDays`, and `excludedTagIds`. So editing config is wiring only:

- **Header trigger:** when a plan exists, render a `GeneratePlanDrawer` in the page header with `triggerLabel={t("plan.updateConfig")}` and `defaults` built from the `plan` view (coerce `knownRatio` via `Number(plan.knownRatio)`). Submitting calls the existing `setupPlanAction` → `setupMealPlan`, which upserts the plan config and regenerates iterations — identical to the old app's `existingPlan` path. The trigger should look like a secondary/ghost control (gear icon + label), not the big primary button used in the empty state.
- **No-active-iteration empty state:** compute `active = iterations.find((i) => i.status === "ACTIVE")` instead of blindly taking `iterations[0]`. If a plan exists but has no ACTIVE iteration and the active one hasn't "ended", render an `EmptyState` (`plan.noActiveTitle`/`plan.noActiveSubtitle`) whose action is the existing `<NextIterationButton>`. Archived iterations still render below.

All four i18n keys already exist in `en.json`/`de.json` (`plan.updateConfig`, `plan.noActiveTitle`, `plan.noActiveSubtitle`, `plan.generateNext`), so **no new i18n keys** are needed.

Note the drawer's trigger is a `<Button>` via `DialogTrigger asChild`, and `triggerLabel` is typed `string`. To avoid widening the component API, pass the text label `t("plan.updateConfig")` and style it as a ghost/outline secondary control via `triggerClassName`. The old app's trigger was an icon-only gear with an aria-label/tooltip; a labelled ghost button is an acceptable, clearer functional equivalent. (If a gear icon is later wanted, widen `GeneratePlanDrawer` to accept `triggerContent?: ReactNode` — out of scope here.)

## Data flow (unchanged contracts)

- `setupPlanAction(input)` / `renewIterationAction(id)` / `nextIterationAction()` server actions keep their exact signatures and `revalidatePath("/plan")` + `revalidatePath("/shopping")` behavior.
- `setupMealPlan` still deletes all iterations + excluded tags and regenerates from scratch, so "Update plan" re-rolls the plan — same as the old app's config-edit path. This is intended and matches Django `setup_meal_plan`.
- Randomness stays injected via `Rng` (`mulberry32` seeded in tests, random in prod). No `Math.random()` in domain code.

## Error handling

No new failure modes. `setupMealPlan` still raises `AuthError(422)` from `validateShoppingDays`; `renewIteration` still raises `AuthError(404)` via `ownedIteration` for cross-household or missing ids. The A1 fallback pool is always non-empty when the household has ≥1 recipe (and a household with zero recipes already produces an empty plan — unchanged). The A2 helper returns an empty set when there is no date-previous iteration — safe, matches Django.

## Testing

TDD, Vitest vs in-memory SQLite (`@/lib/test/db` `createTestDb()`), seeded `mulberry32` for determinism. Add to existing files — do **not** create duplicates (`lib/meal-plan/setup.test.ts`, `lib/meal-plan/iterations.test.ts` already exist; verify create-vs-modify against the tree per the 8c lesson).

**A1 — `setup.test.ts` (`populateIteration`/`setupMealPlan`):**
- Household with a small selected pool but many empty days ⇒ gap-fill days use recipes **outside** the selected set (assert at least one entry references a non-selected recipe when others exist).
- Household where every recipe is selected (others pool empty) ⇒ gap-fill falls back to the full set (no crash, days filled).
- Excluded-tag recipe still eligible for gap-fill (parity: tags ignored in fallback) — assert a tagged-out recipe can appear on a gap-fill day given a seed that places it.

**A2 — `iterations.test.ts` (`renewIteration`):**
- Two iterations (date-previous archived + current): renewing the current excludes the **date-previous** iteration's non-leftover recipes, **not** the current iteration's own recipes (assert a recipe present only in the current iteration can reappear after renew; a recipe from the previous iteration is avoided when the pool allows).
- Single/first iteration: renew excludes nothing (can reproduce the same set) — no crash, entries regenerated.
- Cross-household renew still throws `AuthError(404)`.

**M13 — plan page:** covered by the existing manual on-host smoke pass (consistent with Plans 4–8d, which defer browser smoke). No new automated page test is required, but a light render/prop test of the header trigger is welcome if it fits the existing test conventions.

## Out of scope (YAGNI)

- No change to selection (`selection.ts`), overlap scoring, iteration-date math, or shopping generation.
- No "improved" A1/A2 semantics (excluded-tags-in-gap-fill, exclude-current-on-renew) — explicitly rejected in favor of parity.
- No per-entry locking/editing, drag-reschedule, or manual recipe swap (absent in both apps).
- No offline/PWA work (Plan 8f).

## Files touched

- `web/lib/meal-plan/setup.ts` — `loadSelectablePools` returns `all`; `populateIteration` builds real fallback pool (A1).
- `web/lib/meal-plan/iterations.ts` — `previousIterationRecipeIds` helper; `renewIteration` uses date-previous baseline; add `lt` import (A2).
- `web/app/(app)/plan/page.tsx` — header edit-config trigger + no-active-iteration empty state (M13).
- `web/lib/meal-plan/setup.test.ts`, `web/lib/meal-plan/iterations.test.ts` — new coverage.

No new files, no schema/migration, no new i18n keys, no server-action signature changes.
