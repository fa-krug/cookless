# Web Performance Improvements — Implementation Plan

Branch: `design/nextjs-migration`
Base commit: `c6d1100`
Scope: `web/` (Next.js 16 App Router, Drizzle + better-sqlite3, React 19)

Derived from a performance research pass. Three researched findings were
consciously **excluded** and must NOT be implemented here:
- `unstable_cache` for list queries (in-process SQLite is faster than Next's
  disk data cache; adds staleness risk).
- `useOptimistic` in `shopping-category.tsx` (existing hand-rolled optimistic
  state is deliberately offline-queue-aware; do not replace).
- Partial Prerendering (every route is auth/household-gated → fully dynamic;
  low payoff, experimental config risk).

## Global Constraints

- Do not change user-visible formatting output. `formatQuantity("2.00")` must
  still return `"2"`, `formatQuantity("2.50")` → `"2.5"` (trailing zeros
  stripped, max 2 decimal places, half-up rounding). Keep existing tests green.
- Import `Decimal` only from `@/lib/domain/decimal` where Decimal is needed —
  never add a raw `decimal.js` import (project rule from earlier plans).
- All existing tests (`npm test`), typecheck (`npm run typecheck`), and lint
  (`npm run lint`) must pass after every task.
- Do not alter business logic, auth flows, or data correctness — these are
  performance-only changes.
- Follow TDD: add/adjust tests before implementation where the change is
  testable.

---

## Task 1 — SQLite performance pragmas

**File:** `web/lib/db/client.ts`

Currently sets only `journal_mode = WAL` and `foreign_keys = ON` (lines 18-19).
Add the following pragmas immediately after, in this order:

```ts
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("cache_size = -64000");   // 64 MB page cache (negative = KiB)
sqlite.pragma("mmap_size = 268435456"); // 256 MB memory-mapped I/O
sqlite.pragma("temp_store = MEMORY");
```

`synchronous = NORMAL` is safe together with WAL. Do not change WAL or
foreign_keys. Skip `mmap_size` gracefully if the path is `:memory:` is NOT
required — better-sqlite3 accepts these pragmas on in-memory DBs too, so no
branching needed.

**Test:** `web/lib/db/client.test.ts` — add an assertion that the pragmas are
applied (e.g. `sqlite.pragma("synchronous", { simple: true })` returns `1`
(NORMAL) and `journal_mode` still `wal`). Verify existing tests still pass.

---

## Task 2 — Foreign-key indexes

**Files:** `web/lib/db/schema.ts` (add index definitions to the affected
tables using Drizzle's `index()` in the table's callback), plus a new Drizzle
migration generated via `npm run db:generate`.

Add indexes on these frequently-filtered / joined columns (only where an index
does not already exist — several are already covered by unique indexes; verify
before adding to avoid duplicates):

- `recipes.household_id`
- `recipe_ingredients.recipe_id`
- `cooking_steps.recipe_id`
- `step_ingredients.step_id`
- `meal_plan_entries.iteration_id`
- `plan_iterations.meal_plan_id`
- `shopping_list_items.shopping_list_id`
- `household_members.user_id`

Use stable, conventional index names (e.g. `recipes_household_id_idx`).

**Migration:** run `npm run db:generate` to produce the `drizzle/*.sql` +
snapshot. Commit the generated files. Do NOT hand-write the SQL.

**Test:** existing `web/lib/db/schema.test.ts` must pass. Add an assertion (or
extend an existing one) that a representative index exists in the migrated
schema if the test harness supports it; otherwise rely on the generated
migration + `npm run db:migrate` succeeding on a temp DB.

---

## Task 3 — Service worker: cache recipe images

**File:** `web/public/sw.js`

`isStaticAsset()` (around line 31) currently matches only
`request.destination === 'image'`. Recipe images are served from the
`/api/images/*` route with `destination === 'empty'`, so they are never
cached. Extend the static-asset predicate to also match
`url.pathname.startsWith('/api/images/')`, so those requests use the existing
cache-first strategy (offline availability + faster repeat loads).

Do not change the cache name/versioning scheme or other fetch handlers. Keep
the API-mutation and navigation strategies untouched.

**Test:** if `sw.js` has associated tests, extend them; otherwise verify by
reading the resulting predicate logic. Manual note in the report: images
under `/api/images/` now hit the cache-first branch.

---

## Task 4 — loading.tsx skeletons (perceived load)

**Files (new):**
- `web/app/(app)/recipes/loading.tsx` → renders `RecipeListSkeleton`
- `web/app/(app)/shopping/loading.tsx` → renders `ShoppingListSkeleton`
- `web/app/(app)/plan/loading.tsx` → renders `MealPlanSkeleton`

The skeleton components already exist:
- `web/components/recipes/recipe-list-skeleton.tsx`
- `web/components/shopping/shopping-list-skeleton.tsx`
- `web/components/plan/meal-plan-skeleton.tsx`

Each `loading.tsx` is a server component default-exporting a function that
renders the matching skeleton, wrapped in the same page container/heading
structure the real page uses so the transition is visually stable. Read the
corresponding `page.tsx` to match the outer layout (heading, padding
wrapper). Do not add page-level `<Suspense>` — `loading.tsx` provides the
route-segment fallback during navigation/data fetch.

**Test:** these are trivial presentational wrappers; a render smoke test is
optional. Ensure typecheck/lint pass and the skeleton imports resolve.

---

## Task 5 — Trim client bundle: lazy webauthn + Decimal-free formatter

Two independent bundle trims.

### 5a — Lazy-load `@simplewebauthn/browser`
**File:** `web/lib/auth-client/webauthn.ts`

Currently top-level imports `startAuthentication` / `startRegistration` from
`@simplewebauthn/browser`, pulling ~80KB into every auth page even for
password-only users. Convert to dynamic import inside the functions that use
them:

```ts
async function getWebAuthn() {
  return import("@simplewebauthn/browser");
}
```
and call `const { startAuthentication } = await getWebAuthn();` at point of
use. Keep the exported function signatures and behavior identical.

### 5b — Remove `decimal.js` from `formatQuantity`
**File:** `web/lib/display/format.ts`

`formatQuantity` imports `Decimal` purely for formatting, dragging decimal.js
into every client component that imports this module. Replace with a native
implementation that preserves EXACT output (half-up rounding to ≤2 dp,
trailing zeros stripped). Suggested:

```ts
export function formatQuantity(quantity: string): string {
  return String(Math.round(Number(quantity) * 100) / 100);
}
```

Do not touch `pickName`, `recipeImageUrl`, `CATEGORY_ORDER`, `formatDuration`,
or any other Decimal usage in the codebase (scaling/aggregate keep Decimal).

**Test:** `web/lib/display/format.test.ts` — verify existing cases pass; ADD
cases for `"2.00"→"2"`, `"2.50"→"2.5"`, `"0.125"→"0.13"` (or the value the
old Decimal path produced — confirm against `Decimal` semantics and match it).
If any existing test cannot be satisfied by the native impl due to precision,
STOP and report rather than changing the expected output.

---

## Task 6 — Parallelize server-component query waterfalls

**Files:** the multi-query page server components:
- `web/app/(app)/recipes/[id]/edit/page.tsx` (getRecipe, listIngredients, listUnits, listTags)
- `web/app/(app)/cook/[id]/page.tsx` (getRecipe, listIngredients, listUnits)
- `web/app/(app)/recipes/new/page.tsx` (listTags, listIngredients, listUnits)
- `web/app/(app)/recipes/[id]/page.tsx` (if multiple independent queries)

The query functions are synchronous Drizzle calls today. Where a page issues
multiple **independent** reads sequentially, group them so they are issued
together. Because the calls are synchronous, wrap each in a thunk and use
`Promise.all` only if the query functions are (or are made) async; if they
remain synchronous, the correct fix is simply to ensure no unnecessary
`await` serialization and that dependent queries (e.g. getRecipe must precede
its 404 guard) keep their ordering.

**Important:** Do NOT reorder queries that depend on each other (e.g. a
`getRecipe` whose result gates a `notFound()` must run before dependent
lookups). Preserve all `notFound()` / redirect guards and their positions
relative to the data they check. This is a low-risk micro-optimization —
if a page has only one query or strict data dependencies, leave it unchanged
and note that in the report.

**Test:** existing page tests (if any) must pass; typecheck/lint pass. The
behavior (rendered output, 404 handling) must be identical.

---

## Task 7 — On-the-fly responsive image variants

**Files:**
- `web/app/api/images/[...path]/route.ts`
- `web/components/recipes/recipe-card.tsx` (add `sizes`)
- `web/components/recipes/recipe-detail.tsx` (add `sizes`)

The route serves a single stored ~1024px WebP for every use, including 64px
card thumbnails (≈16× oversized on mobile). Add optional on-the-fly resizing:

- Accept a `?w=<int>` query param (allowlist a small set, e.g. 128, 256, 640,
  1024, to prevent unbounded resize requests). When present and valid, resize
  the stored WebP down to that width with `sharp` (never upscale) and serve
  the result; when absent/invalid, serve the original as today.
- Keep the `Cache-Control: public, max-age=31536000, immutable` header. The
  varied width is part of the URL so caching stays correct.
- Preserve the existing 404 behavior and `image/webp` content type.

Then set `sizes` on the two `next/image` usages so the browser requests an
appropriately-sized source:
- `recipe-card.tsx` thumbnail: it renders at a fixed small box — add an
  explicit `sizes` matching the rendered width (e.g. `sizes="64px"` or the
  actual CSS size) and, given the fixed size, `loading="lazy"` if not already
  the default (detail hero keeps `priority`).
- `recipe-detail.tsx` hero: `sizes` matching its responsive layout (e.g.
  `sizes="(max-width: 768px) 100vw, 768px"`).

Do NOT change how images are stored/uploaded (single original stays). Do NOT
migrate existing files. Resizing is read-time only.

**Performance note:** resizing per-request is CPU work; because responses are
`immutable` and cached by the browser/SW (Task 3), repeat loads don't re-hit
it. Do not add a disk cache in this task (keep scope tight) — note it as a
possible follow-up if profiling shows CPU pressure.

**Test:** `web/lib/images/storage.test.ts` and any route test must pass. Add a
test that `GET /api/images/...?w=128` returns a smaller image than the
original (assert byte length < original or width via sharp metadata), and that
an invalid `w` (e.g. `w=99999` not in allowlist, or `w=abc`) falls back to the
original. Preserve the 404-on-missing test.

---

## Execution notes

- Tasks are ordered to minimize file conflicts; each touches a distinct set of
  files except that Task 5b and Task 7 both relate to formatting/images but
  edit different files.
- After all tasks: run full `npm test`, `npm run typecheck`, `npm run lint`,
  and a `npm run build` to confirm the production build (and standalone
  output) still succeeds.
