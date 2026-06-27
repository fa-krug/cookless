# Next.js Migration — Plan 5: Read Pages (RSC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three placeholder feature pages in `web/app/(app)/{recipes,plan,shopping}` with real React Server Components that read household-scoped data directly from Drizzle and render the recipes list, recipe detail, meal plan, and shopping list — faithfully porting the old React/Vite views, read concerns only.

**Architecture:** A new household-scoped **query layer** (`web/lib/queries/`) holds all DB reads as pure functions taking `(db, householdId, …)` — unit-tested against in-memory SQLite exactly like the Plan 3 auth layer. Pages are **Server Components** that call `requireHousehold()` then a query function, and render the result. Interactivity is isolated into small `"use client"` **islands** (filter controls that drive URL search params; collapsible cards; a read-only preview modal). All mutation affordances (shopping toggles, recipe editing, plan generation) render in their *read* state — the actual mutations are **Plan 6**.

**Tech Stack:** Next.js App Router (RSC + `searchParams`), Drizzle ORM + better-sqlite3, decimal.js (via `@/lib/domain/decimal`), the ported domain layer (`@/lib/domain/*`), server i18n (`getI18n()`) + client i18n (`useT()`), the ported shadcn UI primitives in `web/components/ui/`, Vitest (query-layer tests), `tsc --noEmit` + `next build` (page/type verification).

## Global Constraints

These apply to **every task**. Each task's requirements implicitly include this section.

- **RSC by default.** A file is a Server Component unless it needs browser-only APIs, hooks, or event handlers — only then add `"use client"` at the very top, and keep the island as small as possible. Pages (`page.tsx`) and layouts stay Server Components.
- **Household scoping is mandatory.** Every page reads its household id via `requireHousehold()` (`@/lib/auth/session`) and passes it into the query. Every query function takes `householdId` as a required parameter and filters on it (directly or through a join). No query may return another household's rows. (A roster-IDOR slipped through Plan 3's initial wiring — do not repeat it.)
- **Quantities are never JS numbers.** Decimal columns are TEXT. Parse with `Decimal` imported from `@/lib/domain/decimal` (never `decimal.js` directly). Format for display with the `formatQuantity` helper from Task 5. Numbers like `servings`, `prepTimeMinutes`, `defaultLeftoverDays` are plain integers and are fine as `number`.
- **camelCase columns.** The Drizzle schema uses camelCase (`listType`, `defaultServings`, `nameEn`, `shoppingDay1`, `isLeftover`, …). There is no snake_case in `web/`. Table names are snake_case strings inside `sqliteTable("…")` but you reference the exported JS identifiers (`recipes`, `recipeIngredients`, `mealPlanEntries`, …).
- **i18n:** Server Components destructure `const { locale, t, tList } = await getI18n()` (`@/lib/i18n/server`). Client islands call `const { locale, t, tList } = useT()` (`@/lib/i18n/provider`). Never hardcode user-facing English; use the dictionary keys (they already exist — see Task 5). `t(key, vars)` interpolates `{{var}}` and supports `key_one`/`key_other` plurals via `vars.count`.
- **Locale-dependent names.** `ingredients`, `units`, and `tags` carry `nameEn`/`nameDe`. Resolve with the active `locale`: `locale === "de" ? row.nameDe : row.nameEn`. Use the `pickName` helper from Task 5.
- **Images are not servable yet.** `recipes.image` is a relative path under `data/media`; the `/api/images/[...]` serving route lands in **Plan 7**. Render images through the `recipeImageUrl(image)` helper (Task 5) which returns `null` when `image` is empty, and components must show the placeholder branch for `null`. Do not build the image route here.
- **Verification = `tsc` + `vitest` + `next build`.** The `web` app has **no ESLint** (Next 16 dropped `next lint`; the `lint` script was removed). Per-task verification runs `npm run typecheck` and `npm test`; page tasks additionally run `npm run build` (a Server Component with a bad query/type fails the build). There is no `lint` step — do not add or call one.
- **Test DB:** query-layer tests use `createTestDb()` from `@/lib/test/db` (fresh in-memory SQLite with all Drizzle migrations applied). Seed rows with `db.insert(table).values({…}).run()`. Use a fixed `const now = new Date("2026-06-27T12:00:00Z")` for timestamps.
- **Commit per task**, after that task's verification passes. Conventional-commit messages, `feat(web): …` / `test(web): …`.
- **Read concerns only.** This plan renders data. Buttons that would mutate (edit/save/delete recipe, generate/refresh plan, toggle/reset shopping items) are rendered in their visual read state but are **non-functional placeholders** wired in Plan 6. Where the old UI had such a control, render it (disabled or as a non-submitting element) so the layout matches, and leave a `// TODO(plan-6): wire mutation` comment. Do not implement server actions here.

---

## File Structure (created/modified by this plan)

**Query layer (new):**
- `web/lib/queries/recipes.ts` — `listRecipes`, `getRecipe`, `listTags`, `listIngredients`, `listUnits` (+ exported result types).
- `web/lib/queries/recipes.test.ts`
- `web/lib/queries/meal-plan.ts` — `getMealPlanView` (+ types).
- `web/lib/queries/meal-plan.test.ts`
- `web/lib/queries/shopping.ts` — `getLatestShoppingList` (+ types).
- `web/lib/queries/shopping.test.ts`

**Shared display helpers (new):**
- `web/lib/display/format.ts` — `formatQuantity`, `pickName`, `recipeImageUrl`, `CATEGORY_ORDER`.
- `web/lib/display/format.test.ts`

**Pages (replace placeholders / add):**
- `web/app/(app)/recipes/page.tsx` — replace placeholder (list, RSC).
- `web/app/(app)/recipes/[id]/page.tsx` — new (detail, RSC, read-only).
- `web/app/(app)/plan/page.tsx` — replace placeholder (RSC).
- `web/app/(app)/shopping/page.tsx` — replace placeholder (RSC).

**Components (new, under `web/components/`):**
- `web/components/recipes/recipe-card.tsx` (RSC), `recipe-list-skeleton.tsx` (RSC), `recipe-filters.tsx` (client island).
- `web/components/recipes/recipe-detail.tsx` (RSC) + sub-pieces as needed.
- `web/components/plan/iteration-card.tsx` (client — collapse), `meal-plan-skeleton.tsx` (RSC), `recipe-preview-modal.tsx` (client, read-only).
- `web/components/shopping/shopping-category.tsx` (client — collapse), `shopping-list-skeleton.tsx` (RSC).

**Reference (read, port-from — old app, do not modify):**
- `frontend/src/pages/RecipeListPage.tsx`, `RecipeDetailPage.tsx`, `MealPlanPage.tsx`, `ShoppingListPage.tsx`
- `frontend/src/components/RecipeCard.tsx`, `IterationCard.tsx`, `ShoppingCategory.tsx`, `RecipePreviewModal.tsx`
- `backend/recipes/api.py`, `backend/planner/api.py`, `backend/shopping/api.py` (response shapes & server-side ordering/filtering)

---

## Task 1: Recipe list query

**Files:**
- Create: `web/lib/queries/recipes.ts`
- Test: `web/lib/queries/recipes.test.ts`

**Interfaces:**
- Consumes: `db` (`@/lib/db` → `Db`), schema tables `recipes`, `tags`, `recipeTags` (`@/lib/db/schema`); Drizzle ops `eq`, `and`, `like`, `inArray`, `desc`, `sql` (`drizzle-orm`).
- Produces:
  ```ts
  export interface RecipeTagDto { id: string; category: string; nameEn: string; nameDe: string }
  export interface RecipeSummary {
    id: string; title: string; description: string; listType: string;
    defaultServings: number; prepTimeMinutes: number | null; cookTimeMinutes: number | null;
    leftoverDays: number | null; image: string;
    createdAt: Date; updatedAt: Date; tags: RecipeTagDto[];
  }
  export interface ListRecipesOpts {
    listType?: string;            // "KNOWN" | "TO_TRY" — omit = all
    tagIds?: string[];            // AND-less: recipe has ANY of these tags (matches old behaviour: tags param = OR within filter)
    search?: string;             // case-insensitive substring on title
    limit?: number;              // default 20
    offset?: number;             // default 0
  }
  export interface RecipeListResult { items: RecipeSummary[]; totalCount: number }
  export function listRecipes(db: Db, householdId: string, opts?: ListRecipesOpts): RecipeListResult
  ```

> **Port reference:** `backend/recipes/api.py` recipe-list endpoint and `frontend/src/hooks/useRecipes.ts`. Old server-side filters: `list_type`, `tags` (comma-separated ids), `search` (title icontains), `limit`/`offset` pagination, `total_count`. No server ordering (client sorts). Replicate: filter by `householdId` + optional `listType` + optional tag membership + optional title substring; return the page slice plus the full filtered `totalCount`.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/queries/recipes.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { households, recipes, tags, recipeTags } from "@/lib/db/schema";
import { listRecipes } from "./recipes";

const now = new Date("2026-06-27T12:00:00Z");

function seed() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(households).values({ id: "h2", name: "Other", createdAt: now }).run();
  db.insert(tags).values({ id: "t1", householdId: "h1", category: "CUISINE", nameEn: "Italian", nameDe: "Italienisch" }).run();
  db.insert(recipes).values([
    { id: "r1", householdId: "h1", title: "Pasta", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
    { id: "r2", householdId: "h1", title: "Pizza", description: "", listType: "KNOWN", defaultServings: 2, createdAt: new Date("2026-06-28T12:00:00Z"), updatedAt: now },
    { id: "r3", householdId: "h1", title: "Tofu Curry", description: "", listType: "TO_TRY", defaultServings: 2, createdAt: now, updatedAt: now },
    { id: "rX", householdId: "h2", title: "Secret", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
  ]).run();
  db.insert(recipeTags).values({ recipeId: "r1", tagId: "t1" }).run();
  return db;
}

describe("listRecipes", () => {
  it("scopes to the household (never leaks other households)", () => {
    const { items, totalCount } = listRecipes(seed(), "h1");
    expect(items.map((r) => r.id).sort()).toEqual(["r1", "r2", "r3"]);
    expect(totalCount).toBe(3);
    expect(items.find((r) => r.id === "rX")).toBeUndefined();
  });

  it("filters by listType", () => {
    const { items, totalCount } = listRecipes(seed(), "h1", { listType: "TO_TRY" });
    expect(items.map((r) => r.id)).toEqual(["r3"]);
    expect(totalCount).toBe(1);
  });

  it("filters by case-insensitive title search", () => {
    const { items } = listRecipes(seed(), "h1", { search: "piz" });
    expect(items.map((r) => r.id)).toEqual(["r2"]);
  });

  it("filters by tag membership", () => {
    const { items } = listRecipes(seed(), "h1", { tagIds: ["t1"] });
    expect(items.map((r) => r.id)).toEqual(["r1"]);
  });

  it("attaches tags to each summary", () => {
    const { items } = listRecipes(seed(), "h1", { listType: "KNOWN", search: "pasta" });
    expect(items[0]!.tags).toEqual([
      { id: "t1", category: "CUISINE", nameEn: "Italian", nameDe: "Italienisch" },
    ]);
  });

  it("paginates with limit/offset but reports full totalCount", () => {
    const { items, totalCount } = listRecipes(seed(), "h1", { limit: 2, offset: 0 });
    expect(items.length).toBe(2);
    expect(totalCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/queries/recipes.test.ts`
Expected: FAIL — `listRecipes` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// web/lib/queries/recipes.ts
import { and, eq, inArray, like, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { recipeTags, recipes, tags } from "@/lib/db/schema";

export interface RecipeTagDto {
  id: string;
  category: string;
  nameEn: string;
  nameDe: string;
}

export interface RecipeSummary {
  id: string;
  title: string;
  description: string;
  listType: string;
  defaultServings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  leftoverDays: number | null;
  image: string;
  createdAt: Date;
  updatedAt: Date;
  tags: RecipeTagDto[];
}

export interface ListRecipesOpts {
  listType?: string;
  tagIds?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface RecipeListResult {
  items: RecipeSummary[];
  totalCount: number;
}

export function listRecipes(
  db: Db,
  householdId: string,
  opts: ListRecipesOpts = {},
): RecipeListResult {
  const { listType, tagIds, search, limit = 20, offset = 0 } = opts;

  const conditions = [eq(recipes.householdId, householdId)];
  if (listType) conditions.push(eq(recipes.listType, listType));
  if (search && search.trim()) {
    conditions.push(like(recipes.title, `%${search.trim()}%`));
  }
  if (tagIds && tagIds.length > 0) {
    // recipe ids that have at least one of the requested tags
    const tagged = db
      .selectDistinct({ recipeId: recipeTags.recipeId })
      .from(recipeTags)
      .where(inArray(recipeTags.tagId, tagIds))
      .all()
      .map((row) => row.recipeId);
    conditions.push(inArray(recipes.id, tagged.length ? tagged : ["__none__"]));
  }

  const where = and(...conditions);

  const totalCount = db
    .select({ n: sql<number>`count(*)` })
    .from(recipes)
    .where(where)
    .get()!.n;

  const rows = db
    .select()
    .from(recipes)
    .where(where)
    .orderBy(recipes.title)
    .limit(limit)
    .offset(offset)
    .all();

  // Attach tags in one extra query, grouped in JS.
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/queries/recipes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd web && npm run typecheck
git add web/lib/queries/recipes.ts web/lib/queries/recipes.test.ts
git commit -m "feat(web): household-scoped recipe list query (TDD)"
```

---

## Task 2: Recipe detail + global-list queries

**Files:**
- Modify: `web/lib/queries/recipes.ts` (append).
- Modify: `web/lib/queries/recipes.test.ts` (append).

**Interfaces:**
- Consumes: schema `recipes`, `recipeIngredients`, `cookingSteps`, `stepIngredients`, `ingredients`, `units`, `recipeTags`, `tags`.
- Produces:
  ```ts
  export interface IngredientLite { id: number; nameEn: string; nameDe: string; category: string }
  export interface UnitLite { id: number; nameEn: string; nameDe: string; abbreviation: string }
  export interface RecipeIngredientDto {
    id: number; ingredientId: number; quantity: string; unitId: number; order: number;
  }
  export interface StepIngredientDto { recipeIngredientId: number; quantity: string }
  export interface CookingStepDto {
    id: number; method: string; stepNumber: number; instruction: string; programType: string;
    temperature: number | null; durationSeconds: number | null; speed: number | null;
    turbo: boolean; direction: string; weightGrams: number | null; ingredients: StepIngredientDto[];
  }
  export interface RecipeDetail extends RecipeSummary {
    ingredients: RecipeIngredientDto[];
    manualSteps: CookingStepDto[];   // method === "MANUAL"
    machineSteps: CookingStepDto[];  // method === "MACHINE"
  }
  export function getRecipe(db: Db, householdId: string, id: string): RecipeDetail | null
  export function listTags(db: Db, householdId: string): RecipeTagDto[]
  export function listIngredients(db: Db): IngredientLite[]
  export function listUnits(db: Db): UnitLite[]
  ```

> **Port reference:** `backend/recipes/api.py` detail endpoint splits steps into `manual_steps` / `machine_steps`. In `web` the `cookingSteps.method` column carries the split. **Before coding, confirm the exact `method` values** used by the data-migration/seed (`web/scripts/*` and `web/lib/db/schema.ts`) — grep for `method:` writes. The test below assumes `"MANUAL"` / `"MACHINE"`; if the real values differ, update both the test and the `getRecipe` filter to match (do **not** invent values). `getRecipe` must return `null` when the recipe is missing **or belongs to another household** (scoping).

- [ ] **Step 1: Write the failing test (append to recipes.test.ts)**

```ts
import {
  getRecipe,
  listIngredients,
  listTags,
  listUnits,
} from "./recipes";
import {
  ingredients,
  units,
  recipeIngredients,
  cookingSteps,
  stepIngredients,
} from "@/lib/db/schema";

function seedDetail() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
  db.insert(ingredients).values([
    { id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" },
    { id: 2, nameEn: "Pasta", nameDe: "Nudeln", category: "PANTRY" },
  ]).run();
  db.insert(units).values([
    { id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" },
  ]).run();
  db.insert(tags).values({ id: "t1", householdId: "h1", category: "CUISINE", nameEn: "Italian", nameDe: "Italienisch" }).run();
  db.insert(recipes).values([
    { id: "r1", householdId: "h1", title: "Pasta", description: "Yum", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
    { id: "rX", householdId: "h2", title: "Secret", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
  ]).run();
  db.insert(recipeTags).values({ recipeId: "r1", tagId: "t1" }).run();
  db.insert(recipeIngredients).values([
    { id: 10, recipeId: "r1", ingredientId: 1, quantity: "200", unitId: 1, order: 0 },
    { id: 11, recipeId: "r1", ingredientId: 2, quantity: "150", unitId: 1, order: 1 },
  ]).run();
  db.insert(cookingSteps).values([
    { id: 100, recipeId: "r1", method: "MANUAL", stepNumber: 1, instruction: "Boil water", programType: "", turbo: false, direction: "" },
    { id: 101, recipeId: "r1", method: "MACHINE", stepNumber: 1, instruction: "Chop", programType: "CHOPPING", speed: 5, turbo: false, direction: "" },
  ]).run();
  db.insert(stepIngredients).values({ stepId: 101, recipeIngredientId: 10, quantity: "200" }).run();
  return db;
}

describe("getRecipe", () => {
  it("returns null for missing or cross-household recipe", () => {
    const db = seedDetail();
    expect(getRecipe(db, "h1", "missing")).toBeNull();
    expect(getRecipe(db, "h1", "rX")).toBeNull(); // belongs to h2
  });

  it("returns full detail with ordered ingredients, split steps, and tags", () => {
    const r = getRecipe(seedDetail(), "h1", "r1")!;
    expect(r.title).toBe("Pasta");
    expect(r.ingredients.map((i) => i.ingredientId)).toEqual([1, 2]); // ordered by `order`
    expect(r.manualSteps.map((s) => s.id)).toEqual([100]);
    expect(r.machineSteps.map((s) => s.id)).toEqual([101]);
    expect(r.machineSteps[0]!.ingredients).toEqual([{ recipeIngredientId: 10, quantity: "200" }]);
    expect(r.tags.map((t) => t.id)).toEqual(["t1"]);
  });
});

describe("global lists", () => {
  it("listTags scopes to household", () => {
    expect(listTags(seedDetail(), "h1").map((t) => t.id)).toEqual(["t1"]);
    expect(listTags(seedDetail(), "h2")).toEqual([]);
  });
  it("listIngredients / listUnits return global rows", () => {
    expect(listIngredients(seedDetail()).map((i) => i.id)).toEqual([1, 2]);
    expect(listUnits(seedDetail()).map((u) => u.abbreviation)).toEqual(["g"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/queries/recipes.test.ts`
Expected: FAIL — `getRecipe` not exported.

- [ ] **Step 3: Write minimal implementation (append to recipes.ts)**

```ts
// --- detail + global lists (append to web/lib/queries/recipes.ts) ---
import { recipeIngredients, cookingSteps, stepIngredients, ingredients, units } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

export interface IngredientLite { id: number; nameEn: string; nameDe: string; category: string }
export interface UnitLite { id: number; nameEn: string; nameDe: string; abbreviation: string }
export interface RecipeIngredientDto { id: number; ingredientId: number; quantity: string; unitId: number; order: number }
export interface StepIngredientDto { recipeIngredientId: number; quantity: string }
export interface CookingStepDto {
  id: number; method: string; stepNumber: number; instruction: string; programType: string;
  temperature: number | null; durationSeconds: number | null; speed: number | null;
  turbo: boolean; direction: string; weightGrams: number | null; ingredients: StepIngredientDto[];
}
export interface RecipeDetail extends RecipeSummary {
  ingredients: RecipeIngredientDto[];
  manualSteps: CookingStepDto[];
  machineSteps: CookingStepDto[];
}

export function getRecipe(db: Db, householdId: string, id: string): RecipeDetail | null {
  const r = db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.householdId, householdId)))
    .get();
  if (!r) return null;

  const ri = db
    .select()
    .from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, id))
    .orderBy(asc(recipeIngredients.order))
    .all();

  const steps = db
    .select()
    .from(cookingSteps)
    .where(eq(cookingSteps.recipeId, id))
    .orderBy(asc(cookingSteps.stepNumber))
    .all();
  const stepIds = steps.map((s) => s.id);
  const si = stepIds.length
    ? db.select().from(stepIngredients).where(inArray(stepIngredients.stepId, stepIds)).all()
    : [];
  const siByStep = new Map<number, StepIngredientDto[]>();
  for (const row of si) {
    const list = siByStep.get(row.stepId) ?? [];
    list.push({ recipeIngredientId: row.recipeIngredientId, quantity: row.quantity });
    siByStep.set(row.stepId, list);
  }
  const toDto = (s: (typeof steps)[number]): CookingStepDto => ({
    id: s.id, method: s.method, stepNumber: s.stepNumber, instruction: s.instruction,
    programType: s.programType, temperature: s.temperature, durationSeconds: s.durationSeconds,
    speed: s.speed, turbo: s.turbo, direction: s.direction, weightGrams: s.weightGrams,
    ingredients: siByStep.get(s.id) ?? [],
  });

  const tagRows = db
    .select({ id: tags.id, category: tags.category, nameEn: tags.nameEn, nameDe: tags.nameDe })
    .from(recipeTags)
    .innerJoin(tags, eq(tags.id, recipeTags.tagId))
    .where(eq(recipeTags.recipeId, id))
    .all();

  return {
    id: r.id, title: r.title, description: r.description, listType: r.listType,
    defaultServings: r.defaultServings, prepTimeMinutes: r.prepTimeMinutes,
    cookTimeMinutes: r.cookTimeMinutes, leftoverDays: r.leftoverDays, image: r.image,
    createdAt: r.createdAt, updatedAt: r.updatedAt, tags: tagRows,
    ingredients: ri.map((x) => ({ id: x.id, ingredientId: x.ingredientId, quantity: x.quantity, unitId: x.unitId, order: x.order })),
    manualSteps: steps.filter((s) => s.method === "MANUAL").map(toDto),
    machineSteps: steps.filter((s) => s.method === "MACHINE").map(toDto),
  };
}

export function listTags(db: Db, householdId: string): RecipeTagDto[] {
  return db
    .select({ id: tags.id, category: tags.category, nameEn: tags.nameEn, nameDe: tags.nameDe })
    .from(tags)
    .where(eq(tags.householdId, householdId))
    .orderBy(asc(tags.category), asc(tags.nameEn))
    .all();
}

export function listIngredients(db: Db): IngredientLite[] {
  return db
    .select({ id: ingredients.id, nameEn: ingredients.nameEn, nameDe: ingredients.nameDe, category: ingredients.category })
    .from(ingredients)
    .orderBy(asc(ingredients.id))
    .all();
}

export function listUnits(db: Db): UnitLite[] {
  return db
    .select({ id: units.id, nameEn: units.nameEn, nameDe: units.nameDe, abbreviation: units.abbreviation })
    .from(units)
    .orderBy(asc(units.id))
    .all();
}
```

> If the existing `import` block already imports some of these tables/ops, merge rather than duplicate the import lines (duplicate identifiers fail `tsc`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/queries/recipes.test.ts`
Expected: PASS (all recipe-query tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd web && npm run typecheck
git add web/lib/queries/recipes.ts web/lib/queries/recipes.test.ts
git commit -m "feat(web): recipe detail + tag/ingredient/unit queries (TDD)"
```

---

## Task 3: Meal-plan view query

**Files:**
- Create: `web/lib/queries/meal-plan.ts`
- Test: `web/lib/queries/meal-plan.test.ts`

**Interfaces:**
- Consumes: schema `mealPlans`, `planIterations`, `mealPlanEntries`, `mealPlanExcludedTags`, `recipes`, `shoppingLists`, `shoppingListItems`.
- Produces:
  ```ts
  export interface PlanEntryDto {
    id: string; date: string; mealType: string; recipeId: string; recipeTitle: string;
    servings: number; isLeftover: boolean; sourceEntryId: string | null; isLocked: boolean;
  }
  export interface PlanShoppingListDto { id: string; shoppingDate: string | null; itemCount: number }
  export interface PlanIterationDto {
    id: string; startDate: string; endDate: string; status: string;
    entries: PlanEntryDto[]; shoppingLists: PlanShoppingListDto[]; createdAt: Date;
  }
  export interface MealPlanView {
    id: string; iterationWeeks: number; shoppingDays: number[]; // [shoppingDay1, shoppingDay2?] filtered of null
    servings: number; knownRatio: string; defaultLeftoverDays: number; excludedTagIds: string[];
    iterations: PlanIterationDto[]; createdAt: Date;
  }
  export function getMealPlanView(db: Db, householdId: string): MealPlanView | null
  ```

> **Port reference:** `backend/planner/api.py` meal-plans endpoint + `frontend/src/hooks/useMealPlan.ts` + `IterationCard.tsx`. The old `shopping_days` array becomes `shoppingDay1`/`shoppingDay2` columns — recombine into a `shoppingDays: number[]` (drop nulls). There is exactly **one** meal plan per household (`mealPlans.householdId` is unique) — return `null` if none. Iterations sorted **ACTIVE first, then by `startDate` descending** (matches old "active card on top, archived below"). Entries carry their recipe title via a join (the old UI looked titles up from a separate recipe list; we join here). Each iteration's shopping lists include an `itemCount` for the "{{count}} items to grab" preview.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/queries/meal-plan.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households, recipes, mealPlans, planIterations, mealPlanEntries,
  mealPlanExcludedTags, tags, shoppingLists, shoppingListItems, ingredients, units,
} from "@/lib/db/schema";
import { getMealPlanView } from "./meal-plan";

const now = new Date("2026-06-27T12:00:00Z");

function seed() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
  db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
  db.insert(tags).values({ id: "t1", householdId: "h1", category: "DIETARY", nameEn: "Vegan", nameDe: "Vegan" }).run();
  db.insert(recipes).values([
    { id: "r1", householdId: "h1", title: "Pasta", description: "", listType: "KNOWN", defaultServings: 2, createdAt: now, updatedAt: now },
  ]).run();
  db.insert(mealPlans).values({
    id: "mp1", householdId: "h1", iterationWeeks: 1, shoppingDay1: 0, shoppingDay2: 3,
    servings: 2, knownRatio: "0.7", defaultLeftoverDays: 1, createdAt: now,
  }).run();
  db.insert(mealPlanExcludedTags).values({ mealPlanId: "mp1", tagId: "t1" }).run();
  db.insert(planIterations).values([
    { id: "it_old", mealPlanId: "mp1", startDate: "2026-06-01", endDate: "2026-06-07", status: "ARCHIVED", createdAt: now },
    { id: "it_new", mealPlanId: "mp1", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now },
  ]).run();
  db.insert(mealPlanEntries).values({
    id: "e1", iterationId: "it_new", date: "2026-06-22", mealType: "LUNCH",
    recipeId: "r1", servings: 2, isLeftover: false, isLocked: false,
  }).run();
  db.insert(shoppingLists).values({ id: "sl1", iterationId: "it_new", shoppingDate: "2026-06-22", createdAt: now }).run();
  db.insert(shoppingListItems).values([
    { id: "i1", shoppingListId: "sl1", ingredientId: 1, quantity: "200", unitId: 1, isChecked: false },
    { id: "i2", shoppingListId: "sl1", ingredientId: 1, quantity: "100", unitId: 1, isChecked: true },
  ]).run();
  return db;
}

describe("getMealPlanView", () => {
  it("returns null when the household has no plan", () => {
    expect(getMealPlanView(seed(), "h2")).toBeNull();
  });

  it("recombines shopping days and excluded tags", () => {
    const v = getMealPlanView(seed(), "h1")!;
    expect(v.shoppingDays).toEqual([0, 3]);
    expect(v.excludedTagIds).toEqual(["t1"]);
    expect(v.knownRatio).toBe("0.7");
  });

  it("sorts iterations ACTIVE first then by startDate desc", () => {
    const v = getMealPlanView(seed(), "h1")!;
    expect(v.iterations.map((i) => i.id)).toEqual(["it_new", "it_old"]);
  });

  it("joins recipe titles onto entries", () => {
    const v = getMealPlanView(seed(), "h1")!;
    const active = v.iterations[0]!;
    expect(active.entries[0]!.recipeTitle).toBe("Pasta");
  });

  it("counts shopping-list items per iteration", () => {
    const v = getMealPlanView(seed(), "h1")!;
    const active = v.iterations[0]!;
    expect(active.shoppingLists).toEqual([{ id: "sl1", shoppingDate: "2026-06-22", itemCount: 2 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/queries/meal-plan.test.ts`
Expected: FAIL — module/function missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// web/lib/queries/meal-plan.ts
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  mealPlanEntries, mealPlanExcludedTags, mealPlans, planIterations, recipes,
  shoppingListItems, shoppingLists,
} from "@/lib/db/schema";

export interface PlanEntryDto {
  id: string; date: string; mealType: string; recipeId: string; recipeTitle: string;
  servings: number; isLeftover: boolean; sourceEntryId: string | null; isLocked: boolean;
}
export interface PlanShoppingListDto { id: string; shoppingDate: string | null; itemCount: number }
export interface PlanIterationDto {
  id: string; startDate: string; endDate: string; status: string;
  entries: PlanEntryDto[]; shoppingLists: PlanShoppingListDto[]; createdAt: Date;
}
export interface MealPlanView {
  id: string; iterationWeeks: number; shoppingDays: number[]; servings: number;
  knownRatio: string; defaultLeftoverDays: number; excludedTagIds: string[];
  iterations: PlanIterationDto[]; createdAt: Date;
}

export function getMealPlanView(db: Db, householdId: string): MealPlanView | null {
  const plan = db.select().from(mealPlans).where(eq(mealPlans.householdId, householdId)).get();
  if (!plan) return null;

  const excludedTagIds = db
    .select({ tagId: mealPlanExcludedTags.tagId })
    .from(mealPlanExcludedTags)
    .where(eq(mealPlanExcludedTags.mealPlanId, plan.id))
    .all()
    .map((r) => r.tagId);

  const iterationRows = db
    .select()
    .from(planIterations)
    .where(eq(planIterations.mealPlanId, plan.id))
    .all();
  const iterationIds = iterationRows.map((i) => i.id);

  const entryRows = iterationIds.length
    ? db
        .select({
          id: mealPlanEntries.id, iterationId: mealPlanEntries.iterationId, date: mealPlanEntries.date,
          mealType: mealPlanEntries.mealType, recipeId: mealPlanEntries.recipeId,
          recipeTitle: recipes.title, servings: mealPlanEntries.servings,
          isLeftover: mealPlanEntries.isLeftover, sourceEntryId: mealPlanEntries.sourceEntryId,
          isLocked: mealPlanEntries.isLocked,
        })
        .from(mealPlanEntries)
        .innerJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
        .where(inArray(mealPlanEntries.iterationId, iterationIds))
        .orderBy(asc(mealPlanEntries.date))
        .all()
    : [];
  const entriesByIteration = new Map<string, PlanEntryDto[]>();
  for (const e of entryRows) {
    const list = entriesByIteration.get(e.iterationId) ?? [];
    list.push({
      id: e.id, date: e.date, mealType: e.mealType, recipeId: e.recipeId, recipeTitle: e.recipeTitle,
      servings: e.servings, isLeftover: e.isLeftover, sourceEntryId: e.sourceEntryId, isLocked: e.isLocked,
    });
    entriesByIteration.set(e.iterationId, list);
  }

  const listRows = iterationIds.length
    ? db
        .select({
          id: shoppingLists.id, iterationId: shoppingLists.iterationId,
          shoppingDate: shoppingLists.shoppingDate,
          itemCount: sql<number>`count(${shoppingListItems.id})`,
        })
        .from(shoppingLists)
        .leftJoin(shoppingListItems, eq(shoppingListItems.shoppingListId, shoppingLists.id))
        .where(inArray(shoppingLists.iterationId, iterationIds))
        .groupBy(shoppingLists.id)
        .all()
    : [];
  const listsByIteration = new Map<string, PlanShoppingListDto[]>();
  for (const l of listRows) {
    const list = listsByIteration.get(l.iterationId) ?? [];
    list.push({ id: l.id, shoppingDate: l.shoppingDate, itemCount: l.itemCount });
    listsByIteration.set(l.iterationId, list);
  }

  const iterations: PlanIterationDto[] = iterationRows
    .map((i) => ({
      id: i.id, startDate: i.startDate, endDate: i.endDate, status: i.status,
      entries: entriesByIteration.get(i.id) ?? [],
      shoppingLists: listsByIteration.get(i.id) ?? [],
      createdAt: i.createdAt,
    }))
    .sort((a, b) => {
      // ACTIVE first, then startDate descending
      if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : 1;
      return a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0;
    });

  const shoppingDays = [plan.shoppingDay1, plan.shoppingDay2].filter(
    (d): d is number => d !== null && d !== undefined,
  );

  return {
    id: plan.id, iterationWeeks: plan.iterationWeeks, shoppingDays, servings: plan.servings,
    knownRatio: plan.knownRatio, defaultLeftoverDays: plan.defaultLeftoverDays, excludedTagIds,
    iterations, createdAt: plan.createdAt,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/queries/meal-plan.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd web && npm run typecheck
git add web/lib/queries/meal-plan.ts web/lib/queries/meal-plan.test.ts
git commit -m "feat(web): meal-plan view query (TDD)"
```

---

## Task 4: Latest shopping-list query

**Files:**
- Create: `web/lib/queries/shopping.ts`
- Test: `web/lib/queries/shopping.test.ts`

**Interfaces:**
- Consumes: schema `shoppingLists`, `shoppingListItems`, `ingredients`, `units`, `planIterations`, `mealPlans`.
- Produces:
  ```ts
  export interface ShoppingItemDto {
    id: string; ingredientName: string; category: string;
    quantity: string; unitAbbreviation: string; isChecked: boolean;
  }
  export interface ShoppingListView {
    id: string; shoppingDate: string | null; createdAt: Date; items: ShoppingItemDto[];
  }
  export function getLatestShoppingList(
    db: Db, householdId: string, locale: "en" | "de",
  ): ShoppingListView | null
  ```

> **Port reference:** `backend/shopping/api.py` (ordered by `-created_at`; old page took `lists[0]`) + `ShoppingListPage.tsx`. Scope: the shopping list must belong to an iteration of **this household's** meal plan — join `shoppingLists → planIterations → mealPlans` and filter `mealPlans.householdId`. Resolve ingredient name by `locale` (`pickName` logic). Return the most-recent list (`createdAt` desc) or `null`. Item ordering within the list is by ingredient name (the *category grouping* happens in the component, Task 11).

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/queries/shopping.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import {
  households, mealPlans, planIterations, shoppingLists, shoppingListItems, ingredients, units,
} from "@/lib/db/schema";
import { getLatestShoppingList } from "./shopping";

const now = new Date("2026-06-27T12:00:00Z");
const later = new Date("2026-06-28T12:00:00Z");

function seed() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
  db.insert(ingredients).values([
    { id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" },
    { id: 2, nameEn: "Milk", nameDe: "Milch", category: "DAIRY" },
  ]).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g", conversionFactor: "1" }).run();
  db.insert(mealPlans).values({ id: "mp1", householdId: "h1", knownRatio: "0.7", createdAt: now }).run();
  db.insert(planIterations).values({ id: "it1", mealPlanId: "mp1", startDate: "2026-06-22", endDate: "2026-06-28", status: "ACTIVE", createdAt: now }).run();
  db.insert(shoppingLists).values([
    { id: "sl_old", iterationId: "it1", shoppingDate: "2026-06-20", createdAt: now },
    { id: "sl_new", iterationId: "it1", shoppingDate: "2026-06-22", createdAt: later },
  ]).run();
  db.insert(shoppingListItems).values([
    { id: "i1", shoppingListId: "sl_new", ingredientId: 1, quantity: "200", unitId: 1, isChecked: false },
    { id: "i2", shoppingListId: "sl_new", ingredientId: 2, quantity: "1", unitId: 1, isChecked: true },
  ]).run();
  return db;
}

describe("getLatestShoppingList", () => {
  it("returns null when household has no list", () => {
    expect(getLatestShoppingList(seed(), "h2", "en")).toBeNull();
  });

  it("returns the most-recently-created list, scoped to the household", () => {
    const v = getLatestShoppingList(seed(), "h1", "en")!;
    expect(v.id).toBe("sl_new");
  });

  it("resolves ingredient names by locale and carries category/checked", () => {
    const en = getLatestShoppingList(seed(), "h1", "en")!;
    expect(en.items.find((i) => i.id === "i1")).toMatchObject({
      ingredientName: "Tomato", category: "PRODUCE", quantity: "200", unitAbbreviation: "g", isChecked: false,
    });
    const de = getLatestShoppingList(seed(), "h1", "de")!;
    expect(de.items.find((i) => i.id === "i1")!.ingredientName).toBe("Tomate");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/queries/shopping.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
// web/lib/queries/shopping.ts
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  ingredients, mealPlans, planIterations, shoppingListItems, shoppingLists, units,
} from "@/lib/db/schema";

export interface ShoppingItemDto {
  id: string; ingredientName: string; category: string;
  quantity: string; unitAbbreviation: string; isChecked: boolean;
}
export interface ShoppingListView {
  id: string; shoppingDate: string | null; createdAt: Date; items: ShoppingItemDto[];
}

export function getLatestShoppingList(
  db: Db, householdId: string, locale: "en" | "de",
): ShoppingListView | null {
  const list = db
    .select({ id: shoppingLists.id, shoppingDate: shoppingLists.shoppingDate, createdAt: shoppingLists.createdAt })
    .from(shoppingLists)
    .innerJoin(planIterations, eq(planIterations.id, shoppingLists.iterationId))
    .innerJoin(mealPlans, eq(mealPlans.id, planIterations.mealPlanId))
    .where(eq(mealPlans.householdId, householdId))
    .orderBy(desc(shoppingLists.createdAt))
    .get();
  if (!list) return null;

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
    .where(eq(shoppingListItems.shoppingListId, list.id))
    .orderBy(asc(locale === "de" ? ingredients.nameDe : ingredients.nameEn))
    .all();

  return {
    id: list.id, shoppingDate: list.shoppingDate, createdAt: list.createdAt,
    items: itemRows.map((r) => ({
      id: r.id, ingredientName: locale === "de" ? r.nameDe : r.nameEn, category: r.category,
      quantity: r.quantity, unitAbbreviation: r.unitAbbreviation, isChecked: r.isChecked,
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/queries/shopping.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd web && npm run typecheck
git add web/lib/queries/shopping.ts web/lib/queries/shopping.test.ts
git commit -m "feat(web): latest shopping-list query (TDD)"
```

---

## Task 5: Display helpers + i18n key audit

**Files:**
- Create: `web/lib/display/format.ts`
- Test: `web/lib/display/format.test.ts`
- Modify (only if audit finds gaps): `web/lib/i18n/locales/en.json`, `web/lib/i18n/locales/de.json`

**Interfaces:**
- Produces:
  ```ts
  export function formatQuantity(quantity: string): string  // trims trailing zeros: "200.00" -> "200", "1.50" -> "1.5"
  export function pickName(locale: string, row: { nameEn: string; nameDe: string }): string
  export function recipeImageUrl(image: string): string | null  // "" -> null; else "/api/images/" + image (route lands Plan 7)
  export const CATEGORY_ORDER: readonly string[]  // ["PRODUCE","DAIRY","MEAT","PANTRY","FROZEN","OTHER"]
  ```

> `formatQuantity` uses `Decimal` from `@/lib/domain/decimal` so display matches stored precision exactly. Old UI did `parseFloat(quantity)` (lossy) — we improve on that by using Decimal and stripping trailing zeros via `Decimal.toString()` after normalizing. `CATEGORY_ORDER` is the hardcoded grouping order from `ShoppingListPage.tsx`.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/display/format.test.ts
import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER, formatQuantity, pickName, recipeImageUrl } from "./format";

describe("formatQuantity", () => {
  it("strips trailing zeros", () => {
    expect(formatQuantity("200.00")).toBe("200");
    expect(formatQuantity("1.50")).toBe("1.5");
    expect(formatQuantity("0.25")).toBe("0.25");
  });
});

describe("pickName", () => {
  it("picks by locale, defaulting to English", () => {
    const row = { nameEn: "Tomato", nameDe: "Tomate" };
    expect(pickName("de", row)).toBe("Tomate");
    expect(pickName("en", row)).toBe("Tomato");
    expect(pickName("fr", row)).toBe("Tomato");
  });
});

describe("recipeImageUrl", () => {
  it("returns null for empty image, else the api path", () => {
    expect(recipeImageUrl("")).toBeNull();
    expect(recipeImageUrl("recipes/abc.webp")).toBe("/api/images/recipes/abc.webp");
  });
});

describe("CATEGORY_ORDER", () => {
  it("is the fixed shopping grouping order", () => {
    expect(CATEGORY_ORDER).toEqual(["PRODUCE", "DAIRY", "MEAT", "PANTRY", "FROZEN", "OTHER"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run lib/display/format.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// web/lib/display/format.ts
import { Decimal } from "@/lib/domain/decimal";

export function formatQuantity(quantity: string): string {
  // Normalize then strip trailing zeros / trailing dot.
  return new Decimal(quantity).toDecimalPlaces(2).toString();
}

export function pickName(locale: string, row: { nameEn: string; nameDe: string }): string {
  return locale === "de" ? row.nameDe : row.nameEn;
}

export function recipeImageUrl(image: string): string | null {
  if (!image) return null;
  return `/api/images/${image}`;
}

export const CATEGORY_ORDER = ["PRODUCE", "DAIRY", "MEAT", "PANTRY", "FROZEN", "OTHER"] as const;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run lib/display/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Audit i18n keys (no code unless a gap is found)**

The dictionaries already contain `recipes.*`, `plan.*`, `shopping.*`, `steps.*`, `tags.*` (Plan 4 copied them). Verify the specific keys the upcoming pages use are present in **both** `en.json` and `de.json`:

Run (lists missing keys; should print nothing):
```bash
cd web && node -e '
const en=require("./lib/i18n/locales/en.json"), de=require("./lib/i18n/locales/de.json");
const need=["recipes.title","recipes.known","recipes.toTry","recipes.newRecipe","recipes.sortLabel","recipes.sortNameAZ","recipes.sortNameZA","recipes.sortNewest","recipes.sortUpdated","recipes.noRecipesTitle","recipes.noRecipesSubtitle","recipes.noSearchResults","recipes.noSearchResultsSubtitle","recipes.addFirstRecipe","recipes.servings","recipes.prepTime","recipes.cookTime","recipes.minutes","recipes.editRecipe","recipes.moveToKnown","recipes.moveToTry","steps.manualSteps","steps.machineSteps","tags.filter","common.search","common.loading","plan.title","plan.noPlanTitle","plan.noPlanSubtitle","plan.setup","plan.updateConfig","plan.iterationEnded","plan.generateNext","plan.noActiveTitle","plan.noActiveSubtitle","plan.pastIterations","plan.lunch","plan.dinner","plan.coldDish","plan.leftover","plan.today","plan.shoppingPreview","plan.renew","shopping.title","shopping.emptyTitle","shopping.emptySubtitle","shopping.goToPlan","shopping.linkedToPlan","shopping.uncheckAll","shopping.allDoneTitle","shopping.allDoneSubtitle","shopping.backToPlan","shopping.itemCount","shopping.categories.PRODUCE","shopping.categories.DAIRY","shopping.categories.MEAT","shopping.categories.PANTRY","shopping.categories.FROZEN","shopping.categories.OTHER"];
const get=(o,k)=>k.split(".").reduce((a,p)=>a&&a[p],o);
for(const k of need){ if(get(en,k)===undefined) console.log("MISSING en:",k); if(get(de,k)===undefined) console.log("MISSING de:",k); }
'
```

If any key prints as MISSING, add it to **both** locale files with a faithful translation copied from the old `frontend/src/i18n/locales/{en,de}.json` (find the same key there). If nothing prints, no dictionary edit is needed.

- [ ] **Step 6: Commit**

```bash
cd web && npm run typecheck
git add web/lib/display/ web/lib/i18n/locales/ 2>/dev/null
git commit -m "feat(web): display helpers (formatQuantity/pickName/image/category order) + i18n audit"
```

---

## Task 6: RecipeCard + list skeleton components

**Files:**
- Create: `web/components/recipes/recipe-card.tsx` (Server Component)
- Create: `web/components/recipes/recipe-list-skeleton.tsx` (Server Component)

**Interfaces:**
- Consumes: `RecipeSummary` (`@/lib/queries/recipes`); `pickName`, `recipeImageUrl` (`@/lib/display/format`); `Badge`, `Card` (`@/components/ui/*`); `Skeleton` (`@/components/ui/skeleton`); lucide icons.
- Produces:
  ```ts
  export function RecipeCard(props: { recipe: RecipeSummary; locale: string; t: (k: string, v?: Record<string, unknown>) => string }): JSX.Element
  export function RecipeListSkeleton(): JSX.Element
  ```

> **Port reference:** `frontend/src/components/RecipeCard.tsx`. Port the markup/Tailwind structure faithfully but as a Server Component: a `Card` whose left region is a Next.js `<Link href={\`/recipes/${recipe.id}\`}>` containing the image (16×16 thumbnail via `recipeImageUrl`; placeholder `BookOpen` icon when `null`), the title (`h3`, truncated), a metadata line (prep/cook minutes when set + `recipe.servings`), and tag `Badge`s (color by `tag.category`; resolve label with `pickName(locale, tag)`). The old delete button is a **read-state placeholder** — render the trash `Button` (`variant="ghost"`, `disabled`) with a `// TODO(plan-6): wire delete`. `t`/`locale` are passed from the parent RSC (this component takes no async i18n itself). Use `t("recipes.minutes")` for the minute suffix, `recipe.defaultServings` for servings.

- [ ] **Step 1: Implement `RecipeListSkeleton`**

```tsx
// web/components/recipes/recipe-list-skeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";

export function RecipeListSkeleton(): JSX.Element {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement `RecipeCard`** — port `frontend/src/components/RecipeCard.tsx` markup into this file as a Server Component, following the spec above. Resolve tag label via `pickName(locale, tag)`; image via `recipeImageUrl(recipe.image)`; wrap the clickable region in `next/link`. Render the disabled delete button placeholder.

- [ ] **Step 3: Typecheck**

Run: `cd web && npm run typecheck`
Expected: PASS (no usage yet, but types must resolve).

- [ ] **Step 4: Commit**

```bash
git add web/components/recipes/recipe-card.tsx web/components/recipes/recipe-list-skeleton.tsx
git commit -m "feat(web): RecipeCard + list skeleton (RSC, read-only)"
```

---

## Task 7: Recipes list page (RSC) + filter island

**Files:**
- Replace: `web/app/(app)/recipes/page.tsx`
- Create: `web/components/recipes/recipe-filters.tsx` (`"use client"` island)

**Interfaces:**
- Consumes: `requireHousehold` (`@/lib/auth/session`), `getI18n` (`@/lib/i18n/server`), `db` (`@/lib/db`), `listRecipes`, `listTags` (`@/lib/queries/recipes`), `RecipeCard`, `RecipeListSkeleton`, `EmptyState` (`@/components/ui/empty-state`), `pickName`.
- The page reads `searchParams` and maps them to `ListRecipesOpts`.

> **Port reference:** `frontend/src/pages/RecipeListPage.tsx`. **RSC adaptation of interactivity:** the old client-side tabs/search/sort/filter become **URL search params** the Server Component reads:
> - `?list=KNOWN|TO_TRY` (default `KNOWN`) → `listType`.
> - `?q=<text>` → `search`.
> - `?tags=<id,id>` → `tagIds` (split on comma).
> - `?sort=name-asc|name-desc|newest|updated` (default `name-asc`) → applied as a post-query in-memory sort of `items` (the old app sorted client-side; the query already orders by title, re-sort here for the other modes).
>
> The `RecipeFilters` client island renders the tabs (Favourites/Want-to-try), the search input (debounced; on change it `router.push`es with updated params via `useSearchParams`/`usePathname`/`useRouter` from `next/navigation`), the sort `<select>`, and a tag filter trigger. Filtering re-renders the page server-side. Infinite scroll is **replaced** by a simple "Load more" link that increments `?offset` (document this as an intentional RSC simplification; accumulation across offsets is out of scope — show the page slice + a Load-more link when `items.length + offset < totalCount`). The Create/Generate buttons render as read-state placeholders (`disabled`, `// TODO(plan-6)` / `// TODO(plan-7): AI`).

- [ ] **Step 1: Implement `RecipeFilters` client island**

Build `web/components/recipes/recipe-filters.tsx` starting with `"use client"`. It takes `{ list, q, sort, tags, allTags, locale, t }` props, renders the tab toggle, search input, sort select, and tag filter trigger, and on any change computes a new query string and calls `router.push(\`${pathname}?${params}\`)`. Use `useRouter`, `usePathname`, `useSearchParams` from `next/navigation`. Tag filter UI: reuse `Dialog`/`ToggleGroup` primitives; resolve labels via `pickName(locale, tag)`. Debounce the search input ~300ms.

- [ ] **Step 2: Implement the page**

```tsx
// web/app/(app)/recipes/page.tsx
import { BookOpen, Search } from "lucide-react";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { listRecipes, listTags, type RecipeSummary } from "@/lib/queries/recipes";
import { EmptyState } from "@/components/ui/empty-state";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { RecipeFilters } from "@/components/recipes/recipe-filters";

const PAGE = 20;

function sortItems(items: RecipeSummary[], sort: string): RecipeSummary[] {
  const arr = [...items];
  switch (sort) {
    case "name-desc": return arr.sort((a, b) => b.title.localeCompare(a.title));
    case "newest": return arr.sort((a, b) => +b.createdAt - +a.createdAt);
    case "updated": return arr.sort((a, b) => +b.updatedAt - +a.updatedAt);
    default: return arr.sort((a, b) => a.title.localeCompare(b.title));
  }
}

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
  const offset = typeof sp.offset === "string" ? Math.max(0, parseInt(sp.offset, 10) || 0) : 0;

  const allTags = listTags(db, householdId);
  const { items, totalCount } = listRecipes(db, householdId, {
    listType: list, search: q, tagIds, limit: PAGE, offset,
  });
  const sorted = sortItems(items, sort);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("recipes.title")}</h1>
      <RecipeFilters list={list} q={q} sort={sort} tags={tagIds} allTags={allTags} locale={locale} t={t} />

      {sorted.length === 0 ? (
        q ? (
          <EmptyState icon={Search} title={t("recipes.noSearchResults")} subtitle={t("recipes.noSearchResultsSubtitle")} />
        ) : (
          <EmptyState icon={BookOpen} title={t("recipes.noRecipesTitle")} subtitle={t("recipes.noRecipesSubtitle")} />
        )
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => (
            <RecipeCard key={r.id} recipe={r} locale={locale} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
```

> Adjust `EmptyState` prop names to match the actual component signature (the Plan-4 `EmptyState` — check `web/components/ui/empty-state.tsx`; if it takes `action`, omit it here since create is Plan 6). Confirm `t`'s type is assignable to `RecipeCard`/`RecipeFilters` props (the getI18n `t` signature).

- [ ] **Step 3: Verify**

```bash
cd web && npm run typecheck && npm run build
```
Expected: typecheck clean; build succeeds and lists `/recipes` as a route. (No new vitest — pages are verified by build.)

- [ ] **Step 4: Commit**

```bash
git add web/app/(app)/recipes/page.tsx web/components/recipes/recipe-filters.tsx
git commit -m "feat(web): recipes list page (RSC) with URL-driven filters"
```

---

## Task 8: Recipe detail page (RSC, read-only)

**Files:**
- Create: `web/app/(app)/recipes/[id]/page.tsx`
- Create: `web/components/recipes/recipe-detail.tsx` (Server Component)

**Interfaces:**
- Consumes: `requireHousehold`, `getI18n`, `db`, `getRecipe`, `listIngredients`, `listUnits` (`@/lib/queries/recipes`); `pickName`, `formatQuantity`, `recipeImageUrl`; `notFound` (`next/navigation`); UI primitives + lucide icons.

> **Port reference:** `frontend/src/pages/RecipeDetailPage.tsx` — but note the old page is an **editor**. Plan 5 renders a **read-only detail view** (editing is Plan 6). Render: back link to `/recipes`; image (or placeholder); title (`h1`); metadata row (servings / prep / cook minutes); ingredients list (`{formatQuantity(qty)} {unit.abbreviation} {pickName(locale, ingredient)}` — resolve ingredient/unit via maps built from `listIngredients`/`listUnits`); manual steps section (`steps.manualSteps` heading; numbered `instruction`s); machine steps section (`steps.machineSteps`; show `programType` via `t(\`steps.programs.${programType}\`)` plus params like temperature/duration/speed when set); tag badges. Action buttons (Edit/Cook/Share/Move/Delete) render as **disabled placeholders** with `// TODO(plan-6)`. If `getRecipe` returns `null`, call `notFound()`.

- [ ] **Step 1: Implement `RecipeDetail`** — Server Component taking `{ recipe: RecipeDetail; ingredientsById: Map<number, IngredientLite>; unitsById: Map<number, UnitLite>; locale: string; t; }`. Build the read-only markup per the spec, porting structure from the old detail page (read regions only).

- [ ] **Step 2: Implement the page**

```tsx
// web/app/(app)/recipes/[id]/page.tsx
import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getRecipe, listIngredients, listUnits } from "@/lib/queries/recipes";
import { RecipeDetail } from "@/components/recipes/recipe-detail";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { householdId } = await requireHousehold();
  const { locale, t } = await getI18n();

  const recipe = getRecipe(db, householdId, id);
  if (!recipe) notFound();

  const ingredientsById = new Map(listIngredients(db).map((i) => [i.id, i]));
  const unitsById = new Map(listUnits(db).map((u) => [u.id, u]));

  return (
    <RecipeDetail
      recipe={recipe}
      ingredientsById={ingredientsById}
      unitsById={unitsById}
      locale={locale}
      t={t}
    />
  );
}
```

- [ ] **Step 3: Verify**

```bash
cd web && npm run typecheck && npm run build
```
Expected: clean; `/recipes/[id]` appears as a dynamic route.

- [ ] **Step 4: Commit**

```bash
git add web/app/(app)/recipes/[id]/page.tsx web/components/recipes/recipe-detail.tsx
git commit -m "feat(web): read-only recipe detail page (RSC)"
```

---

## Task 9: Meal plan page (RSC) + iteration card + skeleton

**Files:**
- Replace: `web/app/(app)/plan/page.tsx`
- Create: `web/components/plan/iteration-card.tsx` (`"use client"` — collapse state)
- Create: `web/components/plan/meal-plan-skeleton.tsx` (Server Component)

**Interfaces:**
- Consumes: `requireHousehold`, `getI18n`, `db`, `getMealPlanView` + its DTO types; `addDays`, `weekday` (`@/lib/domain/dates`); UI primitives; lucide `Calendar`, `ShoppingCart`, `ChevronDown`.

> **Port reference:** `frontend/src/pages/MealPlanPage.tsx` + `frontend/src/components/IterationCard.tsx`. The page (RSC) calls `getMealPlanView`; if `null`, render `EmptyState` (`Calendar`, `plan.noPlanTitle/Subtitle`) with the setup button as a **disabled placeholder** (`// TODO(plan-6): generate`). Otherwise: split iterations into the active one (`iterations[0]` when its `status==="ACTIVE"`) and archived rest. Render an "iteration ended" banner when the active iteration's `endDate < todayIso` (compute `todayIso` once at top of the RSC; see note). Render the active `IterationCard` expanded, then a `plan.pastIterations` heading and the archived cards collapsed.
>
> `IterationCard` is a client island (it needs collapse toggling and "today" highlighting). It takes `{ iteration: PlanIterationDto; shoppingDays: number[]; isArchived: boolean; todayIso: string; locale: string; t; }`. It generates the per-day rows by looping `addDays(startDate, n)` from `startDate` to `endDate` inclusive, marks today (`date === todayIso`), marks shopping days (`shoppingDays.includes(weekday(date))` — `weekday` is Python-style Mon=0, matching `shoppingDay*`), shows the shopping preview link (`/shopping`) with `t("plan.shoppingPreview", { count })` using the matching shopping list's `itemCount`, renders the LUNCH entry (recipe title + `plan.leftover` suffix when `isLeftover`), and a static dinner row (`plan.dinner` / `plan.coldDish`). The Refresh button is a **disabled placeholder** (`// TODO(plan-6)`). Date formatting: `new Date(date + "T00:00:00").toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })`.

> **"Today" note:** computing "today" on the server is fine in RSC; pass `todayIso` (e.g. `new Date().toISOString().slice(0,10)`) from the page into the client `IterationCard` as a prop so server and client agree (avoids hydration drift). Do not call `new Date()` inside the client component's render.

- [ ] **Step 1: Implement `MealPlanSkeleton`** (a few `Skeleton` blocks mimicking the iteration card).

- [ ] **Step 2: Implement `IterationCard`** client island per the spec (port `IterationCard.tsx` structure; collapse via `useState`; read-only).

- [ ] **Step 3: Implement the page**

```tsx
// web/app/(app)/plan/page.tsx
import { Calendar } from "lucide-react";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getMealPlanView } from "@/lib/queries/meal-plan";
import { EmptyState } from "@/components/ui/empty-state";
import { IterationCard } from "@/components/plan/iteration-card";

export default async function PlanPage() {
  const { householdId } = await requireHousehold();
  const { locale, t } = await getI18n();
  const todayIso = new Date().toISOString().slice(0, 10);

  const plan = getMealPlanView(db, householdId);
  if (!plan || plan.iterations.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("plan.title")}</h1>
        <EmptyState icon={Calendar} title={t("plan.noPlanTitle")} subtitle={t("plan.noPlanSubtitle")} />
      </div>
    );
  }

  const [active, ...archived] = plan.iterations;
  const ended = active && active.endDate < todayIso;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("plan.title")}</h1>
      {ended && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm dark:border-orange-900 dark:bg-orange-950">
          {t("plan.iterationEnded")}
        </div>
      )}
      {active && (
        <IterationCard
          iteration={active}
          shoppingDays={plan.shoppingDays}
          isArchived={false}
          todayIso={todayIso}
          locale={locale}
          t={t}
        />
      )}
      {archived.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">{t("plan.pastIterations")}</h2>
          {archived.map((it) => (
            <IterationCard
              key={it.id}
              iteration={it}
              shoppingDays={plan.shoppingDays}
              isArchived
              todayIso={todayIso}
              locale={locale}
              t={t}
            />
          ))}
        </section>
      )}
    </div>
  );
}
```

> A function prop (`t`) passed from a Server Component into a Client Component is **not serializable** across the RSC boundary. If `next build` complains, the fix is: pass the resolved **dictionary slice** or precomputed strings as props instead of `t`, OR make `IterationCard` call `useT()` itself (it is a client component, so `useT()` works). **Prefer `useT()` inside the client islands** (`IterationCard`, `RecipeFilters`, modal, `ShoppingCategory`) and drop the `t`/`locale` props for those client components. Keep passing `t`/`locale` only to Server sub-components (`RecipeCard`, `RecipeDetail`). Apply this rule throughout Tasks 7/9/10/11.

- [ ] **Step 4: Verify**

```bash
cd web && npm run typecheck && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add web/app/(app)/plan/page.tsx web/components/plan/iteration-card.tsx web/components/plan/meal-plan-skeleton.tsx
git commit -m "feat(web): meal plan page (RSC) + iteration card"
```

---

## Task 10: Read-only recipe preview modal (plan)

**Files:**
- Create: `web/components/plan/recipe-preview-modal.tsx` (`"use client"`)
- Modify: `web/components/plan/iteration-card.tsx` (wire the lunch entry to open the modal)
- Create: `web/app/api/recipes/[id]/preview/route.ts` (read-only JSON endpoint for the modal to fetch a recipe on demand)

**Interfaces:**
- The modal fetches `GET /api/recipes/[id]/preview` which returns the `RecipeDetail` JSON (scoped via `requireHousehold`), then renders a scaled ingredient list using `scaleQuantity` (`@/lib/domain/recipes/scaling`) for the plan entry's `servings`.

> **Port reference:** `frontend/src/components/RecipePreviewModal.tsx`. Clicking a lunch entry opens a `Dialog` showing the recipe title, scaled ingredients (`scaleQuantity(quantity, entryServings, recipe.defaultServings)` then `formatQuantity`), and steps. Since the modal is a client island it cannot call the DB directly — add a thin **read-only** route handler that wraps `getRecipe` with `requireHousehold` scoping and returns JSON. This is the one HTTP endpoint this plan adds (justified: client-side on-demand fetch).

- [ ] **Step 1: Implement the route handler**

```ts
// web/app/api/recipes/[id]/preview/route.ts
import { NextResponse } from "next/server";
import { requireHousehold } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getRecipe } from "@/lib/queries/recipes";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { householdId } = await requireHousehold();
  const recipe = getRecipe(db, householdId, id);
  if (!recipe) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(recipe);
}
```

> Confirm `requireHousehold()` behaves sanely in a route handler (it uses `next/headers`/cookies — valid in route handlers). If it `redirect()`s on missing auth, that's acceptable here (the user is always authed inside `(app)`).

- [ ] **Step 2: Implement `RecipePreviewModal`** — client component taking `{ recipeId, servings, open, onOpenChange }`. On open, `fetch(\`/api/recipes/${recipeId}/preview\`)`, store in state, render scaled ingredients + steps in a `Dialog`. Use `useT()` for labels, `scaleQuantity` + `formatQuantity` for amounts.

- [ ] **Step 3: Wire into `IterationCard`** — make the lunch entry a button that sets `previewState = { recipeId, servings }` and opens the modal.

- [ ] **Step 4: Verify**

```bash
cd web && npm run typecheck && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add web/components/plan/recipe-preview-modal.tsx web/components/plan/iteration-card.tsx "web/app/api/recipes/[id]/preview/route.ts"
git commit -m "feat(web): read-only recipe preview modal on meal plan"
```

---

## Task 11: Shopping list page (RSC) + category sections

**Files:**
- Replace: `web/app/(app)/shopping/page.tsx`
- Create: `web/components/shopping/shopping-category.tsx` (`"use client"` — collapse)
- Create: `web/components/shopping/shopping-list-skeleton.tsx` (Server Component)

**Interfaces:**
- Consumes: `requireHousehold`, `getI18n`, `db`, `getLatestShoppingList` + `ShoppingItemDto`; `CATEGORY_ORDER`, `formatQuantity`; UI primitives; lucide `ShoppingCart`, `CheckCircle`, `ChevronDown`.

> **Port reference:** `frontend/src/pages/ShoppingListPage.tsx` + `frontend/src/components/ShoppingCategory.tsx`. The page (RSC) calls `getLatestShoppingList(db, householdId, locale)`. If `null` → `EmptyState` (`ShoppingCart`, `shopping.emptyTitle/Subtitle`) with a link to `/plan` (`shopping.goToPlan`). If all items `isChecked` → "all done" `EmptyState` (`CheckCircle`, `shopping.allDoneTitle/Subtitle`, link `/plan`). Otherwise: an info bar (`shopping.linkedToPlan` + a **disabled** Reset button `// TODO(plan-6)`), then group items by `category` and render a `ShoppingCategory` for each non-empty category **in `CATEGORY_ORDER`**.
>
> `ShoppingCategory` (client, collapse) takes `{ category: string; items: ShoppingItemDto[] }`, calls `useT()`, renders a collapsible header (`t(\`shopping.categories.${category}\`)` + `t("shopping.itemCount", { checked, total })`), and rows sorted unchecked-first. Each row: a checkbox reflecting `isChecked` (**read-only — `disabled` or non-interactive; `// TODO(plan-6): toggle`**), then `{formatQuantity(quantity)} {unitAbbreviation} {ingredientName}`, with checked rows shown struck-through + muted.

- [ ] **Step 1: Implement `ShoppingListSkeleton`.**

- [ ] **Step 2: Implement `ShoppingCategory`** client island per spec (read-only checkboxes).

- [ ] **Step 3: Implement the page**

```tsx
// web/app/(app)/shopping/page.tsx
import { CheckCircle, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getLatestShoppingList, type ShoppingItemDto } from "@/lib/queries/shopping";
import { EmptyState } from "@/components/ui/empty-state";
import { ShoppingCategory } from "@/components/shopping/shopping-category";
import { CATEGORY_ORDER } from "@/lib/display/format";

export default async function ShoppingPage() {
  const { householdId } = await requireHousehold();
  const { locale, t } = await getI18n();
  const list = getLatestShoppingList(db, householdId, locale as "en" | "de");

  if (!list || list.items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("shopping.title")}</h1>
        <EmptyState icon={ShoppingCart} title={t("shopping.emptyTitle")} subtitle={t("shopping.emptySubtitle")} />
      </div>
    );
  }

  if (list.items.every((i) => i.isChecked)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("shopping.title")}</h1>
        <EmptyState icon={CheckCircle} title={t("shopping.allDoneTitle")} subtitle={t("shopping.allDoneSubtitle")} />
      </div>
    );
  }

  const byCategory = new Map<string, ShoppingItemDto[]>();
  for (const item of list.items) {
    const arr = byCategory.get(item.category) ?? [];
    arr.push(item);
    byCategory.set(item.category, arr);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("shopping.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("shopping.linkedToPlan")}</p>
      <div className="space-y-3">
        {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => (
          <ShoppingCategory key={c} category={c} items={byCategory.get(c)!} />
        ))}
      </div>
    </div>
  );
}
```

> If an item's `category` is not in `CATEGORY_ORDER`, fold it into `OTHER` before grouping (defensive — old data may carry unexpected categories).

- [ ] **Step 4: Verify**

```bash
cd web && npm run typecheck && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add web/app/(app)/shopping/page.tsx web/components/shopping/shopping-category.tsx web/components/shopping/shopping-list-skeleton.tsx
git commit -m "feat(web): shopping list page (RSC), category sections (read-only)"
```

---

## Task 12: Whole-plan integration verification

**Files:**
- Modify (only if a check fails): any of the above.

**Interfaces:** none (verification task).

- [ ] **Step 1: Full test suite**

Run: `cd web && npm test`
Expected: all vitest tests pass (the ~176 from Plan 4 + the new query/format tests). Record the count.

- [ ] **Step 2: Typecheck**

Run: `cd web && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Production build + route inventory**

Run: `cd web && npm run build`
Expected: build succeeds; route list includes `/recipes`, `/recipes/[id]`, `/plan`, `/shopping`, and `/api/recipes/[id]/preview`. Confirm none of the four feature routes is the old placeholder.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `cd web && npm run dev`, then with a logged-in onboarded household (seed via the data migration or onboarding flow), visit each page and confirm:
- `/recipes` lists recipes; tabs/search/sort change the URL and re-render; empty + no-search-results states show when expected.
- `/recipes/<id>` renders read-only detail (ingredients/steps/tags); a foreign/missing id 404s.
- `/plan` shows the active iteration with per-day rows, today highlight, shopping preview counts; clicking a lunch entry opens the preview modal with scaled amounts; archived plans collapse.
- `/shopping` groups items by category in fixed order; checked items struck-through; all-checked → all-done state; no list → empty state linking to `/plan`.
- EN/DE: switching language in settings re-localizes all four pages.

> Record any defects as carry-forward; do not fix mutation-related gaps (those are Plan 6 by design).

- [ ] **Step 5: Update progress ledger + memory; commit**

Append a "Plan 5" section to `.superpowers/sdd/progress.md` (per-task commits, final test count, carry-forward for Plan 6). Update the `nextjs-migration` memory file's status line. Commit:

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs: Plan 5 (read pages) progress ledger + carry-forward"
```

---

## Self-Review

**1. Spec coverage** (build-order item 4 "Read pages as RSC: recipes, planner, shopping"):
- Recipes list → Tasks 1, 6, 7. Recipe detail → Tasks 2, 8. Planner → Tasks 3, 9, 10. Shopping → Tasks 4, 11. Shared (display/i18n) → Task 5. Integration → Task 12. ✅ All three read surfaces + detail covered.
- Spec "all domain logic via `lib/domain`" → scaling used in Task 10 (preview), aggregation **not** re-run here (shopping lists are read from DB; generation is Plan 6). ✅ consistent with read-only scope.
- Spec "household scoping helper enforces filter" → every query takes `householdId`; pages call `requireHousehold()`. ✅
- Spec "decimals never touch JS number" → `formatQuantity`/`scaleQuantity` use Decimal; quantities are `string` throughout DTOs. ✅

**2. Placeholder scan:** Query-layer + helper tasks contain complete, runnable code with concrete tests. UI tasks intentionally cite exact old files to port (project-established "port verbatim" pattern from Plan 4) plus concrete page code, exact prop shapes, exact i18n keys, and exact data wiring — no "add error handling"/"TBD" vagueness. The read-state placeholders for mutation controls are explicitly scoped to Plan 6 (not vague TODOs but deliberate boundary). ✅

**3. Type consistency:** `RecipeSummary`/`RecipeDetail`/`RecipeTagDto` defined in Task 1–2 and reused in 6/7/8; `PlanIterationDto`/`PlanEntryDto` (Task 3) reused in 9/10; `ShoppingItemDto` (Task 4) reused in 11; `formatQuantity`/`pickName`/`recipeImageUrl`/`CATEGORY_ORDER` (Task 5) reused in 6/8/10/11. Query signatures `(db, householdId, …)` consistent. The `t`-across-RSC-boundary hazard is called out in Task 9 with the resolution rule (client islands use `useT()`; only Server sub-components receive `t`). ✅

**Open verification deferred to execution (flagged in-plan, not gaps):**
- Exact `cookingSteps.method` values (`"MANUAL"`/`"MACHINE"`) — Task 2 step instructs confirming against schema/migration before finalizing the test.
- `EmptyState` exact prop names — Task 7 step instructs checking `web/components/ui/empty-state.tsx`.
- Whether `requireHousehold()` is safe in a route handler — Task 10 step instructs confirming.
