# Plan 8c — Shopping Multi-List Access + Correctness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore old-app shopping parity — per-entry serving scaling, a shopping list per segment (including empty ones), a `/shopping/[id]` detail route reachable via per-day plan-page links, and self-referential FK hardening.

**Architecture:** Fix `generateShoppingListsForIteration` to scale by each entry's own `servings` and to always create a list per segment. Add a household-scoped `getShoppingListById` query and a shared `ShoppingListView` server component rendered by both `/shopping` and a new `/shopping/[id]` route. Point plan-page day links at the specific list. Add `SET NULL` self-FKs on `meal_plan_entries.source_entry_id` and `units.base_unit_id`.

**Tech Stack:** Next.js 15 (App Router, server components), Drizzle ORM + better-sqlite3, Vitest, next-intl-style i18n via `getI18n`/`useT`.

## Global Constraints

- Package manager / commands run from `web/`: `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run db:generate`, `npm run db:migrate`.
- There is **no** `lint` script in `web/` (ESLint lives only in the old `frontend/`). Use `tsc --noEmit` for static checks.
- i18n: keys live in `web/lib/i18n/locales/{en,de}.json`; keep **en/de at full key parity** (currently 506/506). Any new key must be added to **both**.
- Multi-tenancy: every shopping read must be scoped to the caller's household (`requireHousehold()` → `householdId`), joining `shopping_lists → plan_iterations → meal_plans.householdId`.
- Follow existing file/style conventions; server components call `getI18n()`, client components use `useT()`.

---

## Task 1: Generation correctness — per-entry servings (A3) + always-create lists (A4)

**Files:**
- Modify: `web/lib/shopping/generate.ts`
- Modify: `web/lib/meal-plan/setup.ts:158-161` (drop the `servings` opt)
- Test: `web/lib/shopping/generate.test.ts`

**Interfaces:**
- Produces: `generateShoppingListsForIteration(db, { iterationId, startDate, endDate, shoppingDays })` — the `servings` field is **removed** from `GenerateOpts`. Per-entry servings are read from `meal_plan_entries.servings`.

- [ ] **Step 1: Write the failing tests**

In `web/lib/shopping/generate.test.ts`, first update the two existing tests to stop passing `servings` in opts (remove `, servings: 4` from both `generateShoppingListsForIteration(...)` / `opts` literals). Their assertions stay valid because the seeded entries already have `servings: 4` and `defaultServings: 2` (4/2 = 2× scale → 400/300).

Then add two new tests inside the `describe` block:

```ts
it("scales each entry by its own servings, not a plan-level value", () => {
  const db = seed();
  // Add a second cooking entry on Tue (weekday 2, still in segment) with servings 2 → 1x scale.
  db.insert(recipes).values({ id: "r2", householdId: "h1", title: "Soup", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now }).run();
  db.insert(recipeIngredients).values({ recipeId: "r2", ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
  db.insert(mealPlanEntries).values(
    { id: "e3", iterationId: "it1", date: "2026-06-24", mealType: "LUNCH", recipeId: "r2", servings: 2, isLeftover: false, isLocked: false },
  ).run();
  generateShoppingListsForIteration(db, {
    iterationId: "it1", startDate: "2026-06-22", endDate: "2026-06-28", shoppingDays: [1],
  });
  const lists = db.select().from(shoppingLists).where(eq(shoppingLists.iterationId, "it1")).all();
  const items = db.select().from(shoppingListItems).where(eq(shoppingListItems.shoppingListId, lists[0].id)).all();
  const byIng = Object.fromEntries(items.map((i) => [i.ingredientId, i.quantity]));
  // Tomato: r1 200g * (4/2)=400 + r2 100g * (2/2)=100 → 500. Pasta: r1 150 * 2 = 300.
  expect(byIng[1]).toBe("500");
  expect(byIng[2]).toBe("300");
});

it("creates a list for a segment even when it aggregates to zero items", () => {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(mealPlans).values({ id: "mp1", householdId: "h1", shoppingDay1: 1, servings: 4, knownRatio: "0.7", defaultLeftoverDays: 1, createdAt: now }).run();
  db.insert(planIterations).values({ id: "it1", mealPlanId: "mp1", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now }).run();
  // No entries at all → one segment, zero aggregated items.
  generateShoppingListsForIteration(db, {
    iterationId: "it1", startDate: "2026-06-22", endDate: "2026-06-28", shoppingDays: [1],
  });
  const lists = db.select().from(shoppingLists).where(eq(shoppingLists.iterationId, "it1")).all();
  expect(lists.length).toBe(1);
  const items = db.select().from(shoppingListItems).where(eq(shoppingListItems.shoppingListId, lists[0].id)).all();
  expect(items.length).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run lib/shopping/generate.test.ts`
Expected: the two new tests FAIL (per-entry test gets 400/300 because plan-level servings is still used and r2 currently scales by opts.servings; empty-segment test gets `lists.length` 0 due to the `continue`). The two edited existing tests may also fail to compile until Step 3 removes `servings` from `GenerateOpts` — that is expected.

- [ ] **Step 3: Implement per-entry servings + always-create**

Edit `web/lib/shopping/generate.ts`:

1. Remove `servings` from the `GenerateOpts` interface and from the destructure on line 21:

```ts
interface GenerateOpts {
  iterationId: string;
  startDate: string;
  endDate: string;
  shoppingDays: readonly number[];
}
```
```ts
  const { iterationId, startDate, endDate, shoppingDays } = opts;
```

2. Add `servings` to the entry select and use it per entry:

```ts
    const entries = db
      .select({
        recipeId: mealPlanEntries.recipeId,
        servings: mealPlanEntries.servings,
        defaultServings: recipes.defaultServings,
      })
      .from(mealPlanEntries)
      .innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
      .where(
        and(
          eq(mealPlanEntries.iterationId, iterationId),
          eq(mealPlanEntries.isLeftover, false),
          gte(mealPlanEntries.date, seg.segStart),
          lte(mealPlanEntries.date, seg.segEnd),
        ),
      )
      .all();
```
```ts
      return {
        servings: e.servings,
        defaultServings: e.defaultServings,
        isLeftover: false,
        ingredients: ings.map((ri) => ({
          ingredientId: ri.ingredientId,
          quantity: ri.quantity,
          unit: unitMap.get(ri.unitId)!,
        })),
      };
```

3. Always create the list; only guard the item insert against an empty array. Replace the block starting at `const aggregated = aggregateShoppingItems(shoppingEntries);` through the end of the loop body with:

```ts
    const aggregated = aggregateShoppingItems(shoppingEntries);

    const listId = randomUUID();
    db.insert(shoppingLists).values({
      id: listId, iterationId, shoppingDate: seg.shoppingDate, createdAt,
    }).run();
    if (aggregated.length > 0) {
      db.insert(shoppingListItems).values(
        aggregated.map((a) => ({
          id: randomUUID(),
          shoppingListId: listId,
          ingredientId: a.ingredientId,
          quantity: a.quantity.toString(),
          unitId: a.unitId,
          isChecked: false,
        })),
      ).run();
    }
```

Then update the caller `web/lib/meal-plan/setup.ts` (around line 158) to drop `servings`:

```ts
  const shoppingDays = [plan.shoppingDay1, plan.shoppingDay2].filter((d): d is number => d != null);
  generateShoppingListsForIteration(db, {
    iterationId, startDate, endDate, shoppingDays,
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run lib/shopping/generate.test.ts && npx tsc --noEmit`
Expected: all generate tests PASS; typecheck clean (no remaining `servings` references in opts).

- [ ] **Step 5: Commit**

```bash
git add web/lib/shopping/generate.ts web/lib/meal-plan/setup.ts web/lib/shopping/generate.test.ts
git commit -m "fix(web): per-entry servings + always-create shopping lists (Plan 8c Task 1)"
```

---

## Task 2: `getShoppingListById` query + deterministic latest ordering

**Files:**
- Modify: `web/lib/queries/shopping.ts`
- Test: `web/lib/queries/shopping.test.ts` (create)

**Interfaces:**
- Consumes: `ShoppingListView`, `ShoppingItemDto` (existing exports).
- Produces: `getShoppingListById(db, householdId, id, locale): ShoppingListView | null` — returns the list only if it belongs to `householdId`, else `null`. `getLatestShoppingList` keeps its signature; its ordering becomes `createdAt DESC, shoppingDate ASC`.

- [ ] **Step 1: Write the failing test**

Create `web/lib/queries/shopping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households, ingredients, units, mealPlans, planIterations, shoppingLists, shoppingListItems,
} from "@/lib/db/schema";
import { getShoppingListById } from "./shopping";

const now = new Date("2026-06-27T12:00:00Z");

function seed() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
  db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
  db.insert(mealPlans).values([
    { id: "mp1", householdId: "h1", shoppingDay1: 1, servings: 4, knownRatio: "0.7", defaultLeftoverDays: 1, createdAt: now },
    { id: "mp2", householdId: "h2", shoppingDay1: 1, servings: 4, knownRatio: "0.7", defaultLeftoverDays: 1, createdAt: now },
  ]).run();
  db.insert(planIterations).values([
    { id: "it1", mealPlanId: "mp1", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now },
    { id: "it2", mealPlanId: "mp2", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now },
  ]).run();
  db.insert(shoppingLists).values([
    { id: "sl1", iterationId: "it1", shoppingDate: "2026-06-22", createdAt: now },
    { id: "sl2", iterationId: "it2", shoppingDate: "2026-06-22", createdAt: now },
  ]).run();
  db.insert(shoppingListItems).values(
    { id: "i1", shoppingListId: "sl1", ingredientId: 1, quantity: "400", unitId: 1, isChecked: false },
  ).run();
  return db;
}

describe("getShoppingListById", () => {
  it("returns an owned list with its date and items", () => {
    const db = seed();
    const list = getShoppingListById(db, "h1", "sl1", "en");
    expect(list?.id).toBe("sl1");
    expect(list?.shoppingDate).toBe("2026-06-22");
    expect(list?.items.map((i) => i.ingredientName)).toEqual(["Tomato"]);
  });

  it("returns null for a list owned by another household", () => {
    const db = seed();
    expect(getShoppingListById(db, "h1", "sl2", "en")).toBeNull();
  });

  it("returns null for a missing id", () => {
    const db = seed();
    expect(getShoppingListById(db, "h1", "nope", "en")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run lib/queries/shopping.test.ts`
Expected: FAIL — `getShoppingListById` is not exported.

- [ ] **Step 3: Implement the query + shared item helper**

Edit `web/lib/queries/shopping.ts`. Add `and` to the drizzle import (`import { and, asc, desc, eq } from "drizzle-orm";`), add `mealPlans`/`planIterations` are already imported. Extract the item query into a private helper and add the new function; refactor `getLatestShoppingList` to reuse the helper and tighten its ordering:

```ts
function loadItems(db: Db, listId: string, locale: "en" | "de"): ShoppingItemDto[] {
  const itemRows = db
    .select({
      id: shoppingListItems.id, category: ingredients.category,
      nameEn: ingredients.nameEn, nameDe: ingredients.nameDe,
      quantity: shoppingListItems.quantity, unitAbbreviation: units.abbreviation,
      isChecked: shoppingListItems.isChecked,
    })
    .from(shoppingListItems)
    .innerJoin(ingredients, eq(ingredients.id, shoppingListItems.ingredientId))
    .innerJoin(units, eq(units.id, shoppingListItems.unitId))
    .where(eq(shoppingListItems.shoppingListId, listId))
    .orderBy(asc(locale === "de" ? ingredients.nameDe : ingredients.nameEn))
    .all();
  return itemRows.map((r) => ({
    id: r.id, ingredientName: locale === "de" ? r.nameDe : r.nameEn, category: r.category,
    quantity: r.quantity, unitAbbreviation: r.unitAbbreviation, isChecked: r.isChecked,
  }));
}

export function getShoppingListById(
  db: Db, householdId: string, id: string, locale: "en" | "de",
): ShoppingListView | null {
  const list = db
    .select({ id: shoppingLists.id, shoppingDate: shoppingLists.shoppingDate, createdAt: shoppingLists.createdAt })
    .from(shoppingLists)
    .innerJoin(planIterations, eq(planIterations.id, shoppingLists.iterationId))
    .innerJoin(mealPlans, eq(mealPlans.id, planIterations.mealPlanId))
    .where(and(eq(shoppingLists.id, id), eq(mealPlans.householdId, householdId)))
    .get();
  if (!list) return null;
  return { id: list.id, shoppingDate: list.shoppingDate, createdAt: list.createdAt, items: loadItems(db, list.id, locale) };
}
```

Then change `getLatestShoppingList` to reuse `loadItems` (replace its inline `itemRows`/return with `items: loadItems(db, list.id, locale)`) and update its `.orderBy(...)` to:

```ts
    .orderBy(desc(shoppingLists.createdAt), asc(shoppingLists.shoppingDate))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run lib/queries/shopping.test.ts && npx tsc --noEmit`
Expected: all PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add web/lib/queries/shopping.ts web/lib/queries/shopping.test.ts
git commit -m "feat(web): getShoppingListById household-scoped query (Plan 8c Task 2)"
```

---

## Task 3: Shared `ShoppingListView` component + refactor `/shopping`

**Files:**
- Create: `web/components/shopping/shopping-list-view.tsx`
- Modify: `web/app/(app)/shopping/page.tsx`
- Modify: `web/lib/i18n/locales/en.json`, `web/lib/i18n/locales/de.json` (add `shopping.forDate`)

**Interfaces:**
- Consumes: `ShoppingListView` (type) from `@/lib/queries/shopping`; `ShoppingCategory`, `UncheckAllButton`, `EmptyState`, `CATEGORY_ORDER`, `getI18n`.
- Produces: `async function ShoppingListView({ list, showDate }: { list: ShoppingListViewDto | null; showDate?: boolean })` — a server component rendering the full shopping body (title + states + categories). (The DTO type is the query's `ShoppingListView`; the component is named `ShoppingListView` too — import the type `as ShoppingListDto` inside the component file to avoid the name clash.)

- [ ] **Step 1: Add the `shopping.forDate` i18n key to both locales**

In `web/lib/i18n/locales/en.json`, inside the `"shopping"` object add:

```json
    "forDate": "Shopping for {{date}}",
```

In `web/lib/i18n/locales/de.json`, inside its `"shopping"` object add:

```json
    "forDate": "Einkauf für {{date}}",
```

- [ ] **Step 2: Create the shared component**

Create `web/components/shopping/shopping-list-view.tsx`:

```tsx
import { CheckCircle, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import type { ShoppingListView as ShoppingListDto, ShoppingItemDto } from "@/lib/queries/shopping";
import { EmptyState } from "@/components/ui/empty-state";
import { ShoppingCategory } from "@/components/shopping/shopping-category";
import { UncheckAllButton } from "@/components/shopping/shopping-actions";
import { CATEGORY_ORDER } from "@/lib/display/format";

export async function ShoppingListView({
  list,
  showDate = false,
}: {
  list: ShoppingListDto | null;
  showDate?: boolean;
}) {
  const { locale, t } = await getI18n();

  const title = <h1 className="text-2xl font-bold">{t("shopping.title")}</h1>;

  if (!list || list.items.length === 0) {
    return (
      <div className="space-y-4">
        {title}
        <EmptyState
          icon={ShoppingCart}
          title={t("shopping.emptyTitle")}
          subtitle={t("shopping.emptySubtitle")}
          action={
            <Link href="/plan" className="text-sm font-medium text-primary hover:underline">
              {t("shopping.goToPlan")}
            </Link>
          }
        />
      </div>
    );
  }

  if (list.items.every((i) => i.isChecked)) {
    return (
      <div className="space-y-4">
        {title}
        <EmptyState
          icon={CheckCircle}
          title={t("shopping.allDoneTitle")}
          subtitle={t("shopping.allDoneSubtitle")}
          action={
            <Link href="/plan" className="text-sm font-medium text-primary hover:underline">
              {t("shopping.backToPlan")}
            </Link>
          }
        />
      </div>
    );
  }

  const dateLabel =
    showDate && list.shoppingDate
      ? t("shopping.forDate", {
          date: new Date(list.shoppingDate + "T00:00:00").toLocaleDateString(locale, {
            month: "short",
            day: "numeric",
          }),
        })
      : t("shopping.linkedToPlan");

  const byCategory = new Map<string, ShoppingItemDto[]>();
  for (const item of list.items) {
    const cat = (CATEGORY_ORDER as readonly string[]).includes(item.category) ? item.category : "OTHER";
    const arr = byCategory.get(cat) ?? [];
    arr.push(item);
    byCategory.set(cat, arr);
  }

  return (
    <div className="space-y-4">
      {title}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
        <UncheckAllButton itemIds={list.items.filter((i) => i.isChecked).map((i) => i.id)} />
      </div>
      <div className="space-y-3">
        {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => (
          <ShoppingCategory key={c} category={c} items={byCategory.get(c)!} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Refactor `/shopping` to render the shared component**

Replace the entire body of `web/app/(app)/shopping/page.tsx` with:

```tsx
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getLatestShoppingList } from "@/lib/queries/shopping";
import { ShoppingListView } from "@/components/shopping/shopping-list-view";

export default async function ShoppingPage() {
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();
  const list = getLatestShoppingList(db, householdId, locale as "en" | "de");
  return <ShoppingListView list={list} />;
}
```

- [ ] **Step 4: Verify build + types + i18n parity**

Run: `cd web && npx tsc --noEmit && node -e "const en=require('./lib/i18n/locales/en.json'),de=require('./lib/i18n/locales/de.json');const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)?f(v,p+k+'.'):[p+k]);const E=new Set(f(en)),D=new Set(f(de));console.log('en',E.size,'de',D.size,'missDe',[...E].filter(k=>!D.has(k)),'missEn',[...D].filter(k=>!E.has(k)))"`
Expected: typecheck clean; `missDe []` and `missEn []` (parity holds with the new `shopping.forDate` key on both sides).

- [ ] **Step 5: Commit**

```bash
git add web/components/shopping/shopping-list-view.tsx web/app/\(app\)/shopping/page.tsx web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json
git commit -m "refactor(web): shared ShoppingListView + forDate label (Plan 8c Task 3)"
```

---

## Task 4: `/shopping/[id]` detail route

**Files:**
- Create: `web/app/(app)/shopping/[id]/page.tsx`

**Interfaces:**
- Consumes: `requireHousehold`, `getI18n`, `db`, `getShoppingListById` (Task 2), `ShoppingListView` (Task 3), `notFound` from `next/navigation`.

- [ ] **Step 1: Create the detail page**

Create `web/app/(app)/shopping/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getShoppingListById } from "@/lib/queries/shopping";
import { ShoppingListView } from "@/components/shopping/shopping-list-view";

export default async function ShoppingListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();
  const list = getShoppingListById(db, householdId, id, locale as "en" | "de");
  if (!list) notFound();
  return <ShoppingListView list={list} showDate />;
}
```

- [ ] **Step 2: Verify build + types**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: clean build; route list includes `/shopping/[id]`.

- [ ] **Step 3: Commit**

```bash
git add web/app/\(app\)/shopping/\[id\]/page.tsx
git commit -m "feat(web): /shopping/[id] detail route (Plan 8c Task 4)"
```

---

## Task 5: Plan-page per-day links to the specific list

**Files:**
- Modify: `web/components/plan/iteration-card.tsx` (the shopping-preview `Link`, ~line 160)

**Interfaces:**
- Consumes: `PlanShoppingListDto.id` (already present on the DTO).

- [ ] **Step 1: Point the day link at the specific list**

In `web/components/plan/iteration-card.tsx`, change the shopping-preview link's `href` from the static `/shopping` to the per-list route:

```tsx
                  {isShoppingDay && shoppingList && (
                    <Link
                      href={`/shopping/${shoppingList.id}`}
                      className="flex items-center gap-2 px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-950"
                    >
                      <ShoppingCart size={14} className="text-blue-500" />
                      <span className="text-sm font-medium text-blue-500">
                        {t("plan.shoppingPreview", { count: shoppingList.itemCount })}
                      </span>
                    </Link>
                  )}
```

- [ ] **Step 2: Verify types + build**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/components/plan/iteration-card.tsx
git commit -m "feat(web): link each plan shopping day to its own list (Plan 8c Task 5)"
```

---

## Task 6: A9 — self-referential FK hardening

**Files:**
- Modify: `web/lib/db/schema.ts` (`units.baseUnitId`, `mealPlanEntries.sourceEntryId`)
- Create: `web/drizzle/000X_*.sql` (generated by drizzle-kit)
- Test: `web/lib/shopping/generate.test.ts` or a small dedicated test (see Step 1)

**Interfaces:**
- No API surface change. Adds `SET NULL` self-FKs matching the old Django models.

- [ ] **Step 1: Write a failing test for the SET NULL behavior**

Add to `web/lib/shopping/generate.test.ts` (it already imports `mealPlanEntries`, `eq`, `createTestDb`, `now`):

```ts
it("nulls a leftover's sourceEntryId when its source entry is deleted (A9 SET NULL)", () => {
  const db = seed(); // seeds e1 (source) and e2 (leftover, sourceEntryId 'e1')
  db.delete(mealPlanEntries).where(eq(mealPlanEntries.id, "e1")).run();
  const leftover = db.select().from(mealPlanEntries).where(eq(mealPlanEntries.id, "e2")).get();
  expect(leftover?.sourceEntryId).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run lib/shopping/generate.test.ts -t "SET NULL"`
Expected: FAIL — without the FK, `e2.sourceEntryId` stays `"e1"` (a dangling reference), not `null`.

- [ ] **Step 3: Add the self-FKs to the schema**

In `web/lib/db/schema.ts`, add the `AnySQLiteColumn` type import to the existing `drizzle-orm/sqlite-core` import line, e.g.:

```ts
import { sqliteTable, text, integer, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
```
(Preserve whatever helpers are already imported from that module — only add `type AnySQLiteColumn`.)

Change `units.baseUnitId` (line ~98):

```ts
  baseUnitId: integer("base_unit_id").references((): AnySQLiteColumn => units.id, { onDelete: "set null" }),
```

Change `mealPlanEntries.sourceEntryId` (line ~233):

```ts
  sourceEntryId: text("source_entry_id").references((): AnySQLiteColumn => mealPlanEntries.id, {
    onDelete: "set null",
  }),
```

- [ ] **Step 4: Generate the migration**

Run: `cd web && npm run db:generate`
Expected: a new `web/drizzle/000X_*.sql` file is created that rebuilds `units` and `meal_plan_entries` with the new `FOREIGN KEY (...) REFERENCES ... ON DELETE set null`. Inspect it to confirm both tables are rebuilt and no columns/data are dropped.

- [ ] **Step 5: Run the full generate + setup suites to verify FK-safety**

Run: `cd web && npx vitest run lib/shopping/generate.test.ts lib/meal-plan`
Expected: all PASS — including the new SET NULL test, and the existing generation/setup tests (batch inserts remain FK-safe because each leftover entry is inserted after its source entry).

- [ ] **Step 6: Commit**

```bash
git add web/lib/db/schema.ts web/drizzle/ web/lib/shopping/generate.test.ts
git commit -m "feat(web): self-referential SET NULL FKs on source_entry_id + base_unit_id (Plan 8c Task 6)"
```

---

## Task 7: Full verification pass

**Files:** none (verification + memory).

- [ ] **Step 1: Full test suite**

Run: `cd web && npm test`
Expected: all pass (existing 345 + the new 8c tests).

- [ ] **Step 2: Types + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: clean; route list includes `/shopping` and `/shopping/[id]`.

- [ ] **Step 3: i18n parity**

Run: `cd web && node -e "const en=require('./lib/i18n/locales/en.json'),de=require('./lib/i18n/locales/de.json');const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)?f(v,p+k+'.'):[p+k]);const E=new Set(f(en)),D=new Set(f(de));console.log('missDe',[...E].filter(k=>!D.has(k)),'missEn',[...D].filter(k=>!E.has(k)))"`
Expected: `missDe []`, `missEn []`.

- [ ] **Step 4: Migration applies on a scratch DB**

Run: `cd web && DATABASE_FILE=./data/_8c_scratch.db npm run db:migrate && rm -f ./data/_8c_scratch.db`
Expected: "migrations applied" with no FK/rebuild errors.

- [ ] **Step 5: Update memory index**

In `/Users/skrug/.claude/projects/-Users-skrug-PycharmProjects-cookless/memory/nextjs-migration.md` and the `MEMORY.md` index line, mark Plan 8c complete and note remaining §B plans (8d/8e/8f).

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-07-01-nextjs-migration-08c-shopping-multi-list.md
git commit -m "docs: mark Plan 8c complete (Plan 8c Task 7)"
```

---

## Self-Review

**Spec coverage:**
- M7 multi-list access → Task 2 (`getShoppingListById`), Task 4 (`/shopping/[id]`), Task 5 (per-day links). ✓
- A3 per-entry servings → Task 1. ✓
- A4 always-create empty-segment lists → Task 1. ✓
- Display segment `shoppingDate` → Task 3 (`shopping.forDate`, `showDate` on detail page). ✓
- A9 self-referential FKs (`source_entry_id` + `base_unit_id`, SET NULL) → Task 6. ✓
- Shared view to prevent `/shopping` vs `/shopping/[id]` divergence → Task 3. ✓
- en/de i18n parity → Task 3 adds `shopping.forDate` to both; verified in Tasks 3/7. ✓

**Placeholder scan:** none — every code step shows full code; commands have expected output.

**Type consistency:** `getShoppingListById(db, householdId, id, locale) → ShoppingListView | null` (Task 2) matches its consumer in Task 4. `ShoppingListView` component prop `{ list: ShoppingListDto | null; showDate?: boolean }` (Task 3) matches both call sites (Task 3 `/shopping`, Task 4 detail). `GenerateOpts` loses `servings` in Task 1 and the only caller (`setup.ts`) is updated in the same task. `PlanShoppingListDto.id` (used in Task 5) already exists.

**Out of scope (confirmed):** offline (8f), recipe-list sort/pagination (8d), planner fidelity (8e), list-switcher UI, `/shopping-lists` index page.
