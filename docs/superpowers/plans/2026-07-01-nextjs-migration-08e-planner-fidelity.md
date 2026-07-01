# Plan 8e — Planner Gap-Fill & Renew Fidelity + Edit-Config Trigger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore faithful Django parity to meal-plan gap-fill (A1) and renew exclusion (A2), and surface an edit-config trigger + no-active-iteration state on the plan page (M13).

**Architecture:** The planner is a pure domain layer (`web/lib/domain/meal-plan/`) wired by a thin persistence layer (`web/lib/meal-plan/`). A1 changes how the wiring layer builds the gap-fill fallback pool; A2 changes which iteration the wiring layer excludes on renew; M13 is pure RSC/UI wiring in `app/(app)/plan/page.tsx`. No schema, migration, domain-algorithm, or server-action-signature changes.

**Tech Stack:** Next.js App Router (RSC) · Drizzle ORM + better-sqlite3 · Vitest (in-memory SQLite via `@/lib/test/db`) · seedable `mulberry32` RNG · Tailwind 4 · shadcn primitives.

Design spec: `docs/superpowers/specs/2026-07-01-nextjs-migration-08e-planner-fidelity-design.md`.

## Global Constraints

- **App root is `web/`.** All paths below are relative to `web/` unless noted. Run all commands from `web/`.
- **Verification is `npx vitest run` + `npm run typecheck` + `npm run build`.** The `web` app has NO eslint (Next 16 dropped `next lint`); there is no lint step.
- **Randomness is injected via `Rng`** (`@/lib/domain/rng`). Tests pass a seeded `mulberry32(n)`; never call `Math.random()` in domain/wiring code paths under test.
- **Weekday convention is Mon=0** (matches domain `weekday()`).
- **i18n files live at `lib/i18n/locales/{en,de}.json`.** This plan adds **zero** new i18n keys — `plan.updateConfig`, `plan.noActiveTitle`, `plan.noActiveSubtitle`, and `plan.generateNext` already exist in both locales.
- **Parity over improvement:** A1 gap-fill ignores excluded tags; A2 renew excludes the *date-previous* iteration. These are deliberate faithful ports of `backend/planner/services.py`, locked via AskUserQuestion 2026-07-01. Do not "improve" them.
- **Commit message convention:** `<type>(web): <description> (Plan 8e Task N)`.

---

### Task 1: A1 — real "other recipes" gap-fill pool

`populateIteration` currently passes the *selected* recipe set as `assignSchedule`'s `fallbackRecipes`, recycling the same dishes across empty leftover days. Django fills empty days from **all household recipes minus the selected set** (variety), falling back to all household recipes only when that pool is empty (`backend/planner/services.py:275–296`). Fix: have `loadSelectablePools` also return the full household recipe set, then build the fallback pool the Django way.

**Files:**
- Modify: `lib/meal-plan/setup.ts` (`loadSelectablePools` return shape; `populateIteration` fallback construction)
- Test: `lib/meal-plan/setup.test.ts` (add cases)

**Interfaces:**
- Consumes: `selectRecipes` (`@/lib/domain/meal-plan/selection`), `assignSchedule` + `ScheduleRecipe` (`@/lib/domain/meal-plan/schedule`), `PoolRecipe` (already declared in `setup.ts`).
- Produces: `loadSelectablePools(db, householdId, excludedTagIds)` now returns `{ known: PoolRecipe[]; tryList: PoolRecipe[]; all: PoolRecipe[] }`, where `all` is every household recipe (all `listType`s, ignoring excluded tags) as `PoolRecipe`. `populateIteration` signature is unchanged.

- [ ] **Step 1: Write the failing tests**

Add these three cases to `lib/meal-plan/setup.test.ts`. The existing `seed()` helper (4 KNOWN `k1–k4` + 2 TO_TRY `t1–t2`, `k4` carries tag `tEx`) is reused for the variety case; the other two use inline seeds. Add the imports `recipeTags`, `tags` are already imported; `households, recipes, recipeIngredients, ingredients, units, mealPlanEntries, planIterations` already imported.

```ts
describe("populateIteration gap-fill (A1)", () => {
  // With one selected recipe over a 7-day iteration and 3 leftover days,
  // days 1/3/5 are empty and must be filled from OTHER recipes (variety),
  // so more than one distinct recipe appears. The old bug recycled the
  // single selected recipe -> exactly one distinct recipe.
  it("fills empty days from recipes outside the selected set", () => {
    const db = seed(); // 6 recipes total (k1-k4 KNOWN, t1-t2 TO_TRY)
    const { iterationId } = setupMealPlan(
      db, "h1",
      { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 1, defaultLeftoverDays: 3, excludedTagIds: [] },
      now, mulberry32(42),
    );
    const entries = db.select().from(mealPlanEntries).where(eq(mealPlanEntries.iterationId, iterationId)).all();
    const distinct = new Set(entries.map((e) => e.recipeId));
    expect(entries.length).toBe(7);           // all days filled
    expect(distinct.size).toBeGreaterThan(1); // gap-fill pulled OTHER recipes
  });

  // When every recipe is already selected, "others" is empty and Django falls
  // back to the full pool. A single-recipe household proves the fallback path:
  // no crash, all days filled, only that recipe used.
  it("falls back to the full pool when no other recipes exist", () => {
    const db = createTestDb();
    db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
    db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
    db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
    db.insert(recipes).values({ id: "only", householdId: "h1", title: "only", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now }).run();
    db.insert(recipeIngredients).values({ recipeId: "only", ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
    const { iterationId } = setupMealPlan(
      db, "h1",
      { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 1, defaultLeftoverDays: 3, excludedTagIds: [] },
      now, mulberry32(5),
    );
    const entries = db.select().from(mealPlanEntries).where(eq(mealPlanEntries.iterationId, iterationId)).all();
    expect(entries.length).toBe(7);
    expect(new Set(entries.map((e) => e.recipeId))).toEqual(new Set(["only"]));
  });

  // Django parity: excluded tags filter the SELECTION pool but NOT the gap-fill
  // pool. With r1 (untagged) selected and r2 (tagged-out) as the only "other"
  // recipe, r2 must appear on gap-fill days.
  it("ignores excluded tags in the gap-fill pool (Django parity)", () => {
    const db = createTestDb();
    db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
    db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
    db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
    db.insert(tags).values({ id: "tEx", householdId: "h1", category: "DIETARY", nameEn: "Spicy", nameDe: "Scharf" }).run();
    db.insert(recipes).values([
      { id: "r1", householdId: "h1", title: "r1", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
      { id: "r2", householdId: "h1", title: "r2", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
    ]).run();
    for (const id of ["r1", "r2"]) db.insert(recipeIngredients).values({ recipeId: id, ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
    db.insert(recipeTags).values({ recipeId: "r2", tagId: "tEx" }).run();
    const { iterationId } = setupMealPlan(
      db, "h1",
      { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 1, defaultLeftoverDays: 3, excludedTagIds: ["tEx"] },
      now, mulberry32(9),
    );
    const used = new Set(db.select().from(mealPlanEntries).where(eq(mealPlanEntries.iterationId, iterationId)).all().map((e) => e.recipeId));
    expect(used.has("r2")).toBe(true); // tagged-out recipe still reached gap-fill
  });
});
```

Also update the existing `loadSelectablePools` test to assert the new `all` field (keeps type coverage honest):

```ts
describe("loadSelectablePools", () => {
  it("excludes recipes carrying an excluded tag", () => {
    const db = seed();
    const { known, all } = loadSelectablePools(db, "h1", ["tEx"]);
    expect(known.map((r) => r.id).sort()).toEqual(["k1", "k2", "k3"]);
    expect(all.map((r) => r.id).sort()).toEqual(["k1", "k2", "k3", "k4", "t1", "t2"]); // all recipes, tags ignored
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run lib/meal-plan/setup.test.ts`
Expected: the three new `gap-fill (A1)` cases fail (`distinct.size` is 1 / `used.has("r2")` is false under current recycling behavior), and the `loadSelectablePools` case fails to destructure `all` (`all` is `undefined`).

- [ ] **Step 3: Implement `all` in `loadSelectablePools`**

In `lib/meal-plan/setup.ts`, change the `loadSelectablePools` return type and body so it also collects every recipe into `all` (before the excluded-tag `continue`):

```ts
export function loadSelectablePools(
  db: Db,
  householdId: string,
  excludedTagIds: string[],
): { known: PoolRecipe[]; tryList: PoolRecipe[]; all: PoolRecipe[] } {
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
  const all: PoolRecipe[] = [];
  for (const r of recRows) {
    const pr: PoolRecipe = { id: r.id, ingredientIds: ingByRecipe.get(r.id) ?? [], leftoverDays: r.leftoverDays };
    all.push(pr); // every household recipe, regardless of tag/listType (A1 gap-fill pool)
    if (excluded.has(r.id)) continue;
    if (r.listType === "KNOWN") known.push(pr);
    else if (r.listType === "TO_TRY") tryList.push(pr);
  }
  return { known, tryList, all };
}
```

- [ ] **Step 4: Build the real fallback pool in `populateIteration`**

In `lib/meal-plan/setup.ts`, inside `populateIteration`, replace the destructure, the `leftoverById` construction, and the `assignSchedule` call so the fallback pool is "all minus selected" (Django parity). Concretely:

Change:
```ts
  const { known, tryList } = loadSelectablePools(db, plan.householdId, excludedTagIds);
```
to:
```ts
  const { known, tryList, all } = loadSelectablePools(db, plan.householdId, excludedTagIds);
```

Change the leftover lookup to use `all` (a superset of known ∪ tryList):
```ts
  // leftoverDays lookup for scheduling (all recipes, so any id resolves)
  const leftoverById = new Map<string, number | null>(all.map((r) => [r.id, r.leftoverDays]));
  const scheduleRecipes: ScheduleRecipe[] = selected.map((r) => ({
    id: r.id,
    leftoverDays: leftoverById.get(r.id) ?? null,
  }));

  // A1: fill empty days from OTHER household recipes for variety (Django parity:
  // planner/services.py _assign_schedule_lunch_only). Fall back to all recipes
  // only when the "others" pool is empty. Excluded tags are intentionally NOT
  // applied here, matching Django.
  const selectedIds = new Set(selected.map((r) => r.id));
  const others = all.filter((r) => !selectedIds.has(r.id));
  const fallbackPool = others.length > 0 ? others : all;
  const fallbackRecipes: ScheduleRecipe[] = fallbackPool.map((r) => ({
    id: r.id,
    leftoverDays: r.leftoverDays,
  }));
```

Change the `assignSchedule` call's `fallbackRecipes`:
```ts
  const planned = assignSchedule({
    recipes: scheduleRecipes,
    fallbackRecipes, // A1: other-recipe variety pool, not the selected set
    startDate,
    days,
    servings: plan.servings,
    defaultLeftoverDays: plan.defaultLeftoverDays,
    rng,
  });
```

(Delete the old `const leftoverById = new Map(... [...known, ...tryList] ...)` line and the `fallbackRecipes: scheduleRecipes, // cycle the selected set to fill gaps (Django parity)` line — they are replaced above.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run lib/meal-plan/setup.test.ts`
Expected: PASS (all `setupMealPlan`, `loadSelectablePools`, and `gap-fill (A1)` cases green).

- [ ] **Step 6: Typecheck**

Run: `cd web && npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/skrug/PycharmProjects/cookless
git add web/lib/meal-plan/setup.ts web/lib/meal-plan/setup.test.ts
git commit -m "fix(web): gap-fill empty plan days from other recipes for variety (Plan 8e Task 1)"
```

---

### Task 2: A2 — renew excludes the date-previous iteration

`renewIteration` currently excludes the recipes of the iteration *being renewed itself*. Django's `renew_iteration` excludes the recipes of the **date-previous** iteration (`services.py:63–74` → `_get_previous_iteration_recipe_ids`, `services.py:131–138`). Fix: add a helper that finds the iteration with `startDate < current.startDate` (ordered desc) and returns its non-leftover recipe ids, and call it from `renewIteration`.

**Files:**
- Modify: `lib/meal-plan/iterations.ts` (add `lt` import; add `previousIterationRecipeIds`; switch `renewIteration`'s exclusion source)
- Test: `lib/meal-plan/iterations.test.ts` (add cases)

**Interfaces:**
- Consumes: existing `previousRecipeIds(db, iterationId)` (non-leftover recipe-id reader for one iteration), `ownedIteration(db, householdId, iterationId)` (returns `{ id, planId, startDate, endDate }`), `populateIteration` (from `./setup`).
- Produces: internal `previousIterationRecipeIds(db, planId, currentStartDate): Set<string>`. `renewIteration` / `generateNextIteration` signatures unchanged.

- [ ] **Step 1: Write the failing test**

Add to `lib/meal-plan/iterations.test.ts`. This uses a fresh inline seed of **14 KNOWN recipes** with `leftoverDays: 0`, so each iteration cooks 7 distinct recipes on 7 days with **no leftover and no gap-fill** — making the selected set fully observable. Setup's iteration 1 selects set S1; `generateNextIteration` (which excludes S1) selects the disjoint remaining 7 as S2. Renewing iteration 2 under Django parity excludes the *date-previous* iteration (iteration 1 = S1), so the renewed selection avoids S1. Under the old (own-set) behavior it would exclude S2 and therefore reselect S1.

**No new imports are needed** — `iterations.test.ts` already imports `eq`, `mulberry32`, `setupMealPlan`, `generateNextIteration`, `households`, `units`, `ingredients`, `recipes`, `recipeIngredients`, `planIterations`, and `mealPlanEntries`. Add only the code below.

```ts
function seededTwoIterations() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
  db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
  // 14 KNOWN recipes, leftoverDays:0 -> 7 cook days fully tile a 1-week iteration, no gap-fill.
  const rows = Array.from({ length: 14 }, (_, i) => ({
    id: `r${i}`, householdId: "h1", title: `r${i}`, description: "",
    listType: "KNOWN", defaultServings: 2, leftoverDays: 0, createdAt: now, updatedAt: now,
  }));
  db.insert(recipes).values(rows).run();
  for (const r of rows) db.insert(recipeIngredients).values({ recipeId: r.id, ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
  const { iterationId: it1 } = setupMealPlan(
    db, "h1",
    { iterationWeeks: 1, shoppingDays: [1], servings: 2, knownRatio: 1, defaultLeftoverDays: 0, excludedTagIds: [] },
    now, mulberry32(11),
  );
  const { iterationId: it2 } = generateNextIteration(db, "h1", now, mulberry32(12));
  return { db, it1, it2 };
}

function recipeSet(db: ReturnType<typeof createTestDb>, iterationId: string): Set<string> {
  return new Set(
    db.select({ recipeId: mealPlanEntries.recipeId }).from(mealPlanEntries)
      .where(eq(mealPlanEntries.iterationId, iterationId)).all().map((e) => e.recipeId),
  );
}

describe("renewIteration exclusion baseline (A2)", () => {
  it("excludes the date-previous iteration's recipes, not its own (Django parity)", () => {
    const { db, it1, it2 } = seededTwoIterations();
    const s1 = recipeSet(db, it1);
    const s2 = recipeSet(db, it2);
    // Preconditions: two disjoint 7-recipe iterations partitioning the 14 recipes.
    expect(s1.size).toBe(7);
    expect(s2.size).toBe(7);
    expect([...s2].some((id) => s1.has(id))).toBe(false);

    renewIteration(db, "h1", it2, mulberry32(13));
    const renewed = recipeSet(db, it2);
    // Django parity: renewed iteration avoids the DATE-PREVIOUS iteration (s1).
    // (Under the old own-set behavior it would exclude s2 and reselect s1.)
    expect([...renewed].some((id) => s1.has(id))).toBe(false);
    expect(renewed).toEqual(s2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run lib/meal-plan/iterations.test.ts -t "exclusion baseline"`
Expected: FAIL — under the current own-set exclusion, `renewed` equals `s1` (all ids intersect `s1`), so `some(... s1.has ...)` is `true` and `renewed` ≠ `s2`.

- [ ] **Step 3: Add `lt` to the drizzle import**

In `lib/meal-plan/iterations.ts`, change:
```ts
import { and, desc, eq } from "drizzle-orm";
```
to:
```ts
import { and, desc, eq, lt } from "drizzle-orm";
```

- [ ] **Step 4: Add the `previousIterationRecipeIds` helper**

In `lib/meal-plan/iterations.ts`, add below the existing `previousRecipeIds` function:

```ts
/**
 * Non-leftover recipe ids of the iteration immediately preceding `currentStartDate`.
 * Port of planner/services.py _get_previous_iteration_recipe_ids: the exclusion
 * baseline for BOTH renew and next-iteration is the date-previous iteration.
 */
function previousIterationRecipeIds(db: Db, planId: string, currentStartDate: string): Set<string> {
  const prev = db
    .select({ id: planIterations.id })
    .from(planIterations)
    .where(and(eq(planIterations.mealPlanId, planId), lt(planIterations.startDate, currentStartDate)))
    .orderBy(desc(planIterations.startDate))
    .get();
  if (!prev) return new Set();
  return previousRecipeIds(db, prev.id);
}
```

- [ ] **Step 5: Switch `renewIteration` to the date-previous baseline**

In `lib/meal-plan/iterations.ts`, in `renewIteration`, replace:
```ts
  const it = ownedIteration(db, householdId, iterationId);
  const exclude = previousRecipeIds(db, iterationId);
```
with:
```ts
  const it = ownedIteration(db, householdId, iterationId);
  // A2: exclude the DATE-PREVIOUS iteration's recipes (Django parity), not this
  // iteration's own set. For the first/only iteration this is empty.
  const exclude = previousIterationRecipeIds(db, it.planId, it.startDate);
```

Leave `generateNextIteration` unchanged: its `prev` (max `startDate`, read before the new row is inserted) already *is* the date-previous iteration, so it matches Django.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd web && npx vitest run lib/meal-plan/iterations.test.ts`
Expected: PASS (new `exclusion baseline (A2)` case green; existing `renewIteration` window/cross-household and `generateNextIteration` cases still green).

- [ ] **Step 7: Typecheck**

Run: `cd web && npm run typecheck`
Expected: no errors. (If the linter flags an unused `previousRecipeIds`, note it is still used by `previousIterationRecipeIds` — it is not unused.)

- [ ] **Step 8: Commit**

```bash
cd /Users/skrug/PycharmProjects/cookless
git add web/lib/meal-plan/iterations.ts web/lib/meal-plan/iterations.test.ts
git commit -m "fix(web): renew excludes date-previous iteration recipes (Plan 8e Task 2)"
```

---

### Task 3: M13 — edit-config trigger + no-active-iteration state

Once a plan exists there is no way to edit its config, and the page assumes `iterations[0]` is always the active iteration. Add a header "Update plan" trigger (reusing `GeneratePlanDrawer`, which already accepts `defaults`) and a no-active-iteration empty state, matching the old `MealPlanPage.tsx`. No new i18n keys, no server-action changes. This task has no unit test (RSC pages are verified via typecheck + build, consistent with Plans 4–8d); the browser smoke is deferred to the on-host pass.

**Files:**
- Modify: `app/(app)/plan/page.tsx`

**Interfaces:**
- Consumes: `getMealPlanView` (returns `iterationWeeks`, `shoppingDays`, `servings`, `knownRatio: string`, `defaultLeftoverDays`, `excludedTagIds`, and `iterations[]` with `id`/`status`/`endDate`), `GeneratePlanDrawer` (`{ triggerLabel, triggerClassName?, tags, defaults? }` where `defaults.knownRatio` is a `number`), `NextIterationButton`, `IterationCard`, `EmptyState`, `listTags`, `getI18n`.
- Produces: nothing new (page component only).

- [ ] **Step 1: Rewrite the plan page**

Replace the body of `app/(app)/plan/page.tsx` (from the `const [active, ...archived]` line onward) so it: (a) builds `defaults` from the plan view, (b) renders the header edit trigger whenever a plan exists, (c) resolves `active` by `status === "ACTIVE"` rather than positionally, and (d) shows the no-active-iteration empty state. The no-plan empty state at the top is unchanged. Full file:

```tsx
import { Calendar } from "lucide-react";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getMealPlanView } from "@/lib/queries/meal-plan";
import { listTags } from "@/lib/queries/recipes";
import { EmptyState } from "@/components/ui/empty-state";
import { IterationCard } from "@/components/plan/iteration-card";
import { GeneratePlanDrawer } from "@/components/plan/generate-plan-drawer";
import { NextIterationButton } from "@/components/plan/iteration-actions";

export default async function PlanPage() {
  const { householdId } = await requireHousehold();
  const { t } = await getI18n();
  const todayIso = new Date().toISOString().slice(0, 10);

  const tags = listTags(db, householdId);
  const plan = getMealPlanView(db, householdId);
  if (!plan || plan.iterations.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("plan.title")}</h1>
        <EmptyState
          icon={Calendar}
          title={t("plan.noPlanTitle")}
          subtitle={t("plan.noPlanSubtitle")}
          action={
            <GeneratePlanDrawer
              triggerLabel={t("plan.setup")}
              tags={tags}
              triggerClassName="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            />
          }
        />
      </div>
    );
  }

  const defaults = {
    iterationWeeks: plan.iterationWeeks,
    shoppingDays: plan.shoppingDays,
    servings: plan.servings,
    knownRatio: Number(plan.knownRatio),
    defaultLeftoverDays: plan.defaultLeftoverDays,
    excludedTagIds: plan.excludedTagIds,
  };

  const active = plan.iterations.find((it) => it.status === "ACTIVE") ?? null;
  const archived = plan.iterations.filter((it) => it.id !== active?.id);
  const ended = active !== null && active.endDate < todayIso;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("plan.title")}</h1>
        <GeneratePlanDrawer
          triggerLabel={t("plan.updateConfig")}
          tags={tags}
          defaults={defaults}
          triggerClassName="rounded-md border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
        />
      </div>

      {ended && (
        <div className="flex items-center justify-between rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm dark:border-orange-900 dark:bg-orange-950">
          <span>{t("plan.iterationEnded")}</span>
          <NextIterationButton />
        </div>
      )}

      {active && (
        <IterationCard
          iteration={active}
          shoppingDays={plan.shoppingDays}
          isArchived={false}
          todayIso={todayIso}
        />
      )}

      {!active && (
        <EmptyState
          icon={Calendar}
          title={t("plan.noActiveTitle")}
          subtitle={t("plan.noActiveSubtitle")}
          action={<NextIterationButton />}
        />
      )}

      {archived.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">
            {t("plan.pastIterations")}
          </h2>
          {archived.map((it) => (
            <IterationCard
              key={it.id}
              iteration={it}
              shoppingDays={plan.shoppingDays}
              isArchived
              todayIso={todayIso}
            />
          ))}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npm run typecheck`
Expected: no errors. (Confirms `defaults` matches `GeneratePlanDrawer`'s `Defaults` interface — in particular `knownRatio: number` via `Number(plan.knownRatio)`.)

- [ ] **Step 3: Build**

Run: `cd web && npm run build`
Expected: build succeeds; `/plan` route compiles (no new routes).

- [ ] **Step 4: Commit**

```bash
cd /Users/skrug/PycharmProjects/cookless
git add "web/app/(app)/plan/page.tsx"
git commit -m "feat(web): edit-config trigger + no-active-iteration state on plan page (Plan 8e Task 3)"
```

---

## Final verification (after all tasks)

- [ ] Run the full web test suite: `cd web && npx vitest run` — expect all green (prior 364 + the new A1/A2 cases).
- [ ] Typecheck: `cd web && npm run typecheck` — clean.
- [ ] Build: `cd web && npm run build` — succeeds.
- [ ] Confirm i18n parity is unchanged (this plan adds zero keys): `cd web && node -e "const en=require('./lib/i18n/locales/en.json'),de=require('./lib/i18n/locales/de.json');const c=o=>Object.keys(JSON.parse(JSON.stringify(o))).length;console.log('top-level',c(en),c(de))"` — en and de top-level counts equal (as before).

## Notes for the reviewer

- **A1 fallback pool ignores excluded tags on purpose** (Django `_assign_schedule_lunch_only` does not filter `all_recipes` by tags). This is locked, not an oversight.
- **A2:** only `renewIteration` changed. `generateNextIteration` already excluded the date-previous iteration and is deliberately left untouched to avoid re-introducing the read-before-insert ordering subtlety.
- **M13:** `setupMealPlan` (invoked by the "Update plan" drawer via the unchanged `setupPlanAction`) deletes and regenerates iterations — so editing config re-rolls the plan. This matches the old app's `existingPlan` path and Django `setup_meal_plan`; it is intended behavior, not a regression.
- No schema/migration, no new i18n keys, no server-action signature changes.
