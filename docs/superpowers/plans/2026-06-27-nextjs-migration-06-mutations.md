# Next.js Migration — Plan 6: Mutations (Server Actions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the disabled `TODO(plan-6)` mutation placeholders left by Plan 5 with real server actions + client islands: shopping toggles/reset, recipe move/delete, meal-plan generate/renew/next-iteration, plus the cooking-mode page and the share/export overlay.

**Architecture:** Risky logic lives in framework-free, household-scoped service functions under `web/lib/{shopping,recipes,meal-plan}/`, dependency-injected (`db`, `now: Date`, optional `Rng`) and TDD'd against in-memory SQLite via `createTestDb()` — mirroring Plan 3/5. Thin `"use server"` wrappers in `web/app/(app)/actions.ts` parse Zod input, call the service with the real `db` + `new Date()`, translate `AuthError`/validation into a `Result` discriminated union, and `revalidatePath()` the affected route. Interactive affordances on existing RSC pages are extracted into small `"use client"` islands that call `useT()` themselves and invoke the actions (NO function props cross the server/client boundary — the Plan 5 rule).

**Tech Stack:** Next.js App Router (server actions + `revalidatePath`), Drizzle + better-sqlite3, decimal.js (via `@/lib/domain/decimal`), Zod, react-hook-form + `@hookform/resolvers`, `sonner` toasts, Vitest.

## Global Constraints

These apply to EVERY task; each task's requirements implicitly include them.

- **Household scoping is mandatory.** Every mutation service takes `householdId` (or resolves it) and filters by it — directly for household-owned rows (`recipes`, `meal_plans`), or via join for descendant rows (`shopping_list_items` → `shopping_lists` → `plan_iterations` → `meal_plans.household_id`). A cross-tenant test (operate on another household's row → expect failure / no-op) is REQUIRED in every service test file. (A roster-IDOR slipped through in Plan 3; do not repeat.)
- **Auth pattern:** services throw `AuthError(status, message)` from `@/lib/auth/errors`; never throw `HttpError`/`Response`. Server actions catch `AuthError` → `{ ok: false, status, message }`, let other errors propagate (→ 500). Reuse `requireHousehold()`/`requireUser()` from `@/lib/auth/session` and `isHouseholdMember()` from `@/lib/auth/scoping`.
- **Decimal:** import `Decimal` and `quantize2` ONLY from `@/lib/domain/decimal`, never `decimal.js` directly. A quantity must never touch a JS `number` for arithmetic.
- **Randomness:** inject `Rng` (`@/lib/domain/rng`); tests pass `mulberry32(seed)`. Production default seeds from a fresh random uint32.
- **Domain contract (from Plan 2):** meal-plan callers supply pre-filtered known/try recipe pools + a `fallbackRecipes` set; planned entries are stamped `mealType: "LUNCH"`; validators return `string[]` (empty = valid) → raise `AuthError(422, …)` from a non-empty array; `validateShoppingDays(days)` returns `void` and THROWS a plain `Error` on invalid input (catch → `AuthError(422)`).
- **IDs:** text PKs are UUIDs via `randomUUID()` from `node:crypto` (matches `lib/households/manage.ts`). Integer PKs (`recipe_ingredients`, `ingredients`, `units`, `cooking_steps`, `step_ingredients`) autoincrement.
- **Timestamps:** `created_at`/`updated_at` are Drizzle `{ mode: "timestamp" }` — pass `Date` objects, not strings. `start_date`/`end_date`/`date`/`shopping_date` are `text` `YYYY-MM-DD` strings; use the existing `@/lib/domain/dates` helpers (`addDays`, `weekday`) for date math.
- **DB columns are camelCase in Drizzle** (snake_case in SQLite); always use the Drizzle field names.
- **i18n:** server components/pages use `getI18n()` from `@/lib/i18n/server`; client islands use `useT()` from `@/lib/i18n/provider`. Add any NEW UI strings to BOTH `web/lib/i18n/dictionaries/en.json` and `de.json` (verify the actual filenames in Step-1 of the first task that adds keys).
- **Cache invalidation:** after a successful mutation, call `revalidatePath()` for every affected route (e.g. `/recipes`, `/recipes/[id]`, `/plan`, `/shopping`). `revalidatePath` is not yet used anywhere in `web/` — this plan introduces it.
- **Out of scope (do NOT build):** AI recipe generation, image upload/generate/delete, `bulk-create` (all → Plan 7); the full recipe create/edit editor (→ Plan 6b); offline shopping sync (Workbox SW/IndexedDB) — toggles are online-only here.
- **Verification gates:** `npm run typecheck` (tsc clean), `npm run test` (all Vitest green), `npm run build` (Next build OK). There is NO eslint in `web/`.

---

## File Structure

**New service modules (framework-free, TDD'd):**
- `web/lib/actions/result.ts` — shared `Result<T>` type + `fail()` + `withHousehold()` helper.
- `web/lib/shopping/items.ts` — `toggleShoppingItem`, `setShoppingItemsChecked`.
- `web/lib/shopping/generate.ts` — `generateShoppingListsForIteration`.
- `web/lib/recipes/mutations.ts` — `moveRecipe`, `deleteRecipe`.
- `web/lib/meal-plan/setup.ts` — `loadSelectablePools`, `populateIteration`, `setupMealPlan`.
- `web/lib/meal-plan/iterations.ts` — `renewIteration`, `generateNextIteration`.
- `web/lib/schemas/mutations.ts` — Zod input schemas (shopping bulk-toggle, setup-plan).

**New server actions:** `web/app/(app)/actions.ts`.

**New client islands:**
- `web/components/shopping/shopping-actions.tsx` — checkbox toggle + "uncheck all".
- `web/components/recipes/recipe-detail-actions.tsx` — Edit(link)/Cook(link)/Share/Move/Delete row.
- `web/components/recipes/recipe-card-delete.tsx` — per-card delete button.
- `web/components/plan/generate-plan-drawer.tsx` — generate/setup config dialog.
- `web/components/plan/iteration-actions.tsx` — Renew / Next-iteration buttons.
- `web/components/recipes/export-recipe-dialog.tsx` — share/export overlay.

**New routes:** `web/app/(app)/cook/[id]/page.tsx` (RSC loader) + `web/components/cooking/cooking-view.tsx` (client).

**Modified pages/components:** `shopping/page.tsx`, `shopping-category.tsx`, `plan/page.tsx`, `iteration-card.tsx`, `recipe-detail.tsx`, `recipe-card.tsx`, the two `[id]` pages.

---

## Task 1: Shared action-result helper

**Files:**
- Create: `web/lib/actions/result.ts`
- Test: `web/lib/actions/result.test.ts`

**Interfaces:**
- Produces: `type Result<T = undefined> = { ok: true; data: T } | { ok: false; status: number; message: string }`; `fail(e: unknown): Result<never>`; `async function withHousehold<T>(fn: (ctx: { db: Db; householdId: string; user: User; now: Date }) => Promise<T> | T): Promise<Result<T>>`.
- Consumes: `AuthError` (`@/lib/auth/errors`), `requireHousehold` (`@/lib/auth/session`), `db` (`@/lib/db`), `User` (`@/lib/auth/session-store`).

Rationale: Plan 5 carry-forward asked for ONE shared `AuthError→Result` helper instead of repeating the `(account)/actions.ts` `run()` boilerplate per action. `withHousehold` additionally injects `householdId` + `now` so every mutation gets scoping for free.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/actions/result.test.ts
import { describe, expect, it } from "vitest";
import { fail } from "./result";
import { AuthError } from "@/lib/auth/errors";

describe("fail", () => {
  it("maps AuthError to an error Result", () => {
    expect(fail(new AuthError(422, "bad"))).toEqual({ ok: false, status: 422, message: "bad" });
  });

  it("rethrows non-AuthError", () => {
    expect(() => fail(new Error("boom"))).toThrow("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/actions/result.test.ts`
Expected: FAIL — cannot find module `./result`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/actions/result.ts
import { AuthError } from "@/lib/auth/errors";
import { requireHousehold } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { Db } from "@/lib/db";
import type { User } from "@/lib/auth/session-store";

export type Result<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export function fail(e: unknown): Result<never> {
  if (e instanceof AuthError) return { ok: false, status: e.status, message: e.message };
  throw e;
}

/** Runs `fn` inside a household-scoped, error-translated context for a server action. */
export async function withHousehold<T>(
  fn: (ctx: { db: Db; householdId: string; user: User; now: Date }) => Promise<T> | T,
): Promise<Result<T>> {
  try {
    const { user, householdId } = await requireHousehold();
    return { ok: true, data: await fn({ db, householdId, user, now: new Date() }) };
  } catch (e) {
    return fail(e);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/actions/result.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/actions/result.ts web/lib/actions/result.test.ts
git commit -m "feat(web): shared server-action Result helper + withHousehold"
```

---

## Task 2: Shopping item mutation service

**Files:**
- Create: `web/lib/shopping/items.ts`
- Test: `web/lib/shopping/items.test.ts`

**Interfaces:**
- Produces:
  - `function toggleShoppingItem(db: Db, householdId: string, itemId: string): boolean` — flips `is_checked` of one item IFF it belongs to the household; returns the new checked state; throws `AuthError(404, "Item not found")` if missing/cross-tenant.
  - `function setShoppingItemsChecked(db: Db, householdId: string, itemIds: string[], isChecked: boolean): number` — bulk-sets `is_checked` for the household-owned subset of `itemIds`; returns the count updated.
- Consumes: schema tables `shoppingListItems`, `shoppingLists`, `planIterations`, `mealPlans`; `AuthError`.

Scoping path: `shopping_list_items.shopping_list_id → shopping_lists.iteration_id → plan_iterations.meal_plan_id → meal_plans.household_id`.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/shopping/items.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households, mealPlans, planIterations, shoppingLists, shoppingListItems, ingredients, units,
} from "@/lib/db/schema";
import { toggleShoppingItem, setShoppingItemsChecked } from "./items";
import { AuthError } from "@/lib/auth/errors";

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
    { id: "mp1", householdId: "h1", shoppingDay1: 5, servings: 2, knownRatio: "0.7", defaultLeftoverDays: 1, createdAt: now },
    { id: "mp2", householdId: "h2", shoppingDay1: 5, servings: 2, knownRatio: "0.7", defaultLeftoverDays: 1, createdAt: now },
  ]).run();
  db.insert(planIterations).values([
    { id: "it1", mealPlanId: "mp1", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now },
    { id: "it2", mealPlanId: "mp2", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now },
  ]).run();
  db.insert(shoppingLists).values([
    { id: "sl1", iterationId: "it1", shoppingDate: "2026-06-22", createdAt: now },
    { id: "sl2", iterationId: "it2", shoppingDate: "2026-06-22", createdAt: now },
  ]).run();
  db.insert(shoppingListItems).values([
    { id: "i1", shoppingListId: "sl1", ingredientId: 1, quantity: "200", unitId: 1, isChecked: false },
    { id: "i2", shoppingListId: "sl1", ingredientId: 1, quantity: "100", unitId: 1, isChecked: true },
    { id: "iX", shoppingListId: "sl2", ingredientId: 1, quantity: "50", unitId: 1, isChecked: false }, // other household
  ]).run();
  return db;
}

describe("toggleShoppingItem", () => {
  it("flips checked state for an owned item", () => {
    const db = seed();
    expect(toggleShoppingItem(db, "h1", "i1")).toBe(true);
    expect(toggleShoppingItem(db, "h1", "i1")).toBe(false);
  });
  it("refuses a cross-household item", () => {
    const db = seed();
    expect(() => toggleShoppingItem(db, "h1", "iX")).toThrow(AuthError);
  });
});

describe("setShoppingItemsChecked", () => {
  it("bulk-unchecks only owned items and ignores foreign ids", () => {
    const db = seed();
    const n = setShoppingItemsChecked(db, "h1", ["i1", "i2", "iX"], false);
    expect(n).toBe(2);
    const rows = db.select().from(shoppingListItems).all();
    expect(rows.find((r) => r.id === "i2")!.isChecked).toBe(false);
    expect(rows.find((r) => r.id === "iX")!.isChecked).toBe(false); // untouched (was already false)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/shopping/items.test.ts`
Expected: FAIL — cannot find module `./items`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/shopping/items.ts
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { shoppingListItems, shoppingLists, planIterations, mealPlans } from "@/lib/db/schema";

/** Returns the set of item ids (from `candidateIds`) that belong to `householdId`. */
function ownedItemIds(db: Db, householdId: string, candidateIds: string[]): Set<string> {
  if (candidateIds.length === 0) return new Set();
  const rows = db
    .select({ id: shoppingListItems.id })
    .from(shoppingListItems)
    .innerJoin(shoppingLists, eq(shoppingListItems.shoppingListId, shoppingLists.id))
    .innerJoin(planIterations, eq(shoppingLists.iterationId, planIterations.id))
    .innerJoin(mealPlans, eq(planIterations.mealPlanId, mealPlans.id))
    .where(and(inArray(shoppingListItems.id, candidateIds), eq(mealPlans.householdId, householdId)))
    .all();
  return new Set(rows.map((r) => r.id));
}

export function toggleShoppingItem(db: Db, householdId: string, itemId: string): boolean {
  if (!ownedItemIds(db, householdId, [itemId]).has(itemId)) {
    throw new AuthError(404, "Item not found");
  }
  const current = db
    .select({ isChecked: shoppingListItems.isChecked })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.id, itemId))
    .get();
  const next = !current!.isChecked;
  db.update(shoppingListItems).set({ isChecked: next }).where(eq(shoppingListItems.id, itemId)).run();
  return next;
}

export function setShoppingItemsChecked(
  db: Db,
  householdId: string,
  itemIds: string[],
  isChecked: boolean,
): number {
  const owned = [...ownedItemIds(db, householdId, itemIds)];
  if (owned.length === 0) return 0;
  db.update(shoppingListItems)
    .set({ isChecked })
    .where(inArray(shoppingListItems.id, owned))
    .run();
  return owned.length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/shopping/items.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/shopping/items.ts web/lib/shopping/items.test.ts
git commit -m "feat(web): household-scoped shopping toggle/bulk-set service (TDD)"
```

---

## Task 2 dependency note: read it before Task 3

**Verify the i18n dictionary filenames.** Before adding keys in Tasks 3/5/9/10/11, run `ls web/lib/i18n/dictionaries/` (or wherever en/de JSON live — Plan 4 created them). The keys `shopping.uncheckAll`, `plan.setup`, `plan.renew`, `common.edit`, `cooking.start`, `export.share`, `recipes.moveToTry`, `recipes.moveToKnown`, `common.delete` ALREADY exist (the placeholders render them). Only add genuinely new strings, in both files, under the same nesting.

---

## Task 3: Shopping server actions + wire the UI

**Files:**
- Create: `web/lib/schemas/mutations.ts`
- Create: `web/app/(app)/actions.ts`
- Create: `web/components/shopping/shopping-actions.tsx`
- Modify: `web/components/shopping/shopping-category.tsx`
- Modify: `web/app/(app)/shopping/page.tsx`
- Modify (add keys): `web/lib/i18n/dictionaries/en.json`, `de.json`

**Interfaces:**
- Produces (actions): `toggleShoppingItemAction(itemId: string): Promise<Result<boolean>>`; `uncheckAllShoppingAction(itemIds: string[]): Promise<Result<number>>`.
- Consumes: `withHousehold`, `Result` (Task 1); `toggleShoppingItem`, `setShoppingItemsChecked` (Task 2); `bulkToggleSchema` (this task).

- [ ] **Step 1: Create the Zod schema file**

```typescript
// web/lib/schemas/mutations.ts
import { z } from "zod";

export const bulkToggleSchema = z.object({
  itemIds: z.array(z.string().uuid()),
  isChecked: z.boolean(),
});
export type BulkToggleInput = z.infer<typeof bulkToggleSchema>;
```

- [ ] **Step 2: Create the actions file (shopping actions only for now)**

```typescript
// web/app/(app)/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { withHousehold, type Result } from "@/lib/actions/result";
import { toggleShoppingItem, setShoppingItemsChecked } from "@/lib/shopping/items";

export async function toggleShoppingItemAction(itemId: string): Promise<Result<boolean>> {
  const res = await withHousehold(({ db, householdId }) =>
    toggleShoppingItem(db, householdId, itemId),
  );
  if (res.ok) revalidatePath("/shopping");
  return res;
}

export async function uncheckAllShoppingAction(itemIds: string[]): Promise<Result<number>> {
  const res = await withHousehold(({ db, householdId }) =>
    setShoppingItemsChecked(db, householdId, itemIds, false),
  );
  if (res.ok) revalidatePath("/shopping");
  return res;
}
```

- [ ] **Step 3: Make the shopping-category checkbox interactive**

Replace the disabled `<input>` (lines 53–61) in `web/components/shopping/shopping-category.tsx`. Use `useTransition` + optimistic UI; on error show a `sonner` toast and rely on `revalidatePath` to resync. Full new file:

```tsx
// web/components/shopping/shopping-category.tsx
"use client";

import { useState, useMemo, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { formatQuantity } from "@/lib/display/format";
import { toast } from "@/components/ui/sonner";
import { toggleShoppingItemAction } from "@/app/(app)/actions";
import type { ShoppingItemDto } from "@/lib/queries/shopping";

interface ShoppingCategoryProps {
  category: string;
  items: ShoppingItemDto[];
}

export function ShoppingCategory({ category, items }: ShoppingCategoryProps) {
  const { t } = useT();
  const [isOpen, setIsOpen] = useState(true);
  const [, startTransition] = useTransition();
  // Optimistic overrides keyed by item id.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const checkedOf = (item: ShoppingItemDto) => optimistic[item.id] ?? item.isChecked;

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const ac = optimistic[a.id] ?? a.isChecked;
      const bc = optimistic[b.id] ?? b.isChecked;
      if (ac === bc) return 0;
      return ac ? 1 : -1;
    });
  }, [items, optimistic]);

  const checkedCount = items.filter((item) => checkedOf(item)).length;

  function onToggle(item: ShoppingItemDto) {
    const next = !checkedOf(item);
    setOptimistic((o) => ({ ...o, [item.id]: next }));
    startTransition(async () => {
      const res = await toggleShoppingItemAction(item.id);
      if (!res.ok) {
        setOptimistic((o) => ({ ...o, [item.id]: !next })); // revert
        toast.error(t("common.errorRetry"));
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`}
          />
          <h3 className="text-sm font-semibold text-foreground">
            {t(`shopping.categories.${category}`)}
          </h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {t("shopping.itemCount", { checked: checkedCount, total: items.length })}
        </span>
      </button>

      {isOpen && (
        <div className="divide-y divide-border border-t border-border">
          {sortedItems.map((item) => {
            const checked = checkedOf(item);
            return (
              <label key={item.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(item)}
                  className="h-4 w-4 rounded"
                  aria-label={item.ingredientName}
                />
                <span
                  className={`flex-1 text-sm ${checked ? "text-muted-foreground line-through" : "text-foreground"}`}
                >
                  {formatQuantity(item.quantity)} {item.unitAbbreviation} {item.ingredientName}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create the "uncheck all" client island**

```tsx
// web/components/shopping/shopping-actions.tsx
"use client";

import { useTransition } from "react";
import { useT } from "@/lib/i18n/provider";
import { toast } from "@/components/ui/sonner";
import { uncheckAllShoppingAction } from "@/app/(app)/actions";

export function UncheckAllButton({ itemIds }: { itemIds: string[] }) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending || itemIds.length === 0}
      onClick={() =>
        startTransition(async () => {
          const res = await uncheckAllShoppingAction(itemIds);
          if (!res.ok) toast.error(t("common.errorRetry"));
        })
      }
      className="text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
    >
      {t("shopping.uncheckAll")}
    </button>
  );
}
```

- [ ] **Step 5: Wire the island into the shopping page**

In `web/app/(app)/shopping/page.tsx`: import `UncheckAllButton` from `@/components/shopping/shopping-actions`, then replace the disabled `<button>` block (lines 68–75) with the island, passing the ids of currently-checked items:

```tsx
{/* replaces the TODO(plan-6) disabled button */}
<UncheckAllButton itemIds={list.items.filter((i) => i.isChecked).map((i) => i.id)} />
```

(The page already imports `ShoppingItemDto`; no other change.)

- [ ] **Step 6: Add the `common.errorRetry` i18n key**

Add to `en.json` (under `common`): `"errorRetry": "Something went wrong. Please try again."` and to `de.json`: `"errorRetry": "Etwas ist schiefgelaufen. Bitte erneut versuchen."`. (If a `common.error` already exists you may reuse it — verify; this plan assumes a retry-flavored message is wanted.)

- [ ] **Step 7: Typecheck, test, and manually verify**

Run: `cd web && npm run typecheck && npm run test`
Expected: tsc clean; all Vitest pass.

- [ ] **Step 8: Commit**

```bash
git add web/lib/schemas/mutations.ts web/app/\(app\)/actions.ts \
  web/components/shopping/shopping-actions.tsx web/components/shopping/shopping-category.tsx \
  web/app/\(app\)/shopping/page.tsx web/lib/i18n/dictionaries/en.json web/lib/i18n/dictionaries/de.json
git commit -m "feat(web): wire shopping toggle + uncheck-all server actions"
```

---

## Task 4: Recipe move/delete service

**Files:**
- Create: `web/lib/recipes/mutations.ts`
- Test: `web/lib/recipes/mutations.test.ts`

**Interfaces:**
- Produces:
  - `function moveRecipe(db: Db, householdId: string, recipeId: string, now: Date): "KNOWN" | "TO_TRY"` — toggles `list_type`, bumps `updated_at`; returns the new list type; throws `AuthError(404)` if missing/cross-tenant.
  - `function deleteRecipe(db: Db, householdId: string, recipeId: string): void` — deletes the recipe (cascade removes ingredients/steps/tags via FK `onDelete: "cascade"`); throws `AuthError(404)` if missing/cross-tenant.
- Consumes: schema `recipes`; `AuthError`.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/recipes/mutations.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { households, recipes } from "@/lib/db/schema";
import { moveRecipe, deleteRecipe } from "./mutations";
import { AuthError } from "@/lib/auth/errors";
import { eq } from "drizzle-orm";

const now = new Date("2026-06-27T12:00:00Z");

function seed() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
  db.insert(recipes).values([
    { id: "r1", householdId: "h1", title: "Pasta", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
    { id: "rX", householdId: "h2", title: "Secret", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
  ]).run();
  return db;
}

describe("moveRecipe", () => {
  it("toggles KNOWN -> TO_TRY -> KNOWN", () => {
    const db = seed();
    expect(moveRecipe(db, "h1", "r1", now)).toBe("TO_TRY");
    expect(moveRecipe(db, "h1", "r1", now)).toBe("KNOWN");
  });
  it("refuses a cross-household recipe", () => {
    const db = seed();
    expect(() => moveRecipe(db, "h1", "rX", now)).toThrow(AuthError);
  });
});

describe("deleteRecipe", () => {
  it("deletes an owned recipe", () => {
    const db = seed();
    deleteRecipe(db, "h1", "r1");
    expect(db.select().from(recipes).where(eq(recipes.id, "r1")).get()).toBeUndefined();
  });
  it("refuses a cross-household recipe", () => {
    const db = seed();
    expect(() => deleteRecipe(db, "h1", "rX")).toThrow(AuthError);
    expect(db.select().from(recipes).where(eq(recipes.id, "rX")).get()).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/recipes/mutations.test.ts`
Expected: FAIL — cannot find module `./mutations`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/recipes/mutations.ts
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { recipes } from "@/lib/db/schema";

function ownedRecipe(db: Db, householdId: string, recipeId: string) {
  const row = db
    .select({ id: recipes.id, listType: recipes.listType })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
    .get();
  if (!row) throw new AuthError(404, "Recipe not found");
  return row;
}

export function moveRecipe(
  db: Db,
  householdId: string,
  recipeId: string,
  now: Date,
): "KNOWN" | "TO_TRY" {
  const row = ownedRecipe(db, householdId, recipeId);
  const next = row.listType === "KNOWN" ? "TO_TRY" : "KNOWN";
  db.update(recipes).set({ listType: next, updatedAt: now }).where(eq(recipes.id, recipeId)).run();
  return next;
}

export function deleteRecipe(db: Db, householdId: string, recipeId: string): void {
  ownedRecipe(db, householdId, recipeId);
  db.delete(recipes).where(eq(recipes.id, recipeId)).run();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/recipes/mutations.test.ts`
Expected: PASS (4 tests).

**Note on cascade:** the test relies on FK `onDelete: "cascade"` for child rows. `createTestDb()` sets `foreign_keys = ON`, so cascades fire. If a future test seeds ingredients/steps, assert they're gone too.

- [ ] **Step 5: Commit**

```bash
git add web/lib/recipes/mutations.ts web/lib/recipes/mutations.test.ts
git commit -m "feat(web): household-scoped recipe move/delete service (TDD)"
```

---

## Task 5: Recipe move/delete actions + UI islands

**Files:**
- Modify: `web/app/(app)/actions.ts` (append recipe actions)
- Create: `web/components/recipes/recipe-detail-actions.tsx`
- Create: `web/components/recipes/recipe-card-delete.tsx`
- Modify: `web/components/recipes/recipe-detail.tsx`
- Modify: `web/components/recipes/recipe-card.tsx`
- Modify (if needed): `web/app/(app)/recipes/[id]/page.tsx`, `web/app/(app)/recipes/page.tsx`

**Interfaces:**
- Produces (actions): `moveRecipeAction(recipeId: string): Promise<Result<"KNOWN" | "TO_TRY">>`; `deleteRecipeAction(recipeId: string): Promise<Result<undefined>>`.
- Consumes: `moveRecipe`, `deleteRecipe` (Task 4); `withHousehold` (Task 1).

**Boundary constraint:** `recipe-detail.tsx` and `recipe-card.tsx` are SERVER components that receive `t`/`locale` as props. Interactive buttons must live in `"use client"` islands that call `useT()` themselves — do NOT pass `t` into the island.

- [ ] **Step 1: Append recipe actions to `web/app/(app)/actions.ts`**

```typescript
import { redirect } from "next/navigation";
import { moveRecipe, deleteRecipe } from "@/lib/recipes/mutations";

export async function moveRecipeAction(recipeId: string): Promise<Result<"KNOWN" | "TO_TRY">> {
  const res = await withHousehold(({ db, householdId, now }) =>
    moveRecipe(db, householdId, recipeId, now),
  );
  if (res.ok) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
  }
  return res;
}

export async function deleteRecipeAction(recipeId: string): Promise<Result<undefined>> {
  const res = await withHousehold(({ db, householdId }) => {
    deleteRecipe(db, householdId, recipeId);
  });
  if (res.ok) revalidatePath("/recipes");
  return res;
}
```

(Keep the existing `revalidatePath`/`withHousehold` imports at the top; merge, don't duplicate.)

- [ ] **Step 2: Create the recipe-detail actions island**

The Edit and Cook buttons are LINKS (Edit → `/recipes/${id}/edit` which is Plan 6b — link is fine, the page will 404 until 6b; render it but point at the route). Cook → `/cook/${id}` (built in Task 10). Share opens the export dialog (Task 11 — for now render a button that we wire in Task 11; to avoid a forward dependency, this task renders Share as a disabled button and Task 11 replaces it). Move + Delete call actions.

```tsx
// web/components/recipes/recipe-detail-actions.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Edit, UtensilsCrossed, Share2, ArrowRightLeft, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { moveRecipeAction, deleteRecipeAction } from "@/app/(app)/actions";

interface Props {
  recipeId: string;
  listType: string;
  /** Replaced with a real handler in Task 11; until then Share is hidden. */
  onShare?: () => void;
}

export function RecipeDetailActions({ recipeId, listType, onShare }: Props) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onMove() {
    startTransition(async () => {
      const res = await moveRecipeAction(recipeId);
      if (res.ok) router.refresh();
      else toast.error(t("common.errorRetry"));
    });
  }

  function onDelete() {
    if (!confirm(t("recipes.confirmDelete"))) return;
    startTransition(async () => {
      const res = await deleteRecipeAction(recipeId);
      if (res.ok) {
        toast.success(t("recipes.deleted"));
        router.push("/recipes");
      } else {
        toast.error(t("common.errorRetry"));
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2 border-t pt-4">
      <Button variant="default" asChild>
        <Link href={`/recipes/${recipeId}/edit`}>
          <Edit size={16} />
          {t("common.edit")}
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href={`/cook/${recipeId}`}>
          <UtensilsCrossed size={16} />
          {t("cooking.start")}
        </Link>
      </Button>
      {onShare && (
        <Button variant="outline" onClick={onShare}>
          <Share2 size={16} />
          {t("export.share")}
        </Button>
      )}
      <Button variant="outline" disabled={pending} onClick={onMove}>
        <ArrowRightLeft size={16} />
        {listType === "KNOWN" ? t("recipes.moveToTry") : t("recipes.moveToKnown")}
      </Button>
      <Button variant="outline" disabled={pending} onClick={onDelete} className="text-destructive">
        <Trash2 size={16} />
        {t("common.delete")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Use the island in `recipe-detail.tsx`**

Remove the unused `Edit/UtensilsCrossed/Share2/ArrowRightLeft/Trash2` and `Button` imports if they become unused, import `RecipeDetailActions`, and replace the entire `{/* Action buttons … */}` `<div>` block at the bottom with:

```tsx
<RecipeDetailActions recipeId={recipe.id} listType={recipe.listType} />
```

(Leave `onShare` unset for now — Task 11 wires it. Keep `BookOpen` import; it's used for the image placeholder.)

- [ ] **Step 4: Create the recipe-card delete island**

```tsx
// web/components/recipes/recipe-card-delete.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { deleteRecipeAction } from "@/app/(app)/actions";

export function RecipeCardDelete({ recipeId, title }: { recipeId: string; title: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      className="ml-3 shrink-0 text-red-600 hover:bg-red-50"
      aria-label={`${t("common.delete")} ${title}`}
      onClick={() => {
        if (!confirm(t("recipes.confirmDelete"))) return;
        startTransition(async () => {
          const res = await deleteRecipeAction(recipeId);
          if (res.ok) {
            toast.success(t("recipes.deleted"));
            router.refresh();
          } else {
            toast.error(t("common.errorRetry"));
          }
        });
      }}
    >
      <Trash2 size={18} />
    </Button>
  );
}
```

- [ ] **Step 5: Use the delete island in `recipe-card.tsx`**

Replace the disabled `<Button>` delete block at the bottom with `<RecipeCardDelete recipeId={recipe.id} title={recipe.title} />`; import it; drop now-unused `Button`/`Trash2` imports if unused.

- [ ] **Step 6: Add i18n keys**

Add to both dictionaries: `recipes.confirmDelete` (en: `"Delete this recipe? This cannot be undone."`, de: `"Dieses Rezept löschen? Das kann nicht rückgängig gemacht werden."`) and `recipes.deleted` (en: `"Recipe deleted."`, de: `"Rezept gelöscht."`).

- [ ] **Step 7: Typecheck + test + build**

Run: `cd web && npm run typecheck && npm run test && npm run build`
Expected: tsc clean; Vitest green; build OK (the `/recipes/[id]/edit` link target 404s until Plan 6b — acceptable, note it).

- [ ] **Step 8: Commit**

```bash
git add web/app/\(app\)/actions.ts web/components/recipes/recipe-detail-actions.tsx \
  web/components/recipes/recipe-card-delete.tsx web/components/recipes/recipe-detail.tsx \
  web/components/recipes/recipe-card.tsx web/lib/i18n/dictionaries/en.json web/lib/i18n/dictionaries/de.json
git commit -m "feat(web): wire recipe move/delete server actions + islands"
```

---

## Task 6: Shopping-list generation service

**Files:**
- Create: `web/lib/shopping/generate.ts`
- Test: `web/lib/shopping/generate.test.ts`

**Interfaces:**
- Produces: `function generateShoppingListsForIteration(db: Db, opts: { iterationId: string; startDate: string; endDate: string; shoppingDays: number[]; servings: number }): void` — deletes existing shopping lists for the iteration, then for each shopping segment (`computeShoppingSegments`) aggregates the non-leftover entries' ingredients (scaled to `servings`, converted to base unit), and inserts one `shopping_lists` row + its `shopping_list_items`.
- Consumes: domain `computeShoppingSegments` (`@/lib/domain/meal-plan/iteration-dates`), `aggregateShoppingItems`, `ShoppingEntry`, `DomainUnit` (`@/lib/domain/shopping/aggregate` + `units`); schema `mealPlanEntries`, `recipes`, `recipeIngredients`, `units`, `shoppingLists`, `shoppingListItems`; `randomUUID`.

Mirrors Django `generate_shopping_lists_for_iteration` (`backend/shopping/services.py`). Each `ShoppingEntry` carries `servings` (the plan servings), `defaultServings` (the recipe's), `isLeftover`, and the entry-recipe ingredient list. `aggregateShoppingItems` returns `{ ingredientId, unitId, quantity: Decimal }[]`; persist `quantity.toString()`.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/shopping/generate.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households, recipes, recipeIngredients, ingredients, units,
  mealPlans, planIterations, mealPlanEntries, shoppingLists, shoppingListItems,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateShoppingListsForIteration } from "./generate";

const now = new Date("2026-06-27T12:00:00Z");

function seed() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(ingredients).values([
    { id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" },
    { id: 2, nameEn: "Pasta", nameDe: "Nudeln", category: "PANTRY" },
  ]).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
  db.insert(recipes).values({ id: "r1", householdId: "h1", title: "Pasta", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now }).run();
  db.insert(recipeIngredients).values([
    { recipeId: "r1", ingredientId: 1, quantity: "200", unitId: 1, order: 0 },
    { recipeId: "r1", ingredientId: 2, quantity: "150", unitId: 1, order: 1 },
  ]).run();
  db.insert(mealPlans).values({ id: "mp1", householdId: "h1", shoppingDay1: 1, servings: 4, knownRatio: "0.7", defaultLeftoverDays: 1, createdAt: now }).run();
  db.insert(planIterations).values({ id: "it1", mealPlanId: "mp1", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now }).run();
  // Monday 2026-06-22 is weekday 1. One real lunch + one leftover (excluded from aggregation).
  db.insert(mealPlanEntries).values([
    { id: "e1", iterationId: "it1", date: "2026-06-22", mealType: "LUNCH", recipeId: "r1", servings: 4, isLeftover: false, isLocked: false },
    { id: "e2", iterationId: "it1", date: "2026-06-23", mealType: "LUNCH", recipeId: "r1", servings: 4, isLeftover: true, sourceEntryId: "e1", isLocked: false },
  ]).run();
  return db;
}

describe("generateShoppingListsForIteration", () => {
  it("aggregates non-leftover ingredients scaled to plan servings", () => {
    const db = seed();
    generateShoppingListsForIteration(db, {
      iterationId: "it1", startDate: "2026-06-22", endDate: "2026-06-28", shoppingDays: [1], servings: 4,
    });
    const lists = db.select().from(shoppingLists).where(eq(shoppingLists.iterationId, "it1")).all();
    expect(lists.length).toBe(1);
    const items = db.select().from(shoppingListItems).where(eq(shoppingListItems.shoppingListId, lists[0].id)).all();
    // 200g & 150g scaled by 4/2 = 400 & 300; leftover entry contributes nothing.
    const byIng = Object.fromEntries(items.map((i) => [i.ingredientId, i.quantity]));
    expect(byIng[1]).toBe("400");
    expect(byIng[2]).toBe("300");
  });

  it("replaces existing lists on re-run (idempotent)", () => {
    const db = seed();
    const opts = { iterationId: "it1", startDate: "2026-06-22", endDate: "2026-06-28", shoppingDays: [1], servings: 4 } as const;
    generateShoppingListsForIteration(db, opts);
    generateShoppingListsForIteration(db, opts);
    expect(db.select().from(shoppingLists).where(eq(shoppingLists.iterationId, "it1")).all().length).toBe(1);
  });
}
```

> The exact string form of quantities (`"400"` vs `"400.00"`) depends on `aggregateShoppingItems`/`quantize2`. If the assertion fails on formatting, adjust the expected strings to match the domain output — do NOT reformat in the service; persist `quantity.toString()` verbatim. Discover the real form from the first test run.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/shopping/generate.test.ts`
Expected: FAIL — cannot find module `./generate`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// web/lib/shopping/generate.ts
import { randomUUID } from "node:crypto";
import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { computeShoppingSegments } from "@/lib/domain/meal-plan/iteration-dates";
import { aggregateShoppingItems, type ShoppingEntry } from "@/lib/domain/shopping/aggregate";
import type { DomainUnit } from "@/lib/domain/shopping/units";
import {
  mealPlanEntries, recipes, recipeIngredients, units, shoppingLists, shoppingListItems,
} from "@/lib/db/schema";

interface GenerateOpts {
  iterationId: string;
  startDate: string;
  endDate: string;
  shoppingDays: number[];
  servings: number;
}

export function generateShoppingListsForIteration(db: Db, opts: GenerateOpts): void {
  const { iterationId, startDate, endDate, shoppingDays, servings } = opts;

  // Wipe existing lists (items cascade via FK).
  db.delete(shoppingLists).where(eq(shoppingLists.iterationId, iterationId)).run();

  // Preload all units once → DomainUnit map for conversion.
  const unitRows = db.select().from(units).all();
  const unitMap = new Map<number, DomainUnit>(
    unitRows.map((u) => [u.id, { id: u.id, baseUnitId: u.baseUnitId, conversionFactor: u.conversionFactor }]),
  );

  const segments = computeShoppingSegments(startDate, endDate, shoppingDays);
  const createdAt = new Date();

  for (const seg of segments) {
    // Non-leftover lunch entries within the segment date range.
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

    const shoppingEntries: ShoppingEntry[] = entries.map((e) => {
      const ings = db
        .select({ ingredientId: recipeIngredients.ingredientId, quantity: recipeIngredients.quantity, unitId: recipeIngredients.unitId })
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, e.recipeId))
        .all();
      return {
        servings,
        defaultServings: e.defaultServings,
        isLeftover: false,
        ingredients: ings.map((ri) => ({
          ingredientId: ri.ingredientId,
          quantity: ri.quantity,
          unit: unitMap.get(ri.unitId)!,
        })),
      };
    });

    const aggregated = aggregateShoppingItems(shoppingEntries);
    if (aggregated.length === 0) continue;

    const listId = randomUUID();
    db.insert(shoppingLists).values({
      id: listId, iterationId, shoppingDate: seg.shoppingDate, createdAt,
    }).run();
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
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/shopping/generate.test.ts`
Expected: PASS (adjust quantity-string expectations to the real domain output if needed, per the Step-1 note).

- [ ] **Step 5: Commit**

```bash
git add web/lib/shopping/generate.ts web/lib/shopping/generate.test.ts
git commit -m "feat(web): shopping-list generation service for an iteration (TDD)"
```

---

## Task 7: Meal-plan setup service (pools + populate + setup)

**Files:**
- Create: `web/lib/meal-plan/setup.ts`
- Test: `web/lib/meal-plan/setup.test.ts`

**Interfaces:**
- Produces:
  - `interface SetupPlanInput { iterationWeeks: number; shoppingDays: number[]; servings: number; knownRatio: number; defaultLeftoverDays: number; excludedTagIds: string[] }`
  - `function loadSelectablePools(db: Db, householdId: string, excludedTagIds: string[]): { known: PoolRecipe[]; tryList: PoolRecipe[] }` where `interface PoolRecipe { id: string; ingredientIds: number[]; leftoverDays: number | null }` (recipes whose tag set does NOT intersect `excludedTagIds`).
  - `function populateIteration(db: Db, args: { plan: PlanRow; iterationId: string; startDate: string; endDate: string; excludeRecipeIds: Set<string>; rng: Rng }): void` — selects recipes from the pools, schedules LUNCH entries (`assignSchedule`, stamped `mealType: "LUNCH"`), inserts `meal_plan_entries`, then calls `generateShoppingListsForIteration`.
  - `function setupMealPlan(db: Db, householdId: string, input: SetupPlanInput, now: Date, rng?: Rng): { iterationId: string }` — validates shopping days, upserts the single `meal_plans` row, resets `meal_plan_excluded_tags`, deletes all existing iterations, creates one ACTIVE iteration starting `today`, and populates it.
- Consumes: domain `selectRecipes`, `assignSchedule`, `computeIterationDates`, `validateShoppingDays`, `mulberry32`, `Rng`; Task 6 `generateShoppingListsForIteration`; schema `mealPlans`, `mealPlanExcludedTags`, `planIterations`, `mealPlanEntries`, `recipes`, `recipeIngredients`, `recipeTags`; `randomUUID`; `AuthError`.

Mirrors Django `setup_meal_plan` + `_generate_iteration` + `_populate_iteration` (`backend/planner/services.py`). `PlanRow` is the `meal_plans` row (`servings`, `knownRatio` as text → `Number()`, `defaultLeftoverDays`, `shoppingDay1`, `shoppingDay2`, `iterationWeeks`). `shoppingDays` = `[shoppingDay1, shoppingDay2].filter((d) => d != null)`.

Key mapping for the domain contract:
- `selectRecipes({ known, tryList, days, knownRatio, defaultLeftoverDays, excludeIds, rng })` — `known`/`tryList` are `SelectableRecipe[]` (`{ id, ingredientIds }`).
- `assignSchedule({ recipes, fallbackRecipes, startDate, days, servings, defaultLeftoverDays, rng })` — `recipes`/`fallbackRecipes` are `ScheduleRecipe[]` (`{ id, leftoverDays }`); **use the selected recipes as BOTH `recipes` and `fallbackRecipes`** (Django fills gaps by cycling the selected set). The returned `PlannedEntry[]` carries `date,recipeId,servings,isLeftover,sourceDate` — map `sourceDate` to `sourceEntryId` by looking up the entry id created for that date (two-pass: insert all, then patch leftover `sourceEntryId`), OR insert with a date→id map built up-front. Use the up-front map: pre-generate a `randomUUID()` per planned entry keyed by date.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/meal-plan/setup.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households, recipes, recipeIngredients, recipeTags, tags, ingredients, units,
  mealPlans, mealPlanExcludedTags, planIterations, mealPlanEntries, shoppingLists,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mulberry32 } from "@/lib/domain/rng";
import { setupMealPlan, loadSelectablePools } from "./setup";
import { AuthError } from "@/lib/auth/errors";

const now = new Date("2026-06-27T12:00:00Z"); // a Saturday

function seed() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
  db.insert(ingredients).values([
    { id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" },
    { id: 2, nameEn: "Pasta", nameDe: "Nudeln", category: "PANTRY" },
  ]).run();
  db.insert(tags).values({ id: "tEx", householdId: "h1", category: "DIETARY", nameEn: "Spicy", nameDe: "Scharf" }).run();
  // 4 KNOWN + 2 TO_TRY recipes, each with one ingredient.
  const recRows = [
    ...["k1", "k2", "k3", "k4"].map((id) => ({ id, householdId: "h1", title: id, description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now })),
    ...["t1", "t2"].map((id) => ({ id, householdId: "h1", title: id, description: "", listType: "TO_TRY", defaultServings: 2, createdAt: now, updatedAt: now })),
  ];
  db.insert(recipes).values(recRows).run();
  for (const r of recRows) {
    db.insert(recipeIngredients).values({ recipeId: r.id, ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
  }
  db.insert(recipeTags).values({ recipeId: "k4", tagId: "tEx" }).run(); // k4 is excluded when tEx excluded
  return db;
}

describe("loadSelectablePools", () => {
  it("excludes recipes carrying an excluded tag", () => {
    const db = seed();
    const { known } = loadSelectablePools(db, "h1", ["tEx"]);
    expect(known.map((r) => r.id).sort()).toEqual(["k1", "k2", "k3"]);
  });
});

describe("setupMealPlan", () => {
  it("creates the plan, one active iteration, entries, and shopping lists", () => {
    const db = seed();
    const { iterationId } = setupMealPlan(
      db, "h1",
      { iterationWeeks: 1, shoppingDays: [1], servings: 4, knownRatio: 0.7, defaultLeftoverDays: 1, excludedTagIds: [] },
      now, mulberry32(42),
    );
    expect(db.select().from(mealPlans).where(eq(mealPlans.householdId, "h1")).get()).toBeDefined();
    const its = db.select().from(planIterations).all();
    expect(its.length).toBe(1);
    expect(its[0].status).toBe("ACTIVE");
    const entries = db.select().from(mealPlanEntries).where(eq(mealPlanEntries.iterationId, iterationId)).all();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.mealType === "LUNCH")).toBe(true);
    expect(entries.every((e) => e.servings === 4)).toBe(true);
    expect(db.select().from(shoppingLists).where(eq(shoppingLists.iterationId, iterationId)).all().length).toBeGreaterThan(0);
  });

  it("is idempotent: a second setup replaces (one plan, one iteration)", () => {
    const db = seed();
    const input = { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 0.7, defaultLeftoverDays: 1, excludedTagIds: [] };
    setupMealPlan(db, "h1", input, now, mulberry32(1));
    setupMealPlan(db, "h1", input, now, mulberry32(2));
    expect(db.select().from(mealPlans).where(eq(mealPlans.householdId, "h1")).all().length).toBe(1);
    expect(db.select().from(planIterations).all().length).toBe(1);
  });

  it("rejects invalid shopping days with 422", () => {
    const db = seed();
    expect(() =>
      setupMealPlan(db, "h1", { iterationWeeks: 1, shoppingDays: [], servings: 2, knownRatio: 0.7, defaultLeftoverDays: 1, excludedTagIds: [] }, now),
    ).toThrow(AuthError);
  });

  it("persists excluded tags", () => {
    const db = seed();
    setupMealPlan(db, "h1", { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 0.7, defaultLeftoverDays: 1, excludedTagIds: ["tEx"] }, now, mulberry32(1));
    expect(db.select().from(mealPlanExcludedTags).all().map((r) => r.tagId)).toEqual(["tEx"]);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/meal-plan/setup.test.ts`
Expected: FAIL — cannot find module `./setup`.

- [ ] **Step 3: Write the implementation**

```typescript
// web/lib/meal-plan/setup.ts
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { type Rng, mulberry32 } from "@/lib/domain/rng";
import {
  selectRecipes, type SelectableRecipe,
} from "@/lib/domain/meal-plan/selection";
import { assignSchedule, type ScheduleRecipe } from "@/lib/domain/meal-plan/schedule";
import { validateShoppingDays, computeIterationDates } from "@/lib/domain/meal-plan/iteration-dates";
import { generateShoppingListsForIteration } from "@/lib/shopping/generate";
import {
  mealPlans, mealPlanExcludedTags, planIterations, mealPlanEntries,
  recipes, recipeIngredients, recipeTags,
} from "@/lib/db/schema";

export interface SetupPlanInput {
  iterationWeeks: number;
  shoppingDays: number[];
  servings: number;
  knownRatio: number;
  defaultLeftoverDays: number;
  excludedTagIds: string[];
}

export interface PoolRecipe {
  id: string;
  ingredientIds: number[];
  leftoverDays: number | null;
}

type PlanRow = typeof mealPlans.$inferSelect;

export function loadSelectablePools(
  db: Db,
  householdId: string,
  excludedTagIds: string[],
): { known: PoolRecipe[]; tryList: PoolRecipe[] } {
  const recRows = db
    .select({ id: recipes.id, listType: recipes.listType, leftoverDays: recipes.leftoverDays })
    .from(recipes)
    .where(eq(recipes.householdId, householdId))
    .all();

  // recipe -> ingredientIds
  const ingRows = db
    .select({ recipeId: recipeIngredients.recipeId, ingredientId: recipeIngredients.ingredientId })
    .from(recipeIngredients)
    .all();
  const ingByRecipe = new Map<string, number[]>();
  for (const r of ingRows) {
    const arr = ingByRecipe.get(r.recipeId) ?? [];
    arr.push(r.ingredientId);
    ingByRecipe.set(r.recipeId, arr);
  }

  // recipes carrying any excluded tag
  const excluded = new Set<string>();
  if (excludedTagIds.length > 0) {
    const tagRows = db
      .select({ recipeId: recipeTags.recipeId })
      .from(recipeTags)
      .where(inArray(recipeTags.tagId, excludedTagIds))
      .all();
    for (const t of tagRows) excluded.add(t.recipeId);
  }

  const known: PoolRecipe[] = [];
  const tryList: PoolRecipe[] = [];
  for (const r of recRows) {
    if (excluded.has(r.id)) continue;
    const pr: PoolRecipe = { id: r.id, ingredientIds: ingByRecipe.get(r.id) ?? [], leftoverDays: r.leftoverDays };
    if (r.listType === "KNOWN") known.push(pr);
    else if (r.listType === "TO_TRY") tryList.push(pr);
  }
  return { known, tryList };
}

function daysBetween(startDate: string, endDate: string): number {
  // inclusive day count
  const a = new Date(startDate + "T00:00:00Z").getTime();
  const b = new Date(endDate + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export function populateIteration(
  db: Db,
  args: {
    plan: PlanRow;
    iterationId: string;
    startDate: string;
    endDate: string;
    excludeRecipeIds: Set<string>;
    rng: Rng;
  },
): void {
  const { plan, iterationId, startDate, endDate, excludeRecipeIds, rng } = args;
  const days = daysBetween(startDate, endDate);
  const excludedTagIds = db
    .select({ tagId: mealPlanExcludedTags.tagId })
    .from(mealPlanExcludedTags)
    .where(eq(mealPlanExcludedTags.mealPlanId, plan.id))
    .all()
    .map((r) => r.tagId);

  const { known, tryList } = loadSelectablePools(db, plan.householdId, excludedTagIds);

  const selected = selectRecipes({
    known: known.map((r): SelectableRecipe => ({ id: r.id, ingredientIds: r.ingredientIds })),
    tryList: tryList.map((r): SelectableRecipe => ({ id: r.id, ingredientIds: r.ingredientIds })),
    days,
    knownRatio: Number(plan.knownRatio),
    defaultLeftoverDays: plan.defaultLeftoverDays,
    excludeIds: excludeRecipeIds,
    rng,
  });

  // leftoverDays lookup for scheduling
  const leftoverById = new Map<string, number | null>(
    [...known, ...tryList].map((r) => [r.id, r.leftoverDays]),
  );
  const scheduleRecipes: ScheduleRecipe[] = selected.map((r) => ({
    id: r.id,
    leftoverDays: leftoverById.get(r.id) ?? null,
  }));

  const planned = assignSchedule({
    recipes: scheduleRecipes,
    fallbackRecipes: scheduleRecipes, // cycle the selected set to fill gaps (Django parity)
    startDate,
    days,
    servings: plan.servings,
    defaultLeftoverDays: plan.defaultLeftoverDays,
    rng,
  });

  // Pre-assign an id per date so leftover sourceDate -> sourceEntryId resolves in one pass.
  const idByDate = new Map<string, string>();
  for (const p of planned) idByDate.set(p.date, randomUUID());

  if (planned.length > 0) {
    db.insert(mealPlanEntries).values(
      planned.map((p) => ({
        id: idByDate.get(p.date)!,
        iterationId,
        date: p.date,
        mealType: "LUNCH" as const,
        recipeId: p.recipeId,
        servings: p.servings,
        isLeftover: p.isLeftover,
        sourceEntryId: p.sourceDate ? (idByDate.get(p.sourceDate) ?? null) : null,
        isLocked: false,
      })),
    ).run();
  }

  const shoppingDays = [plan.shoppingDay1, plan.shoppingDay2].filter((d): d is number => d != null);
  generateShoppingListsForIteration(db, {
    iterationId, startDate, endDate, shoppingDays, servings: plan.servings,
  });
}

export function setupMealPlan(
  db: Db,
  householdId: string,
  input: SetupPlanInput,
  now: Date,
  rng: Rng = mulberry32((Math.random() * 2 ** 32) >>> 0),
): { iterationId: string } {
  try {
    validateShoppingDays(input.shoppingDays);
  } catch (e) {
    throw new AuthError(422, e instanceof Error ? e.message : "Invalid shopping days");
  }

  const [day1, day2] = input.shoppingDays;
  // Upsert the single per-household plan.
  const existing = db.select().from(mealPlans).where(eq(mealPlans.householdId, householdId)).get();
  const planValues = {
    iterationWeeks: input.iterationWeeks,
    shoppingDay1: day1,
    shoppingDay2: day2 ?? null,
    servings: input.servings,
    knownRatio: String(input.knownRatio),
    defaultLeftoverDays: input.defaultLeftoverDays,
  };
  let planId: string;
  if (existing) {
    planId = existing.id;
    db.update(mealPlans).set(planValues).where(eq(mealPlans.id, planId)).run();
  } else {
    planId = randomUUID();
    db.insert(mealPlans).values({ id: planId, householdId, createdAt: now, ...planValues }).run();
  }

  // Reset excluded tags.
  db.delete(mealPlanExcludedTags).where(eq(mealPlanExcludedTags.mealPlanId, planId)).run();
  if (input.excludedTagIds.length > 0) {
    db.insert(mealPlanExcludedTags).values(
      input.excludedTagIds.map((tagId) => ({ mealPlanId: planId, tagId })),
    ).run();
  }

  // Reset iterations (entries + shopping lists cascade via FK).
  db.delete(planIterations).where(eq(planIterations.mealPlanId, planId)).run();

  const today = now.toISOString().slice(0, 10);
  const { start, end } = computeIterationDates(today, input.iterationWeeks);
  const iterationId = randomUUID();
  db.insert(planIterations).values({
    id: iterationId, mealPlanId: planId, startDate: start, endDate: end, status: "ACTIVE", createdAt: now,
  }).run();

  const plan = db.select().from(mealPlans).where(eq(mealPlans.id, planId)).get()!;
  populateIteration(db, { plan, iterationId, startDate: start, endDate: end, excludeRecipeIds: new Set(), rng });

  return { iterationId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/meal-plan/setup.test.ts`
Expected: PASS. If `assignSchedule`/`selectRecipes` exact arg names differ from the Plan-2 signatures quoted here, fix the call sites to match the real exports (the test will surface mismatches as tsc/runtime errors).

- [ ] **Step 5: Commit**

```bash
git add web/lib/meal-plan/setup.ts web/lib/meal-plan/setup.test.ts
git commit -m "feat(web): meal-plan setup service (pools + populate + setup) (TDD)"
```

---

## Task 8: Renew + next-iteration services

**Files:**
- Create: `web/lib/meal-plan/iterations.ts`
- Test: `web/lib/meal-plan/iterations.test.ts`

**Interfaces:**
- Produces:
  - `function renewIteration(db: Db, householdId: string, iterationId: string, rng?: Rng): void` — re-rolls an iteration: deletes its entries + shopping lists, re-populates over the SAME date window, excluding the recipe ids previously used (non-leftover). Throws `AuthError(404)` if the iteration isn't in the household.
  - `function generateNextIteration(db: Db, householdId: string, now: Date, rng?: Rng): { iterationId: string }` — archives the latest iteration, creates a new ACTIVE one starting the day after the previous `end_date` (or `today` if none), excluding the previous non-leftover recipe ids. Throws `AuthError(404)` if the household has no plan.
- Consumes: Task 7 `populateIteration`; schema `mealPlans`, `planIterations`, `mealPlanEntries`; domain `computeIterationDates`, `addDays` (`@/lib/domain/dates`), `mulberry32`/`Rng`; `AuthError`; `randomUUID`.

Mirrors Django `renew_iteration` and `generate_next_iteration`.

- [ ] **Step 1: Write the failing test**

```typescript
// web/lib/meal-plan/iterations.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households, recipes, recipeIngredients, ingredients, units,
  mealPlans, planIterations, mealPlanEntries,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mulberry32 } from "@/lib/domain/rng";
import { setupMealPlan } from "./setup";
import { renewIteration, generateNextIteration } from "./iterations";
import { AuthError } from "@/lib/auth/errors";

const now = new Date("2026-06-27T12:00:00Z");

function seededPlan() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
  db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
  const rows = ["k1", "k2", "k3", "k4", "k5", "k6"].map((id) => ({ id, householdId: "h1", title: id, description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now }));
  db.insert(recipes).values(rows).run();
  for (const r of rows) db.insert(recipeIngredients).values({ recipeId: r.id, ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
  const { iterationId } = setupMealPlan(db, "h1", { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 0.7, defaultLeftoverDays: 1, excludedTagIds: [] }, now, mulberry32(7));
  return { db, iterationId };
}

describe("renewIteration", () => {
  it("keeps the date window and replaces entries", () => {
    const { db, iterationId } = seededPlan();
    const before = db.select().from(planIterations).where(eq(planIterations.id, iterationId)).get()!;
    renewIteration(db, "h1", iterationId, mulberry32(99));
    const after = db.select().from(planIterations).where(eq(planIterations.id, iterationId)).get()!;
    expect(after.startDate).toBe(before.startDate);
    expect(after.endDate).toBe(before.endDate);
    expect(db.select().from(mealPlanEntries).where(eq(mealPlanEntries.iterationId, iterationId)).all().length).toBeGreaterThan(0);
  });
  it("refuses a cross-household iteration", () => {
    const { db, iterationId } = seededPlan();
    expect(() => renewIteration(db, "h2", iterationId, mulberry32(1))).toThrow(AuthError);
  });
});

describe("generateNextIteration", () => {
  it("archives the current iteration and creates a new active one", () => {
    const { db, iterationId } = seededPlan();
    const { iterationId: next } = generateNextIteration(db, "h1", now, mulberry32(3));
    const old = db.select().from(planIterations).where(eq(planIterations.id, iterationId)).get()!;
    const created = db.select().from(planIterations).where(eq(planIterations.id, next)).get()!;
    expect(old.status).toBe("ARCHIVED");
    expect(created.status).toBe("ACTIVE");
    expect(created.startDate > old.endDate).toBe(true);
  });
  it("throws when the household has no plan", () => {
    const { db } = seededPlan();
    expect(() => generateNextIteration(db, "h2", now, mulberry32(1))).toThrow(AuthError);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/meal-plan/iterations.test.ts`
Expected: FAIL — cannot find module `./iterations`.

- [ ] **Step 3: Write the implementation**

```typescript
// web/lib/meal-plan/iterations.ts
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { type Rng, mulberry32 } from "@/lib/domain/rng";
import { addDays } from "@/lib/domain/dates";
import { computeIterationDates } from "@/lib/domain/meal-plan/iteration-dates";
import { populateIteration } from "./setup";
import { mealPlans, planIterations, mealPlanEntries } from "@/lib/db/schema";

function previousRecipeIds(db: Db, iterationId: string): Set<string> {
  const rows = db
    .select({ recipeId: mealPlanEntries.recipeId })
    .from(mealPlanEntries)
    .where(and(eq(mealPlanEntries.iterationId, iterationId), eq(mealPlanEntries.isLeftover, false)))
    .all();
  return new Set(rows.map((r) => r.recipeId));
}

function ownedIteration(db: Db, householdId: string, iterationId: string) {
  const row = db
    .select({ id: planIterations.id, planId: planIterations.mealPlanId, startDate: planIterations.startDate, endDate: planIterations.endDate })
    .from(planIterations)
    .innerJoin(mealPlans, eq(planIterations.mealPlanId, mealPlans.id))
    .where(and(eq(planIterations.id, iterationId), eq(mealPlans.householdId, householdId)))
    .get();
  if (!row) throw new AuthError(404, "Iteration not found");
  return row;
}

export function renewIteration(
  db: Db,
  householdId: string,
  iterationId: string,
  rng: Rng = mulberry32((Math.random() * 2 ** 32) >>> 0),
): void {
  const it = ownedIteration(db, householdId, iterationId);
  const exclude = previousRecipeIds(db, iterationId);
  // Entries + shopping lists are replaced inside populateIteration (entries deleted here,
  // shopping lists deleted by generateShoppingListsForIteration).
  db.delete(mealPlanEntries).where(eq(mealPlanEntries.iterationId, iterationId)).run();
  const plan = db.select().from(mealPlans).where(eq(mealPlans.id, it.planId)).get()!;
  populateIteration(db, {
    plan, iterationId, startDate: it.startDate, endDate: it.endDate, excludeRecipeIds: exclude, rng,
  });
}

export function generateNextIteration(
  db: Db,
  householdId: string,
  now: Date,
  rng: Rng = mulberry32((Math.random() * 2 ** 32) >>> 0),
): { iterationId: string } {
  const plan = db.select().from(mealPlans).where(eq(mealPlans.householdId, householdId)).get();
  if (!plan) throw new AuthError(404, "No meal plan");

  const prev = db
    .select()
    .from(planIterations)
    .where(eq(planIterations.mealPlanId, plan.id))
    .orderBy(desc(planIterations.startDate))
    .get();

  let nextStart: string;
  if (prev) {
    db.update(planIterations).set({ status: "ARCHIVED" }).where(eq(planIterations.id, prev.id)).run();
    nextStart = addDays(prev.endDate, 1);
  } else {
    nextStart = now.toISOString().slice(0, 10);
  }

  const { start, end } = computeIterationDates(nextStart, plan.iterationWeeks);
  const iterationId = randomUUID();
  db.insert(planIterations).values({
    id: iterationId, mealPlanId: plan.id, startDate: start, endDate: end, status: "ACTIVE", createdAt: now,
  }).run();

  const exclude = prev ? previousRecipeIds(db, prev.id) : new Set<string>();
  populateIteration(db, { plan, iterationId, startDate: start, endDate: end, excludeRecipeIds: exclude, rng });

  return { iterationId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/meal-plan/iterations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/meal-plan/iterations.ts web/lib/meal-plan/iterations.test.ts
git commit -m "feat(web): renew + next-iteration meal-plan services (TDD)"
```

---

## Task 9: Meal-plan actions + generate drawer + iteration buttons

**Files:**
- Modify: `web/lib/schemas/mutations.ts` (add `setupPlanSchema`)
- Modify: `web/app/(app)/actions.ts` (append plan actions)
- Create: `web/components/plan/generate-plan-drawer.tsx`
- Create: `web/components/plan/iteration-actions.tsx`
- Modify: `web/app/(app)/plan/page.tsx`
- Modify: `web/components/plan/iteration-card.tsx`
- Modify (add keys): both dictionaries

**Interfaces:**
- Produces (actions): `setupPlanAction(input: unknown): Promise<Result<{ iterationId: string }>>`; `renewIterationAction(iterationId: string): Promise<Result<undefined>>`; `nextIterationAction(): Promise<Result<{ iterationId: string }>>`.
- Consumes: `setupMealPlan` (Task 7), `renewIteration`/`generateNextIteration` (Task 8), `setupPlanSchema` (this task), `withHousehold`.

- [ ] **Step 1: Add the setup schema**

```typescript
// append to web/lib/schemas/mutations.ts
export const setupPlanSchema = z.object({
  iterationWeeks: z.number().int().min(1).max(3),
  shoppingDays: z.array(z.number().int().min(0).max(6)).min(1).max(2),
  servings: z.number().int().min(1).max(12),
  knownRatio: z.number().min(0).max(1),
  defaultLeftoverDays: z.number().int().min(0).max(3),
  excludedTagIds: z.array(z.string().uuid()).default([]),
});
export type SetupPlanInput = z.infer<typeof setupPlanSchema>;
```

- [ ] **Step 2: Append plan actions to `web/app/(app)/actions.ts`**

```typescript
import { setupMealPlan } from "@/lib/meal-plan/setup";
import { renewIteration, generateNextIteration } from "@/lib/meal-plan/iterations";
import { setupPlanSchema } from "@/lib/schemas/mutations";

export async function setupPlanAction(input: unknown): Promise<Result<{ iterationId: string }>> {
  const parsed = setupPlanSchema.parse(input);
  const res = await withHousehold(({ db, householdId, now }) =>
    setupMealPlan(db, householdId, parsed, now),
  );
  if (res.ok) {
    revalidatePath("/plan");
    revalidatePath("/shopping");
  }
  return res;
}

export async function renewIterationAction(iterationId: string): Promise<Result<undefined>> {
  const res = await withHousehold(({ db, householdId }) => {
    renewIteration(db, householdId, iterationId);
  });
  if (res.ok) {
    revalidatePath("/plan");
    revalidatePath("/shopping");
  }
  return res;
}

export async function nextIterationAction(): Promise<Result<{ iterationId: string }>> {
  const res = await withHousehold(({ db, householdId, now }) =>
    generateNextIteration(db, householdId, now),
  );
  if (res.ok) {
    revalidatePath("/plan");
    revalidatePath("/shopping");
  }
  return res;
}
```

> Note: `setupPlanSchema.parse(input)` runs OUTSIDE `withHousehold`. A `ZodError` here becomes a 500. That matches the existing `(auth)/actions.ts` convention (parse can throw); the drawer validates client-side first via react-hook-form, so a server-side ZodError indicates a bug, not user error. If you prefer graceful handling, move `parse` inside the `withHousehold` callback and convert `ZodError` to `AuthError(422)` — optional.

- [ ] **Step 3: Build the generate-plan drawer**

The drawer needs the household's tags to offer exclusions. Pass them in from the server page as a serializable prop (`RecipeTagDto[]`). Use `Dialog` + react-hook-form. Full component:

```tsx
// web/components/plan/generate-plan-drawer.tsx
"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { pickName } from "@/lib/display/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { setupPlanAction } from "@/app/(app)/actions";
import type { RecipeTagDto } from "@/lib/queries/recipes";

interface Defaults {
  iterationWeeks: number;
  shoppingDays: number[];
  servings: number;
  knownRatio: number;
  defaultLeftoverDays: number;
  excludedTagIds: string[];
}

interface Props {
  triggerLabel: string;
  triggerClassName?: string;
  tags: RecipeTagDto[];
  defaults?: Defaults;
}

type FormValues = {
  iterationWeeks: number;
  servings: number;
  knownRatio: number;
  defaultLeftoverDays: number;
  shoppingDays: number[];
  excludedTagIds: string[];
};

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function GeneratePlanDrawer({ triggerLabel, triggerClassName, tags, defaults }: Props) {
  const { locale, t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, control, formState } = useForm<FormValues>({
    defaultValues: {
      iterationWeeks: defaults?.iterationWeeks ?? 1,
      servings: defaults?.servings ?? 2,
      knownRatio: defaults?.knownRatio ?? 0.7,
      defaultLeftoverDays: defaults?.defaultLeftoverDays ?? 1,
      shoppingDays: defaults?.shoppingDays ?? [5],
      excludedTagIds: defaults?.excludedTagIds ?? [],
    },
  });

  async function onSubmit(values: FormValues) {
    if (values.shoppingDays.length < 1 || values.shoppingDays.length > 2) {
      toast.error(t("plan.generate.shoppingDaysError"));
      return;
    }
    const res = await setupPlanAction({
      iterationWeeks: Number(values.iterationWeeks),
      servings: Number(values.servings),
      knownRatio: Number(values.knownRatio),
      defaultLeftoverDays: Number(values.defaultLeftoverDays),
      shoppingDays: values.shoppingDays.map(Number),
      excludedTagIds: values.excludedTagIds,
    });
    if (res.ok) {
      setOpen(false);
      toast.success(t("plan.generate.success"));
      router.refresh();
    } else {
      toast.error(res.status === 422 ? t("plan.generate.shoppingDaysError") : t("common.errorRetry"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={triggerClassName}>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("plan.generate.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <label className="block text-sm">
            {t("plan.generate.iterationWeeks")}
            <Input type="number" min={1} max={3} {...register("iterationWeeks", { valueAsNumber: true })} />
          </label>
          <label className="block text-sm">
            {t("plan.generate.servings")}
            <Input type="number" min={1} max={12} {...register("servings", { valueAsNumber: true })} />
          </label>
          <label className="block text-sm">
            {t("plan.generate.knownRatio")}
            <Input type="number" step="0.1" min={0} max={1} {...register("knownRatio", { valueAsNumber: true })} />
          </label>
          <label className="block text-sm">
            {t("plan.generate.leftoverDays")}
            <Input type="number" min={0} max={3} {...register("defaultLeftoverDays", { valueAsNumber: true })} />
          </label>

          <fieldset>
            <legend className="text-sm font-medium">{t("plan.generate.shoppingDays")}</legend>
            <Controller
              control={control}
              name="shoppingDays"
              render={({ field }) => (
                <div className="mt-1 flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const checked = field.value.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          field.onChange(checked ? field.value.filter((x) => x !== d) : [...field.value, d])
                        }
                        className={`rounded border px-2 py-1 text-xs ${checked ? "bg-primary text-primary-foreground" : "border-border"}`}
                      >
                        {t(`plan.weekdays.${d}`)}
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </fieldset>

          {tags.length > 0 && (
            <fieldset>
              <legend className="text-sm font-medium">{t("plan.generate.excludeTags")}</legend>
              <Controller
                control={control}
                name="excludedTagIds"
                render={({ field }) => (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {tags.map((tag) => {
                      const checked = field.value.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() =>
                            field.onChange(checked ? field.value.filter((x) => x !== tag.id) : [...field.value, tag.id])
                          }
                          className={`rounded border px-2 py-1 text-xs ${checked ? "bg-destructive text-destructive-foreground" : "border-border"}`}
                        >
                          {pickName(locale, tag)}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </fieldset>
          )}

          <Button type="submit" disabled={formState.isSubmitting} className="w-full">
            {t("plan.generate.submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Build the iteration-actions island (Renew + Next)**

```tsx
// web/components/plan/iteration-actions.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { toast } from "@/components/ui/sonner";
import { renewIterationAction, nextIterationAction } from "@/app/(app)/actions";

export function RenewButton({ iterationId }: { iterationId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await renewIterationAction(iterationId);
          if (res.ok) router.refresh();
          else toast.error(t("common.errorRetry"));
        })
      }
      className="rounded border border-primary/50 px-3 py-1 text-xs text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {t("plan.renew")}
    </button>
  );
}

export function NextIterationButton({ className }: { className?: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await nextIterationAction();
          if (res.ok) router.refresh();
          else toast.error(t("common.errorRetry"));
        })
      }
      className={className ?? "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"}
    >
      {t("plan.nextIteration")}
    </button>
  );
}
```

- [ ] **Step 5: Wire the plan page**

In `web/app/(app)/plan/page.tsx`: import `listTags` from `@/lib/queries/recipes`, `GeneratePlanDrawer`, and `NextIterationButton`. Fetch `const tags = listTags(db, householdId);`. Replace the empty-state disabled "Setup" button with `<GeneratePlanDrawer triggerLabel={t("plan.setup")} tags={tags} triggerClassName="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" />`. When `ended` (iteration past), render `<NextIterationButton />` in the orange banner so the user can roll forward. (Also pass current plan config as `defaults` to the drawer for the existing-plan "regenerate settings" affordance — optional; the empty-state has no existing plan.)

- [ ] **Step 6: Wire the iteration card Renew button**

In `web/components/plan/iteration-card.tsx`: import `RenewButton` from `@/components/plan/iteration-actions`. Replace the disabled `{!isArchived && (<button …>{t("plan.renew")}</button>)}` block with `{!isArchived && <RenewButton iterationId={iteration.id} />}`.

- [ ] **Step 7: Add i18n keys**

Add to BOTH dictionaries under `plan` (verify `plan.renew`/`plan.setup` already exist — reuse them):
- `plan.nextIteration` (en `"Start next iteration"`, de `"Nächste Iteration starten"`)
- `plan.weekdays.0`..`plan.weekdays.6` (Sun..Sat / So..Sa — short names; reuse existing weekday keys if present)
- `plan.generate.title` (`"Generate meal plan"` / `"Speiseplan generieren"`)
- `plan.generate.iterationWeeks` (`"Weeks per iteration"` / `"Wochen pro Iteration"`)
- `plan.generate.servings` (`"Servings"` / `"Portionen"`)
- `plan.generate.knownRatio` (`"Known-recipe ratio"` / `"Anteil bekannter Rezepte"`)
- `plan.generate.leftoverDays` (`"Leftover days"` / `"Resteverwertung (Tage)"`)
- `plan.generate.shoppingDays` (`"Shopping days"` / `"Einkaufstage"`)
- `plan.generate.excludeTags` (`"Exclude tags"` / `"Tags ausschließen"`)
- `plan.generate.submit` (`"Generate"` / `"Generieren"`)
- `plan.generate.success` (`"Meal plan generated."` / `"Speiseplan erstellt."`)
- `plan.generate.shoppingDaysError` (`"Pick 1–2 shopping days, at least 3 days apart."` / `"1–2 Einkaufstage mit mind. 3 Tagen Abstand wählen."`)

- [ ] **Step 8: Typecheck + test + build**

Run: `cd web && npm run typecheck && npm run test && npm run build`
Expected: all green; `/plan` builds.

- [ ] **Step 9: Commit**

```bash
git add web/lib/schemas/mutations.ts web/app/\(app\)/actions.ts \
  web/components/plan/generate-plan-drawer.tsx web/components/plan/iteration-actions.tsx \
  web/app/\(app\)/plan/page.tsx web/components/plan/iteration-card.tsx \
  web/lib/i18n/dictionaries/en.json web/lib/i18n/dictionaries/de.json
git commit -m "feat(web): wire meal-plan setup/renew/next-iteration server actions + generate drawer"
```

---

## Task 10: Cooking mode page

**Files:**
- Create: `web/app/(app)/cook/[id]/page.tsx` (RSC loader)
- Create: `web/components/cooking/cooking-view.tsx` (client)
- Modify (add keys): both dictionaries

**Interfaces:**
- Consumes: `requireHousehold`, `getRecipe` (`@/lib/queries/recipes`), `listIngredients`, `listUnits`, `getI18n`, `scaleQuantity` (`@/lib/domain/recipes/scaling`), `formatQuantity`/`pickName`.
- No backend mutation — cooking progress is localStorage only (`cookless-cooking-{recipeId}-{method}`), matching the old `useCookingProgress` hook.

The RSC loader fetches the recipe (household-scoped; `notFound()` on null) plus ingredient/unit maps, and renders the client `CookingView` with serializable props only.

- [ ] **Step 1: Create the RSC loader**

```tsx
// web/app/(app)/cook/[id]/page.tsx
import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getRecipe, listIngredients, listUnits } from "@/lib/queries/recipes";
import { getI18n } from "@/lib/i18n/server";
import { CookingView } from "@/components/cooking/cooking-view";

export default async function CookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();
  const recipe = getRecipe(db, householdId, id);
  if (!recipe) notFound();
  return (
    <CookingView
      recipe={recipe}
      ingredients={listIngredients(db)}
      units={listUnits(db)}
      locale={locale}
    />
  );
}
```

> Confirm the `params` shape against the existing `recipes/[id]/page.tsx` (Next 16 may pass `params` as a Promise — match whatever that page does exactly).

- [ ] **Step 2: Create the client cooking view**

```tsx
// web/components/cooking/cooking-view.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { scaleQuantity } from "@/lib/domain/recipes/scaling";
import { formatQuantity, pickName } from "@/lib/display/format";
import { Button } from "@/components/ui/button";
import type { RecipeDetail, IngredientLite, UnitLite, CookingStepDto } from "@/lib/queries/recipes";

interface Props {
  recipe: RecipeDetail;
  ingredients: IngredientLite[];
  units: UnitLite[];
  locale: string;
}

export function CookingView({ recipe, ingredients, units, locale }: Props) {
  const { t } = useT();
  const ingredientMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const hasManual = recipe.manualSteps.length > 0;
  const hasMachine = recipe.machineSteps.length > 0;
  const [method, setMethod] = useState<"MANUAL" | "MACHINE" | null>(
    hasManual && hasMachine ? null : hasManual ? "MANUAL" : hasMachine ? "MACHINE" : "MANUAL",
  );
  const [servings, setServings] = useState(recipe.defaultServings);
  const [started, setStarted] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  const steps: CookingStepDto[] = useMemo(() => {
    const list = method === "MACHINE" ? recipe.machineSteps : recipe.manualSteps;
    return [...list].sort((a, b) => a.stepNumber - b.stepNumber);
  }, [method, recipe]);

  const progressKey = `cookless-cooking-${recipe.id}-${method}`;

  // Restore progress.
  useEffect(() => {
    if (!started || !method) return;
    const saved = localStorage.getItem(progressKey);
    if (saved) {
      const n = Number(saved);
      if (Number.isFinite(n) && n >= 0 && n < steps.length) setStepIdx(n);
    }
  }, [started, method, progressKey, steps.length]);

  // Persist progress.
  useEffect(() => {
    if (started && method) localStorage.setItem(progressKey, String(stepIdx));
  }, [started, method, progressKey, stepIdx]);

  if (!started) {
    return (
      <div className="space-y-6">
        <Link href={`/recipes/${recipe.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft size={16} />
          {t("common.back")}
        </Link>
        <h1 className="text-2xl font-bold">{recipe.title}</h1>

        <div className="flex items-center gap-3">
          <span className="text-sm">{t("recipes.servings")}</span>
          <Button variant="outline" size="icon" onClick={() => setServings((s) => Math.max(1, s - 1))}>
            <Minus size={16} />
          </Button>
          <span className="w-8 text-center text-lg font-semibold">{servings}</span>
          <Button variant="outline" size="icon" onClick={() => setServings((s) => Math.min(12, s + 1))}>
            <Plus size={16} />
          </Button>
        </div>

        {hasManual && hasMachine && (
          <div className="flex gap-2">
            <Button variant={method === "MANUAL" ? "default" : "outline"} onClick={() => setMethod("MANUAL")}>
              {t("steps.manualSteps")}
            </Button>
            <Button variant={method === "MACHINE" ? "default" : "outline"} onClick={() => setMethod("MACHINE")}>
              {t("steps.machineSteps")}
            </Button>
          </div>
        )}

        <Button
          className="w-full"
          disabled={steps.length === 0 && method === null}
          onClick={() => {
            if (!method) setMethod(hasManual ? "MANUAL" : "MACHINE");
            setStarted(true);
          }}
        >
          {t("cooking.start")}
        </Button>
      </div>
    );
  }

  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button type="button" className="text-sm text-muted-foreground" onClick={() => setStarted(false)}>
          <ChevronLeft size={16} className="inline" /> {recipe.title}
        </button>
        <span className="text-sm text-muted-foreground">
          {t("cooking.stepOf", { current: stepIdx + 1, total: steps.length })}
        </span>
      </div>

      <div className="rounded-xl border bg-card p-6">
        {step?.programType && (
          <p className="mb-2 text-sm font-medium text-primary">{t(`steps.programs.${step.programType}`)}</p>
        )}
        <p className="text-lg leading-relaxed">{step?.instruction}</p>
        {step && step.ingredients.length > 0 && (
          <ul className="mt-4 space-y-1 border-t pt-3 text-sm text-muted-foreground">
            {step.ingredients.map((si) => {
              const ri = recipe.ingredients.find((x) => x.id === si.recipeIngredientId);
              if (!ri) return null;
              const ing = ingredientMap.get(ri.ingredientId);
              const unit = unitMap.get(ri.unitId);
              const qty = formatQuantity(scaleQuantity(si.quantity, servings, recipe.defaultServings).toString());
              return (
                <li key={si.recipeIngredientId}>
                  {qty}{unit ? ` ${unit.abbreviation}` : ""} {ing ? pickName(locale, ing) : "?"}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={stepIdx === 0} onClick={() => setStepIdx((i) => Math.max(0, i - 1))}>
          <ChevronLeft size={16} /> {t("cooking.prev")}
        </Button>
        {isLast ? (
          <Button
            asChild
            onClick={() => localStorage.removeItem(progressKey)}
          >
            <Link href={`/recipes/${recipe.id}`}>{t("cooking.done")}</Link>
          </Button>
        ) : (
          <Button onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}>
            {t("cooking.next")} <ChevronRight size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add i18n keys**

Add under `cooking` in BOTH dictionaries (verify `cooking.start` exists — reuse): `cooking.stepOf` (en `"Step {{current}} of {{total}}"`, de `"Schritt {{current}} von {{total}}"`), `cooking.prev` (`"Back"`/`"Zurück"`), `cooking.next` (`"Next"`/`"Weiter"`), `cooking.done` (`"Done"`/`"Fertig"`).

- [ ] **Step 4: Typecheck + build**

Run: `cd web && npm run typecheck && npm run build`
Expected: `/cook/[id]` route present; build OK. The Cook button (Task 5) already links here.

- [ ] **Step 5: Commit**

```bash
git add web/app/\(app\)/cook web/components/cooking/cooking-view.tsx \
  web/lib/i18n/dictionaries/en.json web/lib/i18n/dictionaries/de.json
git commit -m "feat(web): cooking-mode page (client, localStorage progress)"
```

---

## Task 11: Share / export recipe dialog

**Files:**
- Create: `web/components/recipes/export-recipe-dialog.tsx`
- Modify: `web/components/recipes/recipe-detail.tsx` (pass an `onShare`-bearing wrapper)
- Modify: `web/components/recipes/recipe-detail-actions.tsx` (host the dialog)
- Modify (add keys): both dictionaries

**Interfaces:** Client-only. Builds a plain-text representation of the recipe and offers copy-to-clipboard (and `navigator.share` when available). No backend.

Because `recipe-detail.tsx` is an RSC and `RecipeDetailActions` is the client island, host the export dialog INSIDE `RecipeDetailActions` (it already has the recipe id; pass it the serializable recipe fields it needs to build the export text).

- [ ] **Step 1: Extend `RecipeDetailActions` props to carry export data**

Change the island's props to accept the data needed to render export text (title, ingredients-as-strings, steps-as-strings) — all serializable, computed in the RSC. Update `recipe-detail.tsx` to pass them:

```tsx
// in recipe-detail.tsx, build serializable export lines (server-side):
const exportText = [
  recipe.title,
  "",
  ...recipe.ingredients
    .map((ri) => {
      const ing = ingredientsById.get(ri.ingredientId);
      const unit = unitsById.get(ri.unitId);
      if (!ing) return null;
      return `- ${formatQuantity(ri.quantity)}${unit ? " " + unit.abbreviation : ""} ${pickName(locale, ing)}`;
    })
    .filter(Boolean),
  "",
  ...recipe.manualSteps
    .slice()
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map((s) => `${s.stepNumber}. ${s.instruction}`),
].join("\n");
// ...
<RecipeDetailActions recipeId={recipe.id} listType={recipe.listType} exportText={exportText} exportTitle={recipe.title} />
```

- [ ] **Step 2: Build the export dialog + host it in the island**

```tsx
// web/components/recipes/export-recipe-dialog.tsx
"use client";

import { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";

export function ExportRecipeDialog({ title, text }: { title: string; text: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("export.copied"));
    } catch {
      toast.error(t("common.errorRetry"));
    }
  }

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
      } catch {
        /* user cancelled — ignore */
      }
    } else {
      void copy();
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Share2 size={16} />
        {t("export.share")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("export.title")}</DialogTitle>
          </DialogHeader>
          <textarea
            readOnly
            value={text}
            className="h-64 w-full resize-none rounded-md border border-border bg-muted/30 p-3 text-sm"
          />
          <div className="flex gap-2">
            <Button onClick={copy} className="flex-1">
              <Copy size={16} /> {t("export.copy")}
            </Button>
            <Button variant="outline" onClick={nativeShare} className="flex-1">
              <Share2 size={16} /> {t("export.share")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

In `recipe-detail-actions.tsx`: accept `exportText`/`exportTitle` props, drop the `onShare` prop, and render `<ExportRecipeDialog title={exportTitle} text={exportText} />` in place of the previous Share button.

- [ ] **Step 3: Add i18n keys**

Add under `export` in BOTH dictionaries (verify `export.share` exists — reuse): `export.title` (`"Share recipe"`/`"Rezept teilen"`), `export.copy` (`"Copy"`/`"Kopieren"`), `export.copied` (`"Copied to clipboard."`/`"In Zwischenablage kopiert."`).

- [ ] **Step 4: Typecheck + build**

Run: `cd web && npm run typecheck && npm run build`
Expected: green; the Share button now opens the dialog.

- [ ] **Step 5: Commit**

```bash
git add web/components/recipes/export-recipe-dialog.tsx web/components/recipes/recipe-detail.tsx \
  web/components/recipes/recipe-detail-actions.tsx web/lib/i18n/dictionaries/en.json web/lib/i18n/dictionaries/de.json
git commit -m "feat(web): recipe share/export dialog (copy + native share)"
```

---

## Task 12: i18n audit + full integration verification

**Files:** none created — verification + any small fixes.

- [ ] **Step 1: i18n key audit**

Grep every new `t("…")`/`useT` key introduced in Tasks 3, 5, 9, 10, 11 and confirm each exists in BOTH `en.json` and `de.json` with no missing/extra keys and identical key sets.

Run: `cd web && node -e "const en=require('./lib/i18n/dictionaries/en.json'),de=require('./lib/i18n/dictionaries/de.json');const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?flat(v,p+k+'.'):[p+k]);const e=new Set(flat(en)),d=new Set(flat(de));console.log('only en:',[...e].filter(k=>!d.has(k)));console.log('only de:',[...d].filter(k=>!e.has(k)));"`
Expected: both arrays empty. (Adjust the dictionary path/shape to the real one if Plan 4 nested them differently.)

- [ ] **Step 2: Full test suite**

Run: `cd web && npm run test`
Expected: ALL Vitest pass (198 from Plan 5 + the new service tests from Tasks 1,2,4,6,7,8). Record the new total.

- [ ] **Step 3: Typecheck**

Run: `cd web && npm run typecheck`
Expected: tsc clean (0 errors).

- [ ] **Step 4: Production build**

Run: `cd web && npm run build`
Expected: build succeeds. Confirm the new `/cook/[id]` route appears and `/plan`, `/shopping`, `/recipes`, `/recipes/[id]` still build. No `TODO(plan-6)` placeholder should remain wired to a disabled control.

Run: `cd web && grep -rn "TODO(plan-6)" app components` 
Expected: ZERO matches (every placeholder replaced). If any remain, they must be intentionally deferred — document why.

- [ ] **Step 5: Manual smoke (deferred-OK, document outcome)**

Like Plans 4/5, automated gates are the merge bar; a live dev-server smoke needs a seeded/onboarded household + session. If feasible: `npm run dev`, log in, generate a plan, toggle shopping items, uncheck-all, move + delete a recipe, open cooking mode, share a recipe. Record results or mark DEFERRED to final manual verification.

- [ ] **Step 6: Commit (if any audit fixes) + update progress ledger**

```bash
git add -A
git commit -m "chore(web): Plan 6 integration verification + i18n audit"
```

Append a Plan 6 section to `.superpowers/sdd/progress.md` summarizing commits, test count, and carry-forward notes for Plan 6b (recipe editor) and Plan 7 (AI + images): the `/recipes/[id]/edit` link target still 404s until 6b; `seedDefaultTags` stub still unimplemented; offline shopping sync still deferred; recipe image serving still returns placeholder.

---

## Self-Review

**Spec coverage** (build-order item 5 "Mutations as server actions"):
- Shopping toggle (Django `toggle_item`) → Task 2/3. Bulk-toggle / uncheck-all (`bulk_toggle_items`) → Task 2/3. ✓
- Recipe move (`move_recipe`) + delete (`delete_recipe`) → Task 4/5. ✓
- Meal-plan setup (`setup_plan`/`setup_meal_plan`) → Task 7/9; renew (`renew`) → Task 8/9; next-iteration (`next_iteration`) → Task 8/9; shopping-list generation (`generate_shopping_lists_for_iteration`) → Task 6. ✓
- Cooking mode (interactive, no backend) → Task 10. Share/export → Task 11. ✓
- DEFERRED by decision: recipe create/edit (editor) → Plan 6b; tag CRUD/reset, ingredient create → fold into Plan 6b (the editor needs them); AI generate, image upload/generate/delete, bulk-create → Plan 7; offline sync → later. These are documented, not silently dropped.

**Placeholder scan:** every code step contains real code; test steps contain real assertions. Quantity-string and exact-domain-signature uncertainties are explicitly flagged as "discover from first test run / match the real export," which is the correct TDD posture rather than a hidden TODO.

**Type consistency:** service signatures (`toggleShoppingItem`, `setShoppingItemsChecked`, `moveRecipe`, `deleteRecipe`, `generateShoppingListsForIteration`, `setupMealPlan`, `populateIteration`, `renewIteration`, `generateNextIteration`) are referenced identically in their actions. `Result<T>`/`withHousehold` from Task 1 are used uniformly. Domain calls (`selectRecipes`, `assignSchedule`, `computeIterationDates`, `computeShoppingSegments`, `aggregateShoppingItems`, `validateShoppingDays`, `scaleQuantity`, `mulberry32`) use the Plan-2 signatures captured in research; Task 7 Step-4 explicitly says to reconcile any arg-name drift against the real exports.

**Known risks flagged in-plan:** `validateShoppingDays` throws plain `Error` (caught → 422); `assignSchedule` fallback set = selected set (Django parity); leftover `sourceEntryId` resolved via up-front date→id map; quantity persisted as `Decimal.toString()` verbatim; `params` Promise shape in Next 16 to be matched against the sibling route.
