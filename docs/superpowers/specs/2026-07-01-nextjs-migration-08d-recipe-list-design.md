# Plan 8d — Recipe List: Full-Collection Sort, Infinite Scroll & Fuzzy Search — Design

**Date:** 2026-07-01
**Branch:** `design/nextjs-migration`
**Audit items closed:** M6 (sort/pagination), A5 (ingredient auto-create dedup), A6 (ingredient autocomplete order), A7 (`localeCompare` locale)
**Predecessor:** Plan 8c (shopping multi-list). Part of the Section B parity roadmap in `docs/superpowers/plans/2026-06-27-nextjs-migration-08-cutover.md`.

## Problem

The Next.js recipes page (`web/app/(app)/recipes/page.tsx`) fetches a single page of 20 rows from the DB ordered by `recipes.title`, then a client-free `sortItems` helper re-sorts **only those 20 rows** in JS. Consequences:

- **M6 (sort):** "newest", "updated", and "name-desc" only reorder the alphabetically-first 20 recipes. The chosen sort never applies to the whole collection.
- **M6 (pagination):** "Load more" is an `<a href="?offset=20">` link — a full navigation that **replaces** the visible list with rows 20–40 instead of accumulating them. The old React app used client-side infinite scroll that accumulated all pages.
- **A7:** `sortItems` calls `localeCompare` with no locale argument, so German umlaut ordering (ä/ö/ü) is wrong. The old app passed `i18n.language`.
- **A6:** the ingredient autocomplete picker (`ingredient-rows.tsx`) filters ingredients with `includes()` and shows the first 6 in **insertion-id order**, not by name — because `listIngredients` orders by `ingredients.id`.
- **A5:** the recipe editor's ingredient auto-create (`upsert.ts` → `createIngredient`) always `INSERT`s, so typing an existing ingredient name creates a duplicate row. Django deduplicated by `name_en.lower()` (`backend/recipes/api.py:281`). Note: `bulk-create.ts` **already** deduplicates correctly (lines 63–89); Django's *explicit* create endpoint (`api.py:679`) intentionally does **not** dedup.

## Decisions (locked via AskUserQuestion 2026-07-01)

1. **Load-more UX:** real server-paged infinite scroll — the server hands back one page at a time as the user scrolls (not a pre-loaded full set sliced client-side).
2. **Search:** server-side, fuzzy (typo/diacritic/case tolerant), replacing the ASCII-only SQLite `LIKE`. This also closes the Plan 5 search-collation carry-forward.

## Why sort/search live in Node, not SQL

SQLite (via better-sqlite3) has no locale-aware `ORDER BY` — its `NOCASE` collation is ASCII-only and it has no ICU, and better-sqlite3 exposes no custom-collation API. So correct German name ordering **must** happen in JS. Fuzzy search likewise needs diacritic normalization SQLite can't do. Recipe collections are household-scoped and small (the entire prod DB is 121 recipes across all households), so fetching all rows matching the structural filters (`listType` + `tagIds`), then sorting/fuzzy-filtering/slicing in Node **per page request** is trivially cheap and yields globally-correct, locale-aware, paginated results.

## Architecture

### 1. Query layer — `listRecipes` as the single sorted + paged source
File: `web/lib/queries/recipes.ts`

Extend `ListRecipesOpts`:
```ts
export interface ListRecipesOpts {
  listType?: string;
  tagIds?: string[];
  search?: string;
  sort?: "name-asc" | "name-desc" | "newest" | "updated"; // default "name-asc"
  locale?: string;   // default "en" — for locale-aware name ordering (A7)
  limit?: number;    // default 20
  offset?: number;   // default 0
}
```

New behavior of `listRecipes(db, householdId, opts)`:
1. Fetch **all** rows where `householdId` matches, plus `listType` and `tagIds` filters (unchanged tag-subquery logic). **Remove** the SQL `like(recipes.title, …)` search branch.
2. If `search` is non-empty: compute `fuzzyScore(title, search)` for each row and drop rows scoring 0.
3. Sort the surviving rows in Node:
   - **search present** → by fuzzy score **descending**, tie-break by `localeCompare(locale)` name-asc (relevance ordering — natural for fuzzy search).
   - **no search** → by `sort`: `name-asc`/`name-desc` via `a.title.localeCompare(b.title, locale)`, `newest` by `createdAt` desc, `updated` by `updatedAt` desc.
4. `totalCount` = length of the sorted+filtered set (post-search).
5. Slice `[offset, offset + limit]`.
6. Attach tags for the sliced page only (unchanged grouped-query logic, now over the slice's ids).
7. Return `{ items, totalCount }` (unchanged shape).

The RSC page and the paged endpoint both call this one function, guaranteeing identical ordering across the initial render and every scrolled page.

### 2. Pure, framework-free search primitives (TDD)
File: `web/lib/domain/recipes/search.ts` (+ `search.test.ts`)

- `normalizeForSearch(s: string): string` — `s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()` so "Püree" ↔ "puree", "CAFÉ" ↔ "cafe".
- `fuzzyScore(haystack: string, needle: string): number` — normalizes both, returns a non-negative relevance score, 0 = no match. Scoring tiers (higher wins): exact match > prefix match > contiguous substring > in-order subsequence (typo/gap tolerant); 0 if `needle` is not an in-order subsequence of `haystack`. Empty `needle` → treated as "no filter" by the caller (caller skips filtering), but `fuzzyScore(x, "")` returns 0 by contract.

These are pure and live in the domain layer alongside the other recipe validators. The `RecipeSummary`-typed sort comparator stays in `queries/recipes.ts` (it needs the query DTO type); only the reusable string primitives go in `domain/`.

### 3. Paged data endpoint
File: `web/app/api/recipes/route.ts` (GET)

- Household-scoped via `requireHousehold()`; wrap in try/catch translating `AuthError` → `Response.json({error}, {status})`, mirroring `web/app/api/recipes/[id]/preview/route.ts`.
- Query params: `list`, `q`, `sort`, `tags` (comma-separated), `offset`, `limit` (clamped to a sane max, default 20).
- Returns `{ items: RecipeSummary[]; totalCount: number }` from `listRecipes`.
- This is the only new HTTP endpoint (server actions can't be used for GET-on-scroll pagination cleanly; a route handler matches the existing preview-route pattern and the old app's GET-based infinite query).

### 4. Client infinite-scroll island
File: `web/components/recipes/recipe-list.tsx` (`"use client"`)

Props (all serializable — no function props across the RSC boundary):
```ts
{ initialItems: RecipeSummary[]; totalCount: number;
  list: string; q: string; sort: string; tags: string[]; locale: string; }
```
Behavior:
- State: `items` (seeded from `initialItems`), derived `loaded = items.length`.
- Renders one `RecipeCard` per item.
- A sentinel `<div ref>` at the list bottom + `IntersectionObserver` (threshold ~0.1): when it intersects and `loaded < totalCount` and not already fetching, `GET /api/recipes?list=&q=&sort=&tags=&offset=loaded&limit=PAGE`, append the returned `items`.
- Shows a `Spinner` while fetching; nothing more to load once `loaded >= totalCount`.
- Guards against duplicate/overlapping fetches (in-flight flag) and disconnects the observer on unmount.
- **Reset on filter/sort change:** the RSC page passes `key={`${list}|${q}|${sort}|${tags.join(",")}`}` so a changed filter/sort remounts the island fresh with the new server-rendered first page — no stale accumulation.

### 5. `RecipeCard` → client component
File: `web/components/recipes/recipe-card.tsx`

Add `"use client"`, call `useT()` internally, and remove the `t` prop from `RecipeCardProps`. It already renders the client `RecipeCardDelete`. Update every caller to stop passing `t` (the RSC page and the new island). Grep for other importers and update them.

### 6. RSC page simplification
File: `web/app/(app)/recipes/page.tsx`

- Read `list`, `q`, `sort`, `tags` from `searchParams`. **Drop** the `offset` param handling.
- Call `listRecipes(db, householdId, { listType: list, search: q, tagIds, sort, locale, limit: PAGE, offset: 0 })`.
- **Remove** the local `sortItems` helper and the `<a href="?offset=…">` load-more block.
- Render `RecipeFilters` (unchanged) then: EmptyState (search-empty vs collection-empty, unchanged copy) when `totalCount === 0`, else `<RecipeList key=… initialItems={items} totalCount={totalCount} list={list} q={q} sort={sort} tags={tagIds} locale={locale} />`.

`RecipeFilters` already resets by pushing new URL params; it currently also deletes `offset` on change — that becomes a harmless no-op (or is cleaned up).

### 7. A5 — ingredient auto-create dedup
File: `web/lib/recipes/ingredients.ts` (+ test), consumed by `web/lib/recipes/upsert.ts`

- Add `findOrCreateIngredient(db, { nameEn, nameDe, category? })`: `SELECT id FROM ingredients WHERE lower(nameEn) = lower(:nameEn) LIMIT 1`; return the existing id, else `INSERT` (reusing `createIngredient`). Case-insensitive match, matching Django's `name_en.lower()` map.
- `upsert.ts` line ~144: replace `createIngredient(tx, …)` with `findOrCreateIngredient(tx, …)` for the `ingredientId == null` auto-create branch.
- Leave `createIngredient` unchanged (the explicit `createIngredientAction` endpoint keeps always-insert semantics — Django parity).
- `bulk-create.ts` already dedups — no change.

### 8. A6 — ingredient autocomplete order
File: `web/components/recipes/editor/ingredient-rows.tsx`

Sort the filtered `matches` by locale name before `.slice(0, 6)`:
`.sort((a, b) => ingredientName(a, locale).localeCompare(ingredientName(b, locale), locale))`.
Prefix matches may be ranked above interior substring matches for nicer UX, but a plain locale-name sort is the minimum fix. `listIngredients`' base ordering is irrelevant to correctness once the picker sorts (other callers use it as a Map), so its `orderBy(id)` can stay or switch to `nameEn` for tidiness — display order is fixed at the picker.

## i18n

- The list no longer needs a "Load more (N)" button (infinite scroll auto-loads); the `recipes.loadMore` key becomes unused. Remove it from `en.json`/`de.json` to keep the key-count parity check clean, or repurpose to a "loading more…" label if a visible label is wanted. Decision: **remove** `recipes.loadMore`; the spinner is icon-only.
- No new user-facing strings are anticipated. Keep `en`/`de` key counts equal (the plan's verification checks this).

## Testing strategy

Pure/lib logic is unit-tested with Vitest against in-memory SQLite (`createTestDb()`); client-island scroll interaction and the browser feel of infinite scroll are deferred to the on-host manual smoke pass, consistent with Plans 4–8c.

- **`domain/recipes/search.test.ts`:** `normalizeForSearch` (diacritics, case); `fuzzyScore` (exact > prefix > substring > subsequence ordering; non-subsequence → 0; diacritic/case insensitivity; empty needle contract).
- **`queries/recipes.test.ts` (extend):** sort correctness over a collection larger than one page for all four sorts (esp. `newest`/`updated` return globally-correct order, not page-local); locale-aware name ordering (German umlaut); pagination (`offset`/`limit` slice + stable `totalCount`); fuzzy search filters + relevance-orders; search + tag filter combined; cross-household isolation still holds. Existing `listRecipes` tests updated for the new signature.
- **`recipes/ingredients.test.ts` (extend):** `findOrCreateIngredient` returns existing id on case-insensitive name hit, inserts when absent; `createIngredient` still always inserts.
- **`recipes/upsert.test.ts` (extend):** upserting a recipe whose ingredient name matches an existing ingredient reuses it (no duplicate `ingredients` row); a genuinely new name still auto-creates once.
- **Route handler:** covered indirectly by the `listRecipes` tests (the handler is a thin scoped wrapper); a light scoping assertion is optional.

## File summary

**Created:**
- `web/lib/domain/recipes/search.ts` + `search.test.ts`
- `web/app/api/recipes/route.ts`
- `web/components/recipes/recipe-list.tsx`

**Modified:**
- `web/lib/queries/recipes.ts` (`listRecipes` sort/search/paginate; opts) + `recipes.test.ts`
- `web/lib/recipes/ingredients.ts` (`findOrCreateIngredient`) + `ingredients.test.ts`
- `web/lib/recipes/upsert.ts` (use `findOrCreateIngredient`) + `upsert.test.ts`
- `web/components/recipes/recipe-card.tsx` (→ client, `useT`, drop `t` prop)
- `web/components/recipes/editor/ingredient-rows.tsx` (A6 sort)
- `web/app/(app)/recipes/page.tsx` (simplify; mount island)
- `web/lib/i18n/locales/en.json`, `de.json` (remove `recipes.loadMore`)

## Out of scope

- Offline/PWA behavior (Plan 8f).
- Planner algorithm fidelity (Plan 8e).
- Changing `createIngredient`'s explicit-endpoint semantics.
- Server-side ranking beyond the simple fuzzy tiers (no external search lib).

## Verification (per task + final)

`npm test` (vitest), `npm run typecheck` (`tsc --noEmit`), and `npm run build` for tasks touching pages/routes. i18n key-count parity (`en` == `de`). No `lint` script in `web/` (ESLint via pre-commit).
