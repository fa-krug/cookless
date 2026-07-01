# Plan 8d — Recipe List: Full-Collection Sort, Infinite Scroll & Fuzzy Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recipes page sort and paginate over the whole collection with real server-paged infinite scroll and locale-aware fuzzy search, and stop the recipe editor from creating duplicate ingredients.

**Architecture:** `listRecipes` becomes the single source of sorted+paged results — it fetches all rows matching the structural filters (household + listType + tags), then fuzzy-filters, sorts, and slices in Node (SQLite can't do locale-aware ordering or diacritic-insensitive search). A thin household-scoped GET route (`/api/recipes`) exposes it; a client island renders the server-rendered first page and appends subsequent pages via `IntersectionObserver`. Ingredient auto-create gains a case-insensitive find-or-create.

**Tech Stack:** Next.js 16 (App Router, RSC + route handler) · Drizzle + better-sqlite3 · Vitest · React client island with `IntersectionObserver` · `lucide-react`.

Design spec: `docs/superpowers/specs/2026-07-01-nextjs-migration-08d-recipe-list-design.md`.

## Global Constraints

- **Working directory:** all commands run from `web/`. All app code lives under `web/`.
- **Verification per task:** `npm test` (vitest) and `npm run typecheck` (`tsc --noEmit`); add `npm run build` for tasks touching pages/routes/components. There is **no** `lint` script in `web/` (ESLint runs via pre-commit).
- **Test DB helper:** `createTestDb()` from `@/lib/test/db` (in-memory SQLite, `foreign_keys = ON`, migrations applied).
- **i18n:** locale JSON at `web/lib/i18n/locales/{en,de}.json`; server components use `getI18n()` → `{ locale, t }`; client components use `useT()` from `@/lib/i18n/provider`. Keep `en` and `de` key counts equal.
- **RSC boundary rule:** never pass a function (e.g. `t`) as a prop from a server component into a client component — client components call `useT()` themselves.
- **No new runtime dependencies.** Use `lucide-react` (already present) for the loading spinner.
- **Django parity for ingredient dedup:** auto-create matches on `name_en.lower()` (`backend/recipes/api.py:281`); the explicit create endpoint does **not** dedup (`api.py:679`).

---

## Task 1: Fuzzy search primitives (pure domain)

Pure, framework-free string helpers used by `listRecipes` to filter/rank search results with diacritic- and case-insensitivity.

**Files:**
- Create: `web/lib/domain/recipes/search.ts`
- Test: `web/lib/domain/recipes/search.test.ts`

**Interfaces:**
- Produces: `normalizeForSearch(s: string): string` — NFD + strip diacritics + lowercase.
- Produces: `fuzzyScore(haystack: string, needle: string): number` — `0` = no match; higher = better. Tiers: exact `4`, prefix `3`, substring `2`, in-order subsequence `1`. Empty/whitespace needle → `0`.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/domain/recipes/search.test.ts
import { describe, it, expect } from "vitest";
import { normalizeForSearch, fuzzyScore } from "./search";

describe("normalizeForSearch", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalizeForSearch("Püree")).toBe("puree");
    expect(normalizeForSearch("CAFÉ")).toBe("cafe");
  });
});

describe("fuzzyScore", () => {
  it("ranks exact > prefix > substring > subsequence", () => {
    expect(fuzzyScore("Pizza", "pizza")).toBe(4);
    expect(fuzzyScore("Pizza", "piz")).toBe(3);
    expect(fuzzyScore("Pineapple Pizza", "pizza")).toBe(2);
    expect(fuzzyScore("Pizza", "pza")).toBe(1);
  });
  it("returns 0 when the needle is not an in-order subsequence", () => {
    expect(fuzzyScore("Pizza", "xyz")).toBe(0);
  });
  it("is diacritic- and case-insensitive", () => {
    expect(fuzzyScore("Püree", "puree")).toBe(4);
    expect(fuzzyScore("Gemüse-Auflauf", "gemuse")).toBe(3);
  });
  it("treats an empty needle as no match", () => {
    expect(fuzzyScore("Pizza", "")).toBe(0);
    expect(fuzzyScore("Pizza", "   ")).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/domain/recipes/search.test.ts`
Expected: FAIL — `./search` module not found.

- [ ] **Step 3: Implement the primitives**

```ts
// web/lib/domain/recipes/search.ts

/** Lowercase + strip combining diacritics so "Püree" matches "puree". */
export function normalizeForSearch(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Relevance score of `needle` against `haystack`. 0 = no match.
 * Tiers: exact 4, prefix 3, substring 2, in-order subsequence 1.
 */
export function fuzzyScore(haystack: string, needle: string): number {
  const n = normalizeForSearch(needle.trim());
  if (n === "") return 0;
  const h = normalizeForSearch(haystack);
  if (h === n) return 4;
  if (h.startsWith(n)) return 3;
  if (h.includes(n)) return 2;
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i++;
    if (i === n.length) return 1;
  }
  return 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/domain/recipes/search.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify + commit**

```bash
npm test && npm run typecheck
git add web/lib/domain/recipes/search.ts web/lib/domain/recipes/search.test.ts
git commit -m "feat(web): fuzzy search primitives for recipe list (Plan 8d Task 1)"
```

---

## Task 2: `listRecipes` — sort, fuzzy search & paginate in Node

Move sorting/searching/pagination out of SQL into Node so they operate over the **whole** collection with correct locale ordering. Closes M6 (sort + pagination correctness) and A7 (locale-aware compare); wires in Task 1's fuzzy search.

**Files:**
- Modify: `web/lib/queries/recipes.ts` (the `ListRecipesOpts` interface + `listRecipes` function, lines ~36–128)
- Test: `web/lib/queries/recipes.test.ts` (extend + update)

**Interfaces:**
- Consumes: `fuzzyScore` from `@/lib/domain/recipes/search`.
- Produces: `listRecipes(db, householdId, opts?)` with extended `ListRecipesOpts`:
  ```ts
  export interface ListRecipesOpts {
    listType?: string;
    tagIds?: string[];
    search?: string;
    sort?: string;    // "name-asc" (default) | "name-desc" | "newest" | "updated"; unknown => name-asc
    locale?: string;  // default "en" — locale-aware name ordering
    limit?: number;   // default 20
    offset?: number;  // default 0
  }
  ```
  Return shape `{ items: RecipeSummary[]; totalCount: number }` is unchanged. `totalCount` is the post-search match count.

- [ ] **Step 1: Update the existing search test and add sort/pagination tests**

In `web/lib/queries/recipes.test.ts`, the existing `"filters by case-insensitive title search"` test still passes (fuzzy matches `"piz"→Pizza`). Add these tests inside the `describe("listRecipes", …)` block:

```ts
it("sorts the WHOLE collection before paginating (newest, not page-local)", () => {
  // seed() has r1 Pasta (2026-06-27) and r2 Pizza (2026-06-28) in KNOWN.
  const { items } = listRecipes(seed(), "h1", { listType: "KNOWN", sort: "newest", limit: 1 });
  expect(items.map((r) => r.id)).toEqual(["r2"]); // newest first, not alphabetical "Pasta"
});

it("orders by name ascending by default", () => {
  const { items } = listRecipes(seed(), "h1", { listType: "KNOWN" });
  expect(items.map((r) => r.id)).toEqual(["r1", "r2"]); // Pasta, Pizza
});

it("orders by name descending", () => {
  const { items } = listRecipes(seed(), "h1", { listType: "KNOWN", sort: "name-desc" });
  expect(items.map((r) => r.id)).toEqual(["r2", "r1"]); // Pizza, Pasta
});

it("paginates with a stable totalCount", () => {
  const p1 = listRecipes(seed(), "h1", { listType: "KNOWN", limit: 1, offset: 0 });
  const p2 = listRecipes(seed(), "h1", { listType: "KNOWN", limit: 1, offset: 1 });
  expect(p1.totalCount).toBe(2);
  expect(p2.totalCount).toBe(2);
  expect(p1.items.map((r) => r.id)).toEqual(["r1"]);
  expect(p2.items.map((r) => r.id)).toEqual(["r2"]);
});

it("fuzzy search tolerates diacritics and ranks by relevance", () => {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(recipes).values([
    { id: "a", householdId: "h1", title: "Pürée Soup", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
    { id: "b", householdId: "h1", title: "Chunky Puree Bowl", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
    { id: "c", householdId: "h1", title: "Pizza", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
  ]).run();
  const { items, totalCount } = listRecipes(db, "h1", { search: "puree" });
  expect(totalCount).toBe(2);              // Pizza excluded
  expect(items.map((r) => r.id)).toEqual(["a", "b"]); // prefix "Pürée…" ranks above substring
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run lib/queries/recipes.test.ts`
Expected: FAIL — `sort: "newest"` currently returns page-local order / `sort` is ignored.

- [ ] **Step 3: Rewrite `listRecipes` to sort + search + paginate in Node**

Replace the `ListRecipesOpts` interface and the body of `listRecipes` (through the `return { items, totalCount }`) in `web/lib/queries/recipes.ts`. Update the top-of-file import to drop `like` and add the fuzzy helper:

```ts
// change the drizzle import: remove `like`
import { and, asc, eq, inArray, sql } from "drizzle-orm";
// add near the other imports:
import { fuzzyScore } from "@/lib/domain/recipes/search";
```

```ts
export interface ListRecipesOpts {
  listType?: string;
  tagIds?: string[];
  search?: string;
  sort?: string;
  locale?: string;
  limit?: number;
  offset?: number;
}

function compareRecipes(
  a: { title: string; createdAt: Date; updatedAt: Date },
  b: { title: string; createdAt: Date; updatedAt: Date },
  sort: string,
  locale: string,
): number {
  switch (sort) {
    case "name-desc":
      return b.title.localeCompare(a.title, locale);
    case "newest":
      return +b.createdAt - +a.createdAt;
    case "updated":
      return +b.updatedAt - +a.updatedAt;
    default: // "name-asc"
      return a.title.localeCompare(b.title, locale);
  }
}

export function listRecipes(
  db: Db,
  householdId: string,
  opts: ListRecipesOpts = {},
): RecipeListResult {
  const { listType, tagIds, search, sort = "name-asc", locale = "en", limit = 20, offset = 0 } = opts;

  const conditions = [eq(recipes.householdId, householdId)];
  if (listType) conditions.push(eq(recipes.listType, listType));
  if (tagIds && tagIds.length > 0) {
    const tagged = db
      .selectDistinct({ recipeId: recipeTags.recipeId })
      .from(recipeTags)
      .where(inArray(recipeTags.tagId, tagIds))
      .all()
      .map((row) => row.recipeId);
    conditions.push(inArray(recipes.id, tagged.length ? tagged : ["__none__"]));
  }

  // Fetch all structurally-matching rows; sort/search/paginate in JS so the
  // whole collection is ordered correctly (SQLite has no locale-aware ORDER BY
  // and no diacritic-insensitive search). Household collections are small.
  const allRows = db.select().from(recipes).where(and(...conditions)).all();

  const q = search?.trim() ?? "";
  let ordered: typeof allRows;
  if (q) {
    ordered = allRows
      .map((r) => ({ r, score: fuzzyScore(r.title, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title, locale))
      .map((x) => x.r);
  } else {
    ordered = [...allRows].sort((a, b) => compareRecipes(a, b, sort, locale));
  }

  const totalCount = ordered.length;
  const rows = ordered.slice(offset, offset + limit);

  // Attach tags for the current page in one extra query, grouped in JS.
  const ids = rows.map((r) => r.id);
  const tagRows = ids.length
    ? db
        .select({
          recipeId: recipeTags.recipeId,
          id: tags.id,
          category: tags.category,
          nameEn: tags.nameEn,
          nameDe: tags.nameDe,
        })
        .from(recipeTags)
        .innerJoin(tags, eq(tags.id, recipeTags.tagId))
        .where(inArray(recipeTags.recipeId, ids))
        .all()
    : [];
  const tagsByRecipe = new Map<string, RecipeTagDto[]>();
  for (const tr of tagRows) {
    const list = tagsByRecipe.get(tr.recipeId) ?? [];
    list.push({ id: tr.id, category: tr.category, nameEn: tr.nameEn, nameDe: tr.nameDe });
    tagsByRecipe.set(tr.recipeId, list);
  }

  const items: RecipeSummary[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    listType: r.listType,
    defaultServings: r.defaultServings,
    prepTimeMinutes: r.prepTimeMinutes,
    cookTimeMinutes: r.cookTimeMinutes,
    leftoverDays: r.leftoverDays,
    image: r.image,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    tags: tagsByRecipe.get(r.id) ?? [],
  }));

  return { items, totalCount };
}
```

Note: `sql` stays imported (used by `totalCount` elsewhere? no — remove `sql` only if unused). After this edit `sql` is no longer used by `listRecipes`; check the rest of the file — if nothing else uses `sql`, drop it from the import to satisfy `tsc`. (`asc` is still used by `getRecipe`/`listTags`.)

- [ ] **Step 4: Run the full query test file**

Run: `npx vitest run lib/queries/recipes.test.ts`
Expected: PASS (all existing + 5 new).

- [ ] **Step 5: Verify + commit**

```bash
npm test && npm run typecheck
git add web/lib/queries/recipes.ts web/lib/queries/recipes.test.ts
git commit -m "feat(web): sort/fuzzy-search/paginate recipes over full collection (Plan 8d Task 2)"
```

---

## Task 3: Household-scoped GET route for paged recipes

The client island fetches subsequent pages from here. Mirrors the existing `app/api/recipes/[id]/preview/route.ts` auth/error pattern.

**Files:**
- Create: `web/app/api/recipes/route.ts`

**Interfaces:**
- Consumes: `requireHousehold()`, `AuthError`, `listRecipes`.
- Produces: `GET /api/recipes?list&q&sort&tags&offset&limit&locale` → `{ items: RecipeSummary[]; totalCount: number }` (JSON), scoped to the caller's active household. `limit` clamped to `[1, 100]`.

- [ ] **Step 1: Implement the route handler**

```ts
// web/app/api/recipes/route.ts
import { NextResponse } from "next/server";
import { requireHousehold } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/errors";
import { db } from "@/lib/db";
import { listRecipes } from "@/lib/queries/recipes";

export async function GET(req: Request) {
  try {
    const { householdId } = await requireHousehold();
    const p = new URL(req.url).searchParams;

    const list = p.get("list") ?? undefined;
    const q = p.get("q") ?? undefined;
    const sort = p.get("sort") ?? "name-asc";
    const locale = p.get("locale") ?? "en";
    const tagsParam = p.get("tags");
    const tagIds = tagsParam ? tagsParam.split(",").filter(Boolean) : undefined;
    const offset = Math.max(0, parseInt(p.get("offset") ?? "0", 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(p.get("limit") ?? "20", 10) || 20));

    const result = listRecipes(db, householdId, {
      listType: list,
      search: q,
      sort,
      locale,
      tagIds,
      offset,
      limit,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
```

- [ ] **Step 2: Verify build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: build succeeds; the route appears in the build output route list.

- [ ] **Step 3: Commit**

```bash
git add "web/app/api/recipes/route.ts"
git commit -m "feat(web): GET /api/recipes paged endpoint for infinite scroll (Plan 8d Task 3)"
```

---

## Task 4: `RecipeCard` → client component

Convert `RecipeCard` to a client component that translates itself, so both the RSC page and the upcoming client island can render it without passing a `t` function across the boundary.

**Files:**
- Modify: `web/components/recipes/recipe-card.tsx`
- Modify: `web/app/(app)/recipes/page.tsx` (drop the `t` prop at the existing call site, line ~119)

**Interfaces:**
- Produces: `RecipeCard({ recipe, locale }: { recipe: RecipeSummary; locale: string })` — no longer accepts `t`.

- [ ] **Step 1: Confirm the caller set**

Run: `grep -rn "RecipeCard" web/components web/app --include=*.tsx | grep -v "recipe-card-delete"`
Expected: the definition + the single usage in `web/app/(app)/recipes/page.tsx`. (If any other caller exists, update it in Step 3 too.)

- [ ] **Step 2: Convert the component**

At the top of `web/components/recipes/recipe-card.tsx` add the directive and the hook import, drop `t` from props, and read it from `useT()`:

```tsx
"use client";

import type { JSX } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { RecipeSummary } from "@/lib/queries/recipes";
import { pickName, recipeImageUrl } from "@/lib/display/format";
import { useT } from "@/lib/i18n/provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RecipeCardDelete } from "./recipe-card-delete";
```

Change the props interface and function signature:

```tsx
interface RecipeCardProps {
  recipe: RecipeSummary;
  locale: string;
}

export function RecipeCard({ recipe, locale }: RecipeCardProps): JSX.Element {
  const { t } = useT();
  const imageUrl = recipeImageUrl(recipe.image);
  // …rest of the JSX body is unchanged…
```

(Leave the entire JSX body below unchanged — it already uses `t(...)`, now sourced from the hook.)

- [ ] **Step 3: Drop the `t` prop at the page call site**

In `web/app/(app)/recipes/page.tsx`, change the card render (line ~119) from:

```tsx
<RecipeCard key={r.id} recipe={r} locale={locale} t={t} />
```
to:
```tsx
<RecipeCard key={r.id} recipe={r} locale={locale} />
```

- [ ] **Step 4: Verify build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: green. (`t` is still used elsewhere in the page for headings/empty states — the `const { locale, t } = await getI18n()` line stays.)

- [ ] **Step 5: Commit**

```bash
git add web/components/recipes/recipe-card.tsx "web/app/(app)/recipes/page.tsx"
git commit -m "refactor(web): RecipeCard is a client component using useT (Plan 8d Task 4)"
```

---

## Task 5: Infinite-scroll island + page rewrite

Replace the navigate-and-replace "load more" with a client island that renders the server-rendered first page and appends subsequent pages on scroll. Closes the M6 pagination regression.

**Files:**
- Create: `web/components/recipes/recipe-list.tsx`
- Modify: `web/app/(app)/recipes/page.tsx`
- Modify: `web/lib/i18n/locales/en.json`, `web/lib/i18n/locales/de.json` (remove the now-unused `recipes.loadMore`)

**Interfaces:**
- Consumes: `RecipeCard` (Task 4), `GET /api/recipes` (Task 3), `RecipeSummary`.
- Produces: `RecipeList({ initialItems, totalCount, list, q, sort, tags, locale })` — client component; all props serializable.

- [ ] **Step 1: Create the island**

```tsx
// web/components/recipes/recipe-list.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { RecipeSummary } from "@/lib/queries/recipes";
import { RecipeCard } from "./recipe-card";

const PAGE = 20;

interface RecipeListProps {
  initialItems: RecipeSummary[];
  totalCount: number;
  list: string;
  q: string;
  sort: string;
  tags: string[];
  locale: string;
}

export function RecipeList({
  initialItems,
  totalCount,
  list,
  q,
  sort,
  tags,
  locale,
}: RecipeListProps) {
  const [items, setItems] = useState<RecipeSummary[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = items.length < totalCount;

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        offset: String(items.length),
        limit: String(PAGE),
        sort,
        locale,
      });
      if (list) params.set("list", list);
      if (q) params.set("q", q);
      if (tags.length) params.set("tags", tags.join(","));
      const res = await fetch(`/api/recipes?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: RecipeSummary[] };
      setItems((prev) => [...prev, ...data.items]);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [items.length, list, q, sort, tags, locale]);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div className="space-y-3">
      {items.map((r) => (
        <RecipeCard key={r.id} recipe={r} locale={locale} />
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the page to mount the island**

Replace `web/app/(app)/recipes/page.tsx` entirely with:

```tsx
import { BookOpen, Plus, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { listRecipes, listTags } from "@/lib/queries/recipes";
import { getHouseholdAiSettings } from "@/lib/queries/household";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RecipeFilters } from "@/components/recipes/recipe-filters";
import { RecipeList } from "@/components/recipes/recipe-list";

const PAGE = 20;

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { householdId } = await requireHousehold();
  const { locale, t } = await getI18n();

  const list = typeof sp.list === "string" ? sp.list : "KNOWN";
  const q = typeof sp.q === "string" ? sp.q : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "name-asc";
  const tagIds = typeof sp.tags === "string" && sp.tags ? sp.tags.split(",") : [];

  const allTags = listTags(db, householdId);
  const { aiEnabled, hasKey } = getHouseholdAiSettings(db, householdId);
  const { items, totalCount } = listRecipes(db, householdId, {
    listType: list,
    search: q,
    tagIds,
    sort,
    locale,
    limit: PAGE,
    offset: 0,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("recipes.title")}</h1>
        <div className="flex items-center gap-2">
          {aiEnabled && hasKey && (
            <Button asChild size="sm" variant="outline">
              <Link href="/recipes/generate">
                <Sparkles size={16} />
                {t("generateRecipes.button")}
              </Link>
            </Button>
          )}
          <Button asChild size="sm">
            <Link href={`/recipes/new?list=${list}`}>
              <Plus size={16} />
              {t("recipes.addRecipe")}
            </Link>
          </Button>
        </div>
      </div>

      {/* RecipeFilters is a client island — pass only serializable props, NO t function */}
      <RecipeFilters
        list={list}
        q={q}
        sort={sort}
        tags={tagIds}
        allTags={allTags}
        locale={locale}
      />

      {totalCount === 0 ? (
        q ? (
          <EmptyState
            icon={Search}
            title={t("recipes.noSearchResults")}
            subtitle={t("recipes.noSearchResultsSubtitle")}
          />
        ) : (
          <EmptyState
            icon={BookOpen}
            title={t("recipes.noRecipesTitle")}
            subtitle={t("recipes.noRecipesSubtitle")}
            action={
              <Button asChild>
                <Link href={`/recipes/new?list=${list}`}>
                  <Plus size={16} />
                  {t("recipes.addFirstRecipe")}
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <RecipeList
          key={`${list}|${q}|${sort}|${tagIds.join(",")}`}
          initialItems={items}
          totalCount={totalCount}
          list={list}
          q={q}
          sort={sort}
          tags={tagIds}
          locale={locale}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Remove the now-unused `recipes.loadMore` i18n key**

In `web/lib/i18n/locales/en.json` delete the line:
```json
    "loadMore": "Load more ({{count}} remaining)",
```
In `web/lib/i18n/locales/de.json` delete the line:
```json
    "loadMore": "Mehr laden ({{count}} verbleibend)",
```
(Both are line ~118 inside the `"recipes"` object. Ensure the JSON stays valid — the preceding line keeps its trailing comma, and the key before/after remains well-formed.)

- [ ] **Step 4: Confirm no dangling references + key parity**

Run: `grep -rn "loadMore" web/lib web/app web/components`
Expected: no matches.

Run: `node -e "const en=require('./lib/i18n/locales/en.json'),de=require('./lib/i18n/locales/de.json');const c=o=>Object.keys(o).flatMap(k=>o[k]&&typeof o[k]==='object'?Object.keys(o[k]).map(s=>k+'.'+s):[k]);const a=c(en),b=c(de);console.log('en',a.length,'de',b.length,'equal',a.length===b.length)"`
Expected: `en` and `de` counts equal.

- [ ] **Step 5: Verify build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: green; `/recipes` builds; JSON parses.

- [ ] **Step 6: Commit**

```bash
git add web/components/recipes/recipe-list.tsx "web/app/(app)/recipes/page.tsx" web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json
git commit -m "feat(web): infinite-scroll recipe list over full sorted collection (Plan 8d Task 5)"
```

---

## Task 6: Ingredient auto-create dedup (A5)

The recipe editor's auto-create currently always inserts, duplicating existing ingredients. Add a case-insensitive find-or-create and use it in the upsert path. Leave `createIngredient` (explicit endpoint) untouched — Django parity.

**Files:**
- Modify: `web/lib/recipes/ingredients.ts`
- Test: `web/lib/recipes/ingredients.test.ts` (extend)
- Modify: `web/lib/recipes/upsert.ts` (line ~144 + import)
- Test: `web/lib/recipes/upsert.test.ts` (extend)

**Interfaces:**
- Produces: `findOrCreateIngredient(db, { nameEn, nameDe, category? }): { id: number }` — returns the id of an existing ingredient whose `nameEn` matches case-insensitively, else inserts a new one.

- [ ] **Step 1: Write the failing test for `findOrCreateIngredient`**

Add to `web/lib/recipes/ingredients.test.ts`:

```ts
import { findOrCreateIngredient } from "./ingredients";

describe("findOrCreateIngredient", () => {
  it("reuses an existing ingredient matched case-insensitively", () => {
    const db = createTestDb();
    const first = findOrCreateIngredient(db, { nameEn: "Basil", nameDe: "Basilikum" });
    const again = findOrCreateIngredient(db, { nameEn: "basil", nameDe: "Basilikum" });
    expect(again.id).toBe(first.id);
  });

  it("creates a new ingredient when the name is unknown", () => {
    const db = createTestDb();
    const a = findOrCreateIngredient(db, { nameEn: "Basil", nameDe: "Basilikum" });
    const b = findOrCreateIngredient(db, { nameEn: "Thyme", nameDe: "Thymian" });
    expect(b.id).not.toBe(a.id);
  });
});
```

(Use the same `createTestDb` import the file already has.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/recipes/ingredients.test.ts`
Expected: FAIL — `findOrCreateIngredient` not exported.

- [ ] **Step 3: Implement `findOrCreateIngredient`**

In `web/lib/recipes/ingredients.ts`, add the `sql` import and the function:

```ts
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { ingredients } from "@/lib/db/schema";

// (existing createIngredient stays unchanged)

export function findOrCreateIngredient(
  db: Db,
  input: { nameEn: string; nameDe: string; category?: string },
): { id: number } {
  const existing = db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(sql`lower(${ingredients.nameEn}) = ${input.nameEn.toLowerCase()}`)
    .get();
  if (existing) return { id: existing.id };
  return createIngredient(db, input);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/recipes/ingredients.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing upsert dedup test**

Add to `web/lib/recipes/upsert.test.ts` a test that upserting a recipe whose auto-create ingredient name matches an existing one reuses it. Follow the file's existing seeding/helpers; the essential assertions:

```ts
it("reuses an existing ingredient instead of duplicating on auto-create", () => {
  const db = createTestDb();
  // household + a unit + an existing ingredient "Onion"
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g" }).run();
  db.insert(ingredients).values({ id: 1, nameEn: "Onion", nameDe: "Zwiebel", category: "OTHER" }).run();

  upsertRecipe(db, "h1", null, {
    title: "Soup", description: "", listType: "KNOWN", defaultServings: 2,
    prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null,
    ingredients: [
      { ingredientId: null, nameEn: "onion", nameDe: "zwiebel", quantity: "100", unitId: 1, order: 0 },
    ],
    steps: [], tagIds: [],
  }, now);

  const all = db.select().from(ingredients).all();
  expect(all.length).toBe(1); // reused, not duplicated
});
```

(Match the exact `households`/`units`/`ingredients`/`now` imports the test file already uses; add any missing ones.)

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run lib/recipes/upsert.test.ts`
Expected: FAIL — a second `Onion` row was inserted (length 2).

- [ ] **Step 7: Switch the upsert auto-create to find-or-create**

In `web/lib/recipes/upsert.ts`:
- Change the import on line 11 from `import { createIngredient } from "./ingredients";` to `import { findOrCreateIngredient } from "./ingredients";`.
- On line ~144 change:
  ```ts
  ing.ingredientId ?? createIngredient(tx as unknown as Db, { nameEn: ing.nameEn, nameDe: ing.nameDe }).id;
  ```
  to:
  ```ts
  ing.ingredientId ?? findOrCreateIngredient(tx as unknown as Db, { nameEn: ing.nameEn, nameDe: ing.nameDe }).id;
  ```

- [ ] **Step 8: Run to verify both files pass**

Run: `npx vitest run lib/recipes/ingredients.test.ts lib/recipes/upsert.test.ts`
Expected: PASS.

- [ ] **Step 9: Verify + commit**

```bash
npm test && npm run typecheck
git add web/lib/recipes/ingredients.ts web/lib/recipes/ingredients.test.ts web/lib/recipes/upsert.ts web/lib/recipes/upsert.test.ts
git commit -m "fix(web): dedup ingredients on recipe auto-create (Plan 8d Task 6)"
```

---

## Task 7: Ingredient autocomplete ordering (A6)

The picker shows the first 6 `includes()` matches in insertion-id order. Sort matches by locale name before slicing.

**Files:**
- Modify: `web/components/recipes/editor/ingredient-rows.tsx` (the `matches` computation, lines ~48–52)

- [ ] **Step 1: Sort matches by locale name before slicing**

In `web/components/recipes/editor/ingredient-rows.tsx`, change:

```tsx
  const matches = query.trim()
    ? ingredients
        .filter((i) => ingredientName(i, locale).toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6)
    : [];
```
to:
```tsx
  const matches = query.trim()
    ? ingredients
        .filter((i) => ingredientName(i, locale).toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => ingredientName(a, locale).localeCompare(ingredientName(b, locale), locale))
        .slice(0, 6)
    : [];
```

- [ ] **Step 2: Verify build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add "web/components/recipes/editor/ingredient-rows.tsx"
git commit -m "fix(web): order ingredient autocomplete by locale name (Plan 8d Task 7)"
```

---

## Final verification

- [ ] Run the full suite + typecheck + build from `web/`:

```bash
npm test && npm run typecheck && npm run build
```
Expected: all vitest green (Task 1 + Task 2 + Task 6 additions), `tsc` clean, `next build` succeeds with the new `/api/recipes` route.

- [ ] Confirm i18n key parity (en == de) using the Task 5 Step 4 snippet.

- [ ] Manual browser smoke (deferred to the on-host pass, consistent with Plans 4–8c): load `/recipes`, scroll to trigger infinite load, switch sort (verify order changes across the whole list, not just the first page), fuzzy-search with a German umlaut, and add a recipe in the editor typing an existing ingredient name (verify no duplicate created).

---

## Self-Review

**Spec coverage:**
- M6 sort over whole collection → Task 2 (sort in Node before slice) ✓
- M6 pagination accumulates (not navigate-replace) → Task 3 (endpoint) + Task 5 (island) ✓
- A7 locale-aware compare → Task 2 (`localeCompare(…, locale)`) ✓
- Server-side fuzzy search → Task 1 (primitives) + Task 2 (wired) ✓
- A5 ingredient dedup on auto-create → Task 6 ✓
- A6 autocomplete order → Task 7 ✓
- RecipeCard client conversion (RSC-boundary rule) → Task 4 ✓
- Remove `recipes.loadMore`, keep key parity → Task 5 Steps 3–4 ✓

**Placeholder scan:** none — every code step shows full code; test steps include real assertions.

**Type consistency:** `ListRecipesOpts` (Task 2) adds `sort?: string`/`locale?: string`; `listRecipes` return shape unchanged; route (Task 3) and page/island (Tasks 4–5) pass exactly those opts; `RecipeCard({recipe, locale})` (Task 4) matches the island/page callers (Task 5); `findOrCreateIngredient` (Task 6) signature matches its `upsert.ts` call site.

**Deviation from spec (intentional):** `ListRecipesOpts.sort` is typed `string` (not a strict union) with an internal switch-default, so the page and route pass raw URL values without guard code; unknown sort values fall back to `name-asc`.
