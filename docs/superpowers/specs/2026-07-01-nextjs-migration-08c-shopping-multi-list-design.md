# Plan 8c — Shopping Multi-List Access + Correctness — Design Spec

**Date:** 2026-07-01
**Branch:** `design/nextjs-migration`
**Roadmap ref:** Section B, Plan 8c (audit M7 / A3 / A4), plus A9 schema hardening (folded in per decision).

## Problem

The Next.js shopping surface regressed from the old Django/React app in three ways, plus a deferred schema-hardening item:

1. **M7 — Multi-list access.** A multi-shopping-day plan produces one `shopping_list` per segment, but only the latest is reachable. `web/app/(app)/shopping/page.tsx` renders `getLatestShoppingList` only, and `web/components/plan/iteration-card.tsx:161` links **every** shopping day to `/shopping` (the latest list) rather than to that day's own list. There is no `/shopping/[id]` route. The old app had a `/shopping/:id` detail route and linked each shopping day to `/shopping/{id}`.

2. **A3 — Per-entry servings.** `web/lib/shopping/generate.ts` scales every entry by a single plan-level `servings` value (`opts.servings`, applied at `generate.ts:61`). The old app scales each entry by `entry.servings / recipe.default_servings` (`backend/shopping/services.py:41`). Each meal-plan entry already stores its own `servings` (`meal_plan_entries.servings`), so the plan-level value is wrong whenever an entry's servings differ from the plan default.

3. **A4 — Empty-segment lists.** `generate.ts:73` (`if (aggregated.length === 0) continue;`) skips creating a list for a segment that aggregates to zero items. The old app creates a list for **every** segment unconditionally (`services.py:49`). The skip means an empty shopping day's plan-page link has no list to resolve to.

4. **A9 — Self-referential FK hardening.** `meal_plan_entries.source_entry_id` and `units.base_unit_id` are plain columns with no FK constraint in the Drizzle schema, though the old Django models declare them as self-FKs with `on_delete=SET_NULL` (`backend/planner/models.py:81`, `backend/recipes/models.py:33`).

## Decisions (from brainstorming)

- **Multi-list access:** old-app parity — add a `/shopping/[id]` detail route and link each shopping day on the plan page to its own list. `/shopping` remains the bare "current list" entry point. No switcher UI.
- **Empty segments:** always create a list per segment (match old app), so every shopping day's link resolves.
- **A9:** included in this plan — add self-referential FKs for both `source_entry_id` and `base_unit_id` with `SET NULL`.

## Scope

In scope: shopping-list generation correctness (A3, A4), a `/shopping/[id]` detail route, plan-page per-day links, displaying each list's `shoppingDate`, and the A9 FK migration.

Out of scope: offline shopping toggles (Plan 8f), any recipe-list or planner-algorithm work (8d/8e), a list-switcher UI, and a `/shopping-lists` index page.

## Architecture

### 1. Generation correctness — `web/lib/shopping/generate.ts`

- **Per-entry servings (A3):** add `servings: mealPlanEntries.servings` to the entry select, and set each `ShoppingEntry.servings` from `e.servings` instead of the shared `opts.servings`. The existing `aggregateShoppingItems` already scales by `servings / defaultServings` per entry, so only the source of `servings` changes.
- **Drop the `servings` opt:** remove `servings` from `GenerateOpts` and from the sole caller `web/lib/meal-plan/setup.ts:159-161` (it currently passes `servings: plan.servings`). Grep confirms `setup.ts` is the only non-test caller.
- **Always create lists (A4):** remove the `if (aggregated.length === 0) continue;` guard so an empty segment still inserts a `shopping_lists` row (with zero items). The item-insert block already no-ops on an empty array — guard it so we don't call `.values([])`.

### 2. Query — `web/lib/queries/shopping.ts`

Add `getShoppingListById(db, householdId, id, locale): ShoppingListView | null`, mirroring `getLatestShoppingList` but filtering `shoppingLists.id = id` **and** joining through `planIterations → mealPlans` on `householdId` (so a user cannot read another household's list — returns `null` if not owned). Reuse the same item-select and DTO mapping; extract the shared item query into a small private helper to avoid duplication.

`getLatestShoppingList` keeps its role as the `/shopping` entry point. Because all lists in an iteration share one `createdAt`, tighten its ordering to be deterministic: `ORDER BY createdAt DESC, shoppingDate ASC` (earliest segment of the newest iteration).

### 3. Detail route — `web/app/(app)/shopping/[id]/page.tsx`

Server component. `requireHousehold()`, resolve `params.id`, call `getShoppingListById`. If `null` → `notFound()`. Otherwise render the **same** category-grouped UI as `/shopping` (reuse `ShoppingCategory`, `UncheckAllButton`, `CATEGORY_ORDER`, and the empty/all-checked states). Add a header line showing the list's `shoppingDate` (formatted via the existing date helper / locale). Toggle + uncheck-all already operate by item id and are household-scoped, so no new actions are needed.

To avoid divergence between `/shopping` and `/shopping/[id]`, extract the shared presentation (category grouping + the three states) into one client-agnostic component, e.g. `web/components/shopping/shopping-list-view.tsx`, and have both pages render it. `shoppingDate` shown when present.

### 4. Plan-page per-day links — `web/components/plan/iteration-card.tsx`

Change the shopping-day preview link from `href="/shopping"` to `href={\`/shopping/${shoppingList.id}\`}` (`iteration-card.tsx:161`). `PlanShoppingListDto` already includes `id`. With A4, empty lists now exist, so the preview renders for empty days too (count 0) — acceptable parity; no extra handling.

### 5. A9 — self-referential FK migration — `web/lib/db/schema.ts`

- `mealPlanEntries.sourceEntryId`: add `.references((): AnySQLiteColumn => mealPlanEntries.id, { onDelete: "set null" })`.
- `units.baseUnitId`: add `.references((): AnySQLiteColumn => units.id, { onDelete: "set null" })`.

Import `AnySQLiteColumn` from `drizzle-orm/sqlite-core` for the self-reference type annotations. Generate the migration with `npm run db:generate` (drizzle-kit emits the SQLite table-rebuild). `foreign_keys = ON` is already set in `client.ts`. Existing rows already hold valid ids or null, so the rebuild is safe.

## Data flow

`setup.ts` builds an iteration → calls `generateShoppingListsForIteration` (now per-entry servings, one list per segment) → lists stored. Plan page reads lists via `getMealPlan` (unchanged, already carries list `id`/`shoppingDate`/`itemCount`) and links each day to `/shopping/[id]`. `/shopping/[id]` reads one list via `getShoppingListById` (household-scoped); `/shopping` reads the newest segment via `getLatestShoppingList`. Toggling reuses the existing id-based, household-scoped actions.

## Testing

- **`generate.test.ts` (extend):** (a) two entries with differing `servings` in one segment aggregate using each entry's own servings, not a plan-level value (A3 regression test); (b) a segment with no non-leftover entries still produces a `shopping_lists` row with zero items (A4); (c) update existing cases that pass `servings` in opts to seed per-entry servings instead.
- **`queries/shopping` (new test):** `getShoppingListById` returns the list for an owned id, `null` for another household's id, and `null` for a missing id; `shoppingDate` is surfaced.
- **A9:** a test (or existing generation/setup test) confirming deleting a source ("cooking") entry nulls dependent leftovers' `source_entry_id` rather than erroring; migration applies cleanly (`npm run db:migrate` on a scratch db).
- **Full pass:** `npm test`, `tsc --noEmit`, `next build`, en/de i18n parity (expect at most one new key for the detail-page date label; reuse existing keys where possible).

## Files touched

- `web/lib/shopping/generate.ts` — per-entry servings, drop opt, always-create.
- `web/lib/meal-plan/setup.ts` — stop passing `servings`.
- `web/lib/queries/shopping.ts` — `getShoppingListById` + deterministic ordering + shared item helper.
- `web/app/(app)/shopping/[id]/page.tsx` — new detail route.
- `web/app/(app)/shopping/page.tsx` — render shared view component.
- `web/components/shopping/shopping-list-view.tsx` — new shared presentation (extracted).
- `web/components/plan/iteration-card.tsx` — per-day `/shopping/[id]` link.
- `web/lib/db/schema.ts` + `web/drizzle/*.sql` (generated) — A9 self-FKs.
- Tests: `web/lib/shopping/generate.test.ts`, new `web/lib/queries/shopping.test.ts`, i18n locale files (if a key is added).

## Self-review

- **Placeholders:** none.
- **Consistency:** `getShoppingListById` returns the same `ShoppingListView` shape as `getLatestShoppingList`; both pages render one shared view; toggle actions unchanged. A3/A4 mirror `services.py` exactly. A9 `SET NULL` matches Django.
- **Scope:** single focused plan; no switcher, no offline, no unrelated refactor beyond extracting the shared shopping view (justified — two pages must not diverge).
- **Ambiguity:** `/shopping` vs `/shopping/[id]` roles made explicit; empty-list behavior and its plan-page consequence made explicit.
