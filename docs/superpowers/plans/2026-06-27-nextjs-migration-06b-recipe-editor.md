# Next.js Migration — Plan 6b: Recipe Editor + Tag Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the recipe create/edit editor in the Next.js app (`web/`) plus full tag management (CRUD + reset + 37 default seed) and ingredient auto-create, writing directly to the Drizzle/SQLite DB.

**Architecture:** Pure-ish service functions in `lib/recipes/` are the testable core (TDD with `createTestDb`). Thin server actions in `app/(app)/actions.ts` wrap them in `withHousehold` and return the `Result<T>` union, revalidating affected paths. Client islands (`react-hook-form`, `@dnd-kit`) receive only serializable props and use `useT()`. Replicates the Django backend's write/seed semantics (`backend/recipes/`).

**Tech Stack:** Next.js 15 (App Router, RSC + server actions), Drizzle ORM + better-sqlite3 (synchronous), react-hook-form + zod, @dnd-kit, Vitest, Tailwind, custom i18n (`useT`/`getI18n`).

## Global Constraints

- **Direct DB writes** via Drizzle — the app does NOT call the Django API. Django (`backend/recipes/`) is the behavioral source of truth only.
- **better-sqlite3 is synchronous:** services use `.get()`/`.all()/`.run()` and `db.transaction(fn)` (no `await` on db ops). Match existing `lib/recipes/mutations.ts`.
- **Auth/ownership:** every write is household-scoped. Missing/cross-tenant → `throw new AuthError(404, ...)`. Validation failures → `throw new AuthError(422, ...)`. These surface through `Result` via `fail()` in `lib/actions/result.ts`.
- **Server actions** live in `app/(app)/actions.ts`, are `"use server"`, wrap services in `withHousehold`, and only `revalidatePath(...)` when `res.ok`.
- **Client islands** are `"use client"`, call `useT()` themselves, receive only serializable props (no functions/Maps across the boundary), and toast on `!res.ok`.
- **i18n parity:** any key added to `lib/i18n/locales/en.json` MUST be added to `de.json` with identical key structure. No orphan keys.
- **Quantities are strings** in the DB and payloads (decimal precision preserved); use the `Decimal` wrapper (`lib/domain/decimal.ts`) for arithmetic/validation only.
- **Out of scope (→ Plan 7):** recipe image upload/generate/delete, AI generation, bulk-create.
- **Tests:** service logic is TDD (red→green→commit). UI-island tasks are verified by `npx tsc --noEmit`, `npm test` (existing suite stays green), and `npm run build`, consistent with Plan 6's UI tasks.

---

## File Structure

**Create:**
- `web/lib/recipes/tag-defaults.ts` — the 37 default tags (EN+DE × 4 categories) + `DEFAULT_TAGS` constant.
- `web/lib/recipes/tags.ts` — `createTag`, `updateTag`, `deleteTag`, `resetTags`, `seedDefaultTags`.
- `web/lib/recipes/tags.test.ts` — tag service tests.
- `web/lib/recipes/ingredients.ts` — `createIngredient`.
- `web/lib/recipes/ingredients.test.ts` — ingredient service tests.
- `web/lib/recipes/upsert.ts` — `upsertRecipe` + payload input types.
- `web/lib/recipes/upsert.test.ts` — upsert tests.
- `web/lib/schemas/recipe.ts` — zod schema + inferred form types for the editor.
- `web/app/(app)/recipes/new/page.tsx` — create route (server component).
- `web/app/(app)/recipes/[id]/edit/page.tsx` — edit route (server component).
- `web/components/recipes/recipe-editor.tsx` — the form island (orchestrator).
- `web/components/recipes/editor/ingredient-rows.tsx` — ingredient list + picker.
- `web/components/recipes/editor/step-editor.tsx` — manual/machine step list + dnd reorder.
- `web/components/recipes/editor/sortable-step.tsx` — single draggable step card.
- `web/components/recipes/editor/program-step-form.tsx` — machine program selector + params.
- `web/components/recipes/editor/step-ingredient-allocator.tsx` — per-step ingredient allocation.
- `web/components/recipes/editor/tag-selector.tsx` — grouped multi-select + inline create.
- `web/components/recipes/editor/build-payload.ts` — pure form-values → `UpsertRecipeInput` mapper.
- `web/components/recipes/editor/build-payload.test.ts` — mapper tests.
- `web/components/recipes/editor/to-initial-values.ts` — pure `RecipeDetail` → form-values mapper (edit).
- `web/components/recipes/editor/to-initial-values.test.ts` — mapper tests.
- `web/app/(app)/settings/tags/page.tsx` — tag management route (server component).
- `web/app/(app)/settings/tags/tag-management-client.tsx` — tag management island.

**Modify:**
- `web/lib/households/manage.ts` — implement `seedDefaultTags` (delegate to `lib/recipes/tags.ts`).
- `web/app/(app)/actions.ts` — add `saveRecipeAction`, `createIngredientAction`, `createTagAction`, `updateTagAction`, `deleteTagAction`, `resetTagsAction`.
- `web/components/recipes/recipe-detail-actions.tsx` (and/or `recipe-card`/list) — point Edit/Add affordances at the new routes (they currently 404).
- `web/app/(app)/settings/settings-client.tsx` (or settings page) — link to `/settings/tags`.
- `web/lib/i18n/locales/en.json` + `de.json` — editor + tag-management keys; remove orphans.
- Shopping-days validation component — add `aria-invalid`.

---

## Task 1: Default tags data + `seedDefaultTags`

**Files:**
- Create: `web/lib/recipes/tag-defaults.ts`
- Create: `web/lib/recipes/tags.ts` (start with `seedDefaultTags` only)
- Create: `web/lib/recipes/tags.test.ts`
- Modify: `web/lib/households/manage.ts`

**Interfaces:**
- Produces: `DEFAULT_TAGS: Record<string, [string, string][]>` (category → list of `[nameEn, nameDe]`), `DEFAULT_TAG_COUNT: number` (= 37); `seedDefaultTags(db: Db, householdId: string): void` (idempotent).
- Consumes: `tags` table from `lib/db/schema.ts`; `Db` from `lib/db`.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/recipes/tags.test.ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { households, tags } from "@/lib/db/schema";
import { seedDefaultTags } from "./tags";
import { DEFAULT_TAG_COUNT } from "./tag-defaults";

const now = new Date("2026-06-27T12:00:00Z");

function seedHousehold() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  return db;
}

describe("seedDefaultTags", () => {
  it("seeds all default tags marked is_default", () => {
    const db = seedHousehold();
    seedDefaultTags(db, "h1");
    const rows = db.select().from(tags).where(eq(tags.householdId, "h1")).all();
    expect(rows).toHaveLength(DEFAULT_TAG_COUNT);
    expect(rows.every((r) => r.isDefault)).toBe(true);
  });

  it("is idempotent — running twice does not duplicate", () => {
    const db = seedHousehold();
    seedDefaultTags(db, "h1");
    seedDefaultTags(db, "h1");
    const rows = db.select().from(tags).where(eq(tags.householdId, "h1")).all();
    expect(rows).toHaveLength(DEFAULT_TAG_COUNT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/recipes/tags.test.ts`
Expected: FAIL — cannot import `./tags` / `./tag-defaults`.

- [ ] **Step 3: Create the defaults data (ported verbatim from `backend/recipes/tag_defaults.py`)**

```ts
// web/lib/recipes/tag-defaults.ts
// Ported verbatim from backend/recipes/tag_defaults.py — keep in sync.
export const DEFAULT_TAGS: Record<string, [string, string][]> = {
  DIETARY: [
    ["Vegan", "Vegan"],
    ["Vegetarian", "Vegetarisch"],
    ["Kosher", "Koscher"],
    ["Halal", "Halal"],
    ["Gluten-Free", "Glutenfrei"],
    ["Dairy-Free", "Laktosefrei"],
    ["Low-Carb", "Low-Carb"],
    ["Nut-Free", "Nussfrei"],
    ["Whole30", "Whole30"],
    ["Paleo", "Paleo"],
  ],
  PROTEIN: [
    ["Pork", "Schwein"],
    ["Beef", "Rind"],
    ["Chicken", "Hähnchen"],
    ["Duck", "Ente"],
    ["Turkey", "Truthahn"],
    ["Fish", "Fisch"],
    ["Seafood", "Meeresfrüchte"],
    ["Tofu", "Tofu"],
    ["Egg", "Ei"],
  ],
  CUISINE: [
    ["Italian", "Italienisch"],
    ["Asian", "Asiatisch"],
    ["Mexican", "Mexikanisch"],
    ["Indian", "Indisch"],
    ["Mediterranean", "Mediterran"],
    ["German", "Deutsch"],
    ["American", "Amerikanisch"],
    ["French", "Französisch"],
    ["Middle Eastern", "Nahöstlich"],
    ["Thai", "Thailändisch"],
  ],
  MEAL_TYPE: [
    ["Quick Weeknight", "Schnelles Abendessen"],
    ["One-Pot", "Eintopf"],
    ["Meal-Prep", "Meal-Prep"],
    ["Comfort Food", "Comfort Food"],
    ["Simple", "Einfach"],
    ["Elaborate", "Aufwändig"],
    ["Grilling", "Grillen"],
    ["Salad", "Salat"],
  ],
};

export const DEFAULT_TAG_COUNT = Object.values(DEFAULT_TAGS).reduce(
  (sum, list) => sum + list.length,
  0,
);
```

- [ ] **Step 4: Implement `seedDefaultTags` (idempotent, mirrors `seed_default_tags`)**

```ts
// web/lib/recipes/tags.ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { DEFAULT_TAGS } from "./tag-defaults";

/** Seed default tags for a household. Idempotent — skips existing (category, nameEn) pairs. */
export function seedDefaultTags(db: Db, householdId: string): void {
  const existing = new Set(
    db
      .select({ category: tags.category, nameEn: tags.nameEn })
      .from(tags)
      .where(eq(tags.householdId, householdId))
      .all()
      .map((t) => `${t.category} ${t.nameEn}`),
  );

  const toCreate: (typeof tags.$inferInsert)[] = [];
  for (const [category, list] of Object.entries(DEFAULT_TAGS)) {
    for (const [nameEn, nameDe] of list) {
      if (!existing.has(`${category} ${nameEn}`)) {
        toCreate.push({ id: randomUUID(), householdId, category, nameEn, nameDe, isDefault: true });
      }
    }
  }
  if (toCreate.length > 0) db.insert(tags).values(toCreate).run();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run lib/recipes/tags.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Wire `seedDefaultTags` into household creation**

In `web/lib/households/manage.ts`, delete the local no-op stub and import the real one:

```ts
import { seedDefaultTags } from "@/lib/recipes/tags";
```

Remove the `function seedDefaultTags(_db, _householdId) { ... }` block. The existing call `seedDefaultTags(db, id);` inside `createHousehold` now hits the real implementation.

- [ ] **Step 7: Verify the existing households suite still passes + tsc**

Run: `cd web && npx vitest run lib/households && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 8: Commit**

```bash
git add web/lib/recipes/tag-defaults.ts web/lib/recipes/tags.ts web/lib/recipes/tags.test.ts web/lib/households/manage.ts
git commit -m "feat(web): seed default tags on household creation (Plan 6b)"
```

---

## Task 2: Tag CRUD + reset services

**Files:**
- Modify: `web/lib/recipes/tags.ts`
- Modify: `web/lib/recipes/tags.test.ts`

**Interfaces:**
- Consumes: `seedDefaultTags` (Task 1); `RecipeTagDto` shape (`{ id: string; category: string; nameEn: string; nameDe: string }` — match `lib/queries/recipes.ts`).
- Produces:
  - `createTag(db, householdId, { category, nameEn, nameDe }): { id: string }`
  - `updateTag(db, householdId, tagId, { nameEn, nameDe }): void`
  - `deleteTag(db, householdId, tagId): void`
  - `resetTags(db, householdId): void`

- [ ] **Step 1: Write the failing tests**

```ts
// append to web/lib/recipes/tags.test.ts
import { createTag, updateTag, deleteTag, resetTags } from "./tags";
import { AuthError } from "@/lib/auth/errors";

function twoHouseholds() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
  return db;
}

describe("createTag", () => {
  it("creates a custom (non-default) tag", () => {
    const db = twoHouseholds();
    const { id } = createTag(db, "h1", { category: "CUISINE", nameEn: "Greek", nameDe: "Griechisch" });
    const row = db.select().from(tags).where(eq(tags.id, id)).get();
    expect(row?.isDefault).toBe(false);
    expect(row?.nameEn).toBe("Greek");
  });
  it("rejects an invalid category", () => {
    const db = twoHouseholds();
    expect(() => createTag(db, "h1", { category: "BOGUS", nameEn: "X", nameDe: "X" })).toThrow(AuthError);
  });
});

describe("updateTag", () => {
  it("updates name fields only", () => {
    const db = twoHouseholds();
    const { id } = createTag(db, "h1", { category: "CUISINE", nameEn: "Greek", nameDe: "Griechisch" });
    updateTag(db, "h1", id, { nameEn: "Hellenic", nameDe: "Hellenisch" });
    const row = db.select().from(tags).where(eq(tags.id, id)).get();
    expect(row?.nameEn).toBe("Hellenic");
    expect(row?.category).toBe("CUISINE");
  });
  it("refuses a cross-household tag", () => {
    const db = twoHouseholds();
    const { id } = createTag(db, "h2", { category: "CUISINE", nameEn: "Greek", nameDe: "Griechisch" });
    expect(() => updateTag(db, "h1", id, { nameEn: "X", nameDe: "X" })).toThrow(AuthError);
  });
});

describe("deleteTag", () => {
  it("deletes an owned tag", () => {
    const db = twoHouseholds();
    const { id } = createTag(db, "h1", { category: "CUISINE", nameEn: "Greek", nameDe: "Griechisch" });
    deleteTag(db, "h1", id);
    expect(db.select().from(tags).where(eq(tags.id, id)).get()).toBeUndefined();
  });
  it("refuses a cross-household tag", () => {
    const db = twoHouseholds();
    const { id } = createTag(db, "h2", { category: "CUISINE", nameEn: "Greek", nameDe: "Griechisch" });
    expect(() => deleteTag(db, "h1", id)).toThrow(AuthError);
    expect(db.select().from(tags).where(eq(tags.id, id)).get()).toBeDefined();
  });
});

describe("resetTags", () => {
  it("removes all household tags and reseeds defaults", () => {
    const db = twoHouseholds();
    createTag(db, "h1", { category: "CUISINE", nameEn: "Greek", nameDe: "Griechisch" });
    resetTags(db, "h1");
    const rows = db.select().from(tags).where(eq(tags.householdId, "h1")).all();
    expect(rows).toHaveLength(DEFAULT_TAG_COUNT);
    expect(rows.some((r) => r.nameEn === "Greek")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run lib/recipes/tags.test.ts`
Expected: FAIL — `createTag` etc. not exported.

- [ ] **Step 3: Implement the services**

```ts
// append to web/lib/recipes/tags.ts
import { and } from "drizzle-orm";
import { AuthError } from "@/lib/auth/errors";

const VALID_CATEGORIES = new Set(["DIETARY", "PROTEIN", "CUISINE", "MEAL_TYPE"]);

function ownedTag(db: Db, householdId: string, tagId: string) {
  const row = db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.householdId, householdId)))
    .get();
  if (!row) throw new AuthError(404, "Tag not found");
  return row;
}

export function createTag(
  db: Db,
  householdId: string,
  input: { category: string; nameEn: string; nameDe: string },
): { id: string } {
  if (!VALID_CATEGORIES.has(input.category)) {
    throw new AuthError(422, `Invalid category: ${input.category}`);
  }
  if (!input.nameEn.trim() || !input.nameDe.trim()) {
    throw new AuthError(422, "Tag names are required");
  }
  const id = randomUUID();
  db.insert(tags)
    .values({ id, householdId, category: input.category, nameEn: input.nameEn, nameDe: input.nameDe, isDefault: false })
    .run();
  return { id };
}

export function updateTag(
  db: Db,
  householdId: string,
  tagId: string,
  input: { nameEn: string; nameDe: string },
): void {
  ownedTag(db, householdId, tagId);
  if (!input.nameEn.trim() || !input.nameDe.trim()) {
    throw new AuthError(422, "Tag names are required");
  }
  db.update(tags).set({ nameEn: input.nameEn, nameDe: input.nameDe }).where(eq(tags.id, tagId)).run();
}

export function deleteTag(db: Db, householdId: string, tagId: string): void {
  ownedTag(db, householdId, tagId);
  db.delete(tags).where(eq(tags.id, tagId)).run();
}

export function resetTags(db: Db, householdId: string): void {
  db.transaction((tx) => {
    tx.delete(tags).where(eq(tags.householdId, householdId)).run();
    seedDefaultTags(tx as unknown as Db, householdId);
  });
}
```

Note: the unique constraint `(householdId, category, nameEn)` is enforced at the DB layer; a duplicate `createTag` throws a SQLite constraint error, which `fail()` will surface as a 500 — acceptable (the editor's inline-create UI dedupes client-side; see Task 11).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run lib/recipes/tags.test.ts`
Expected: PASS (all tag tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/recipes/tags.ts web/lib/recipes/tags.test.ts
git commit -m "feat(web): tag CRUD + reset services (Plan 6b)"
```

---

## Task 3: Ingredient create service

**Files:**
- Create: `web/lib/recipes/ingredients.ts`
- Create: `web/lib/recipes/ingredients.test.ts`

**Interfaces:**
- Produces: `createIngredient(db, { nameEn, nameDe, category }): { id: number }`. Global (not household-scoped), no dedup — matches `backend/recipes/api.py` `POST /ingredients/`.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/recipes/ingredients.test.ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { ingredients } from "@/lib/db/schema";
import { createIngredient } from "./ingredients";

describe("createIngredient", () => {
  it("creates a global ingredient and returns its id", () => {
    const db = createTestDb();
    const { id } = createIngredient(db, { nameEn: "Saffron", nameDe: "Safran", category: "PANTRY" });
    const row = db.select().from(ingredients).where(eq(ingredients.id, id)).get();
    expect(row?.nameEn).toBe("Saffron");
    expect(row?.category).toBe("PANTRY");
  });
  it("defaults category to OTHER", () => {
    const db = createTestDb();
    const { id } = createIngredient(db, { nameEn: "Mystery", nameDe: "Mysterium" });
    expect(db.select().from(ingredients).where(eq(ingredients.id, id)).get()?.category).toBe("OTHER");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/recipes/ingredients.test.ts`
Expected: FAIL — `createIngredient` not found.

- [ ] **Step 3: Implement**

```ts
// web/lib/recipes/ingredients.ts
import type { Db } from "@/lib/db";
import { ingredients } from "@/lib/db/schema";

export function createIngredient(
  db: Db,
  input: { nameEn: string; nameDe: string; category?: string },
): { id: number } {
  const row = db
    .insert(ingredients)
    .values({ nameEn: input.nameEn, nameDe: input.nameDe, category: input.category ?? "OTHER" })
    .returning({ id: ingredients.id })
    .get();
  return { id: row.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/recipes/ingredients.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/recipes/ingredients.ts web/lib/recipes/ingredients.test.ts
git commit -m "feat(web): createIngredient service (Plan 6b)"
```

---

## Task 4: `upsertRecipe` service (create + edit, transactional)

**Files:**
- Create: `web/lib/recipes/upsert.ts`
- Create: `web/lib/recipes/upsert.test.ts`

**Interfaces:**
- Consumes: `createIngredient` (Task 3); `validateStepIngredientTotals` + `RecipeIngredientQty`/`StepIngredientRef` (`lib/domain/recipes/step-validation.ts`); `validateProgramStep` (`lib/domain/recipes/program-validation.ts`); `AuthError`; schema tables.
- Produces (the editor/build-payload + actions depend on these EXACT types):

```ts
export interface UpsertIngredientInput {
  ingredientId: number | null; // null => auto-create from nameEn/nameDe
  nameEn: string;
  nameDe: string;
  quantity: string;
  unitId: number;
  order: number;
}
export interface UpsertStepIngredientInput {
  recipeIngredientOrder: number; // references UpsertIngredientInput.order
  quantity: string;
}
export interface UpsertStepInput {
  method: "MANUAL" | "MACHINE";
  stepNumber: number;
  instruction: string;
  programType: string; // "" for manual / free-text machine steps
  temperature: number | null;
  durationSeconds: number | null;
  speed: number | null;
  turbo: boolean;
  direction: string; // "" | "LEFT" | "RIGHT"
  weightGrams: number | null;
  ingredients: UpsertStepIngredientInput[];
}
export interface UpsertRecipeInput {
  title: string;
  description: string;
  listType: "KNOWN" | "TO_TRY";
  defaultServings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  leftoverDays: number | null;
  ingredients: UpsertIngredientInput[];
  steps: UpsertStepInput[];
  tagIds: string[];
}
export function upsertRecipe(
  db: Db,
  householdId: string,
  recipeId: string | null,
  input: UpsertRecipeInput,
  now: Date,
): { id: string };
```

- [ ] **Step 1: Write the failing tests**

```ts
// web/lib/recipes/upsert.test.ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import {
  households, recipes, ingredients, units, recipeIngredients, cookingSteps, stepIngredients,
  tags, recipeTags,
} from "@/lib/db/schema";
import { upsertRecipe, type UpsertRecipeInput } from "./upsert";
import { AuthError } from "@/lib/auth/errors";

const now = new Date("2026-06-27T12:00:00Z");

function seed() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
  db.insert(units).values({ id: 1, nameDe: "Gramm", nameEn: "Gram", abbreviation: "g" }).run();
  db.insert(ingredients).values({ id: 1, nameDe: "Mehl", nameEn: "Flour", category: "PANTRY" }).run();
  db.insert(tags).values([
    { id: "t1", householdId: "h1", category: "CUISINE", nameEn: "Italian", nameDe: "Italienisch", isDefault: true },
    { id: "tX", householdId: "h2", category: "CUISINE", nameEn: "Foreign", nameDe: "Fremd", isDefault: true },
  ]).run();
  return db;
}

function baseInput(over: Partial<UpsertRecipeInput> = {}): UpsertRecipeInput {
  return {
    title: "Bread", description: "", listType: "TO_TRY", defaultServings: 2,
    prepTimeMinutes: 10, cookTimeMinutes: 30, leftoverDays: null,
    ingredients: [{ ingredientId: 1, nameEn: "Flour", nameDe: "Mehl", quantity: "500", unitId: 1, order: 0 }],
    steps: [{ method: "MANUAL", stepNumber: 1, instruction: "Mix", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [{ recipeIngredientOrder: 0, quantity: "500" }] }],
    tagIds: ["t1"],
    ...over,
  };
}

describe("upsertRecipe — create", () => {
  it("creates a recipe with ingredients, steps, step-ingredients and tags", () => {
    const db = seed();
    const { id } = upsertRecipe(db, "h1", null, baseInput(), now);
    expect(db.select().from(recipes).where(eq(recipes.id, id)).get()?.title).toBe("Bread");
    expect(db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).all()).toHaveLength(1);
    expect(db.select().from(cookingSteps).where(eq(cookingSteps.recipeId, id)).all()).toHaveLength(1);
    expect(db.select().from(recipeTags).where(eq(recipeTags.recipeId, id)).all()).toHaveLength(1);
    const si = db.select().from(stepIngredients).all();
    expect(si).toHaveLength(1);
  });

  it("auto-creates an ingredient referenced by name with no id", () => {
    const db = seed();
    const input = baseInput({
      ingredients: [{ ingredientId: null, nameEn: "Yeast", nameDe: "Hefe", quantity: "7", unitId: 1, order: 0 }],
      steps: [{ method: "MANUAL", stepNumber: 1, instruction: "Add", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [] }],
    });
    const { id } = upsertRecipe(db, "h1", null, input, now);
    const created = db.select().from(ingredients).where(eq(ingredients.nameEn, "Yeast")).get();
    expect(created).toBeDefined();
    const ri = db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).get();
    expect(ri?.ingredientId).toBe(created!.id);
  });

  it("drops tag ids not owned by the household", () => {
    const db = seed();
    const { id } = upsertRecipe(db, "h1", null, baseInput({ tagIds: ["t1", "tX"] }), now);
    const rt = db.select().from(recipeTags).where(eq(recipeTags.recipeId, id)).all();
    expect(rt).toHaveLength(1);
  });

  it("rejects step-ingredient over-allocation with 422", () => {
    const db = seed();
    const input = baseInput({
      steps: [{ method: "MANUAL", stepNumber: 1, instruction: "Mix", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [{ recipeIngredientOrder: 0, quantity: "999" }] }],
    });
    expect(() => upsertRecipe(db, "h1", null, input, now)).toThrow(AuthError);
  });

  it("rejects invalid machine program params with 422", () => {
    const db = seed();
    const input = baseInput({
      steps: [{ method: "MACHINE", stepNumber: 1, instruction: "", programType: "STEAMING", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [] }],
    });
    expect(() => upsertRecipe(db, "h1", null, input, now)).toThrow(AuthError); // STEAMING requires temperature + duration
  });
});

describe("upsertRecipe — edit", () => {
  it("replaces nested data on update", () => {
    const db = seed();
    const { id } = upsertRecipe(db, "h1", null, baseInput(), now);
    upsertRecipe(db, "h1", id, baseInput({
      title: "Sourdough",
      ingredients: [
        { ingredientId: 1, nameEn: "Flour", nameDe: "Mehl", quantity: "400", unitId: 1, order: 0 },
        { ingredientId: 1, nameEn: "Flour", nameDe: "Mehl", quantity: "100", unitId: 1, order: 1 },
      ],
      steps: [{ method: "MANUAL", stepNumber: 1, instruction: "Knead", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [] }],
    }), now);
    expect(db.select().from(recipes).where(eq(recipes.id, id)).get()?.title).toBe("Sourdough");
    expect(db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).all()).toHaveLength(2);
  });

  it("refuses to edit a cross-household recipe (404)", () => {
    const db = seed();
    const { id } = upsertRecipe(db, "h2", null, baseInput({ tagIds: ["tX"] }), now);
    expect(() => upsertRecipe(db, "h1", id, baseInput({ tagIds: [] }), now)).toThrow(AuthError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run lib/recipes/upsert.test.ts`
Expected: FAIL — `./upsert` not found.

- [ ] **Step 3: Implement `upsertRecipe`**

```ts
// web/lib/recipes/upsert.ts
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import {
  recipes, recipeIngredients, cookingSteps, stepIngredients, recipeTags, tags, ingredients,
} from "@/lib/db/schema";
import { validateStepIngredientTotals } from "@/lib/domain/recipes/step-validation";
import { validateProgramStep } from "@/lib/domain/recipes/program-validation";
import { createIngredient } from "./ingredients";

export interface UpsertIngredientInput {
  ingredientId: number | null;
  nameEn: string;
  nameDe: string;
  quantity: string;
  unitId: number;
  order: number;
}
export interface UpsertStepIngredientInput {
  recipeIngredientOrder: number;
  quantity: string;
}
export interface UpsertStepInput {
  method: "MANUAL" | "MACHINE";
  stepNumber: number;
  instruction: string;
  programType: string;
  temperature: number | null;
  durationSeconds: number | null;
  speed: number | null;
  turbo: boolean;
  direction: string;
  weightGrams: number | null;
  ingredients: UpsertStepIngredientInput[];
}
export interface UpsertRecipeInput {
  title: string;
  description: string;
  listType: "KNOWN" | "TO_TRY";
  defaultServings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  leftoverDays: number | null;
  ingredients: UpsertIngredientInput[];
  steps: UpsertStepInput[];
  tagIds: string[];
}

function validate(input: UpsertRecipeInput): void {
  if (!input.title.trim()) throw new AuthError(422, "Title is required");
  if (input.defaultServings < 1) throw new AuthError(422, "Servings must be at least 1");

  // Step-ingredient over-allocation (across all steps).
  const allStepIngredients = input.steps.flatMap((s) => s.ingredients);
  const totalErrors = validateStepIngredientTotals(
    input.ingredients.map((i) => ({ order: i.order, quantity: i.quantity })),
    allStepIngredients,
  );
  if (totalErrors.length > 0) throw new AuthError(422, totalErrors.join("; "));

  const validOrders = new Set(input.ingredients.map((i) => i.order));
  for (const step of input.steps) {
    for (const si of step.ingredients) {
      if (!validOrders.has(si.recipeIngredientOrder)) {
        throw new AuthError(422, `Step references unknown ingredient order ${si.recipeIngredientOrder}`);
      }
    }
    if (step.method === "MANUAL") {
      if (step.programType) throw new AuthError(422, "Manual steps cannot have a program type");
      if (!step.instruction.trim()) throw new AuthError(422, "Manual steps require an instruction");
    } else if (step.programType) {
      const errs = validateProgramStep(step.programType, {
        temperature: step.temperature,
        durationSeconds: step.durationSeconds,
        speed: step.speed,
        direction: step.direction || null,
        turbo: step.turbo,
        weightGrams: step.weightGrams,
      });
      if (errs.length > 0) throw new AuthError(422, errs.join("; "));
    } else if (!step.instruction.trim()) {
      throw new AuthError(422, "Free-text machine steps require an instruction");
    }
  }
}

export function upsertRecipe(
  db: Db,
  householdId: string,
  recipeId: string | null,
  input: UpsertRecipeInput,
  now: Date,
): { id: string } {
  validate(input);

  // Ownership check (edit) before opening the transaction.
  if (recipeId !== null) {
    const owned = db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
      .get();
    if (!owned) throw new AuthError(404, "Recipe not found");
  }

  return db.transaction((tx) => {
    const id = recipeId ?? randomUUID();
    const recipeRow = {
      title: input.title,
      description: input.description,
      listType: input.listType,
      defaultServings: input.defaultServings,
      prepTimeMinutes: input.prepTimeMinutes,
      cookTimeMinutes: input.cookTimeMinutes,
      leftoverDays: input.leftoverDays,
      updatedAt: now,
    };

    if (recipeId === null) {
      tx.insert(recipes).values({ id, householdId, image: "", createdAt: now, ...recipeRow }).run();
    } else {
      tx.update(recipes).set(recipeRow).where(eq(recipes.id, id)).run();
      tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).run();
      tx.delete(cookingSteps).where(eq(cookingSteps.recipeId, id)).run();
      tx.delete(recipeTags).where(eq(recipeTags.recipeId, id)).run();
      // stepIngredients cascade-delete with their cookingSteps (FK onDelete cascade).
    }

    // Ingredients (auto-create unknown), mapping order -> new recipeIngredient id.
    const orderToRiId = new Map<number, number>();
    for (const ing of input.ingredients) {
      const ingredientId =
        ing.ingredientId ?? createIngredient(tx as unknown as Db, { nameEn: ing.nameEn, nameDe: ing.nameDe }).id;
      const ri = tx
        .insert(recipeIngredients)
        .values({ recipeId: id, ingredientId, quantity: ing.quantity, unitId: ing.unitId, order: ing.order })
        .returning({ id: recipeIngredients.id })
        .get();
      orderToRiId.set(ing.order, ri.id);
    }

    // Steps + their step-ingredients.
    for (const step of input.steps) {
      const cs = tx
        .insert(cookingSteps)
        .values({
          recipeId: id, method: step.method, stepNumber: step.stepNumber, instruction: step.instruction,
          programType: step.programType, temperature: step.temperature, durationSeconds: step.durationSeconds,
          speed: step.speed, turbo: step.turbo, direction: step.direction, weightGrams: step.weightGrams,
        })
        .returning({ id: cookingSteps.id })
        .get();
      for (const si of step.ingredients) {
        const riId = orderToRiId.get(si.recipeIngredientOrder)!; // validated above
        tx.insert(stepIngredients).values({ stepId: cs.id, recipeIngredientId: riId, quantity: si.quantity }).run();
      }
    }

    // Tags — only those owned by the household.
    if (input.tagIds.length > 0) {
      const owned = tx
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.householdId, householdId), inArray(tags.id, input.tagIds)))
        .all();
      if (owned.length > 0) {
        tx.insert(recipeTags).values(owned.map((t) => ({ recipeId: id, tagId: t.id }))).run();
      }
    }

    return { id };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run lib/recipes/upsert.test.ts`
Expected: PASS (all upsert tests).

- [ ] **Step 5: Run full suite + tsc**

Run: `cd web && npm test && npx tsc --noEmit`
Expected: all green; no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/lib/recipes/upsert.ts web/lib/recipes/upsert.test.ts
git commit -m "feat(web): upsertRecipe service — transactional create/edit (Plan 6b)"
```

---

## Task 5: Server actions (save recipe, ingredient, tag CRUD)

**Files:**
- Modify: `web/app/(app)/actions.ts`

**Interfaces:**
- Consumes: `upsertRecipe` + `UpsertRecipeInput` (Task 4), `createIngredient` (Task 3), `createTag`/`updateTag`/`deleteTag`/`resetTags` (Tasks 1–2), `withHousehold`/`Result`.
- Produces (the UI islands depend on these EXACT signatures):
  - `saveRecipeAction(recipeId: string | null, input: UpsertRecipeInput): Promise<Result<{ id: string }>>`
  - `createIngredientAction(input: { nameEn: string; nameDe: string; category?: string }): Promise<Result<{ id: number }>>`
  - `createTagAction(input: { category: string; nameEn: string; nameDe: string }): Promise<Result<{ id: string }>>`
  - `updateTagAction(tagId: string, input: { nameEn: string; nameDe: string }): Promise<Result<undefined>>`
  - `deleteTagAction(tagId: string): Promise<Result<undefined>>`
  - `resetTagsAction(): Promise<Result<undefined>>`

- [ ] **Step 1: Add the actions**

Append to `web/app/(app)/actions.ts` (and add imports at top):

```ts
import { upsertRecipe, type UpsertRecipeInput } from "@/lib/recipes/upsert";
import { createIngredient } from "@/lib/recipes/ingredients";
import { createTag, updateTag, deleteTag, resetTags } from "@/lib/recipes/tags";
```

```ts
export async function saveRecipeAction(
  recipeId: string | null,
  input: UpsertRecipeInput,
): Promise<Result<{ id: string }>> {
  const res = await withHousehold(({ db, householdId, now }) =>
    upsertRecipe(db, householdId, recipeId, input, now),
  );
  if (res.ok) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${res.data.id}`);
  }
  return res;
}

export async function createIngredientAction(
  input: { nameEn: string; nameDe: string; category?: string },
): Promise<Result<{ id: number }>> {
  return withHousehold(({ db }) => createIngredient(db, input));
}

export async function createTagAction(
  input: { category: string; nameEn: string; nameDe: string },
): Promise<Result<{ id: string }>> {
  const res = await withHousehold(({ db, householdId }) => createTag(db, householdId, input));
  if (res.ok) {
    revalidatePath("/settings/tags");
    revalidatePath("/recipes");
  }
  return res;
}

export async function updateTagAction(
  tagId: string,
  input: { nameEn: string; nameDe: string },
): Promise<Result<undefined>> {
  const res = await withHousehold(({ db, householdId }) => {
    updateTag(db, householdId, tagId, input);
    return undefined;
  });
  if (res.ok) {
    revalidatePath("/settings/tags");
    revalidatePath("/recipes");
  }
  return res;
}

export async function deleteTagAction(tagId: string): Promise<Result<undefined>> {
  const res = await withHousehold(({ db, householdId }) => {
    deleteTag(db, householdId, tagId);
    return undefined;
  });
  if (res.ok) {
    revalidatePath("/settings/tags");
    revalidatePath("/recipes");
  }
  return res;
}

export async function resetTagsAction(): Promise<Result<undefined>> {
  const res = await withHousehold(({ db, householdId }) => {
    resetTags(db, householdId);
    return undefined;
  });
  if (res.ok) {
    revalidatePath("/settings/tags");
    revalidatePath("/recipes");
  }
  return res;
}
```

- [ ] **Step 2: Verify tsc + existing suite**

Run: `cd web && npx tsc --noEmit && npm test`
Expected: no type errors; suite green.

- [ ] **Step 3: Commit**

```bash
git add web/app/\(app\)/actions.ts
git commit -m "feat(web): recipe/ingredient/tag server actions (Plan 6b)"
```

---

## Task 6: Editor form schema + pure payload mappers

**Files:**
- Create: `web/lib/schemas/recipe.ts`
- Create: `web/components/recipes/editor/build-payload.ts`
- Create: `web/components/recipes/editor/build-payload.test.ts`
- Create: `web/components/recipes/editor/to-initial-values.ts`
- Create: `web/components/recipes/editor/to-initial-values.test.ts`

**Interfaces:**
- Consumes: `UpsertRecipeInput` (Task 4); `RecipeDetail`/`RecipeIngredientDto`/`CookingStepDto`/`StepIngredientDto` (`lib/queries/recipes.ts`).
- Produces:
  - `recipeFormSchema` (zod) + `type RecipeFormValues = z.infer<typeof recipeFormSchema>`.
  - `buildPayload(values: RecipeFormValues, listType: "KNOWN" | "TO_TRY"): UpsertRecipeInput`.
  - `toInitialValues(recipe: RecipeDetail): RecipeFormValues`.

`RecipeFormValues` shape (define in `lib/schemas/recipe.ts`):

```ts
import { z } from "zod";

export const formIngredientSchema = z.object({
  ingredientId: z.number().nullable(),
  nameEn: z.string(),
  nameDe: z.string(),
  quantity: z.string(),
  unitId: z.number(),
});
export const formStepIngredientSchema = z.object({
  recipeIngredientIndex: z.number(), // index into the ingredients array (becomes `order`)
  quantity: z.string(),
});
export const formStepSchema = z.object({
  instruction: z.string(),
  programType: z.string(), // "" for manual / free-text
  temperature: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  speed: z.number().nullable(),
  turbo: z.boolean(),
  direction: z.string(),
  weightGrams: z.number().nullable(),
  ingredients: z.array(formStepIngredientSchema),
});
export const recipeFormSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  defaultServings: z.number().min(1),
  prepTimeMinutes: z.number().nullable(),
  cookTimeMinutes: z.number().nullable(),
  leftoverDays: z.number().nullable(),
  ingredients: z.array(formIngredientSchema),
  manualSteps: z.array(formStepSchema),
  machineSteps: z.array(formStepSchema),
  tagIds: z.array(z.string()),
});
export type RecipeFormValues = z.infer<typeof recipeFormSchema>;
export type FormStepValues = z.infer<typeof formStepSchema>;
export type FormIngredientValues = z.infer<typeof formIngredientSchema>;
```

- [ ] **Step 1: Write the failing tests for `buildPayload`**

```ts
// web/components/recipes/editor/build-payload.test.ts
import { describe, expect, it } from "vitest";
import { buildPayload } from "./build-payload";
import type { RecipeFormValues } from "@/lib/schemas/recipe";

function values(over: Partial<RecipeFormValues> = {}): RecipeFormValues {
  return {
    title: "Bread", description: "", defaultServings: 2,
    prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null,
    ingredients: [
      { ingredientId: 1, nameEn: "Flour", nameDe: "Mehl", quantity: "500", unitId: 1 },
      { ingredientId: null, nameEn: "Yeast", nameDe: "Yeast", quantity: "7", unitId: 1 },
    ],
    manualSteps: [
      { instruction: "Mix", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [{ recipeIngredientIndex: 0, quantity: "500" }] },
      { instruction: "", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [] }, // empty -> dropped
    ],
    machineSteps: [],
    tagIds: ["t1"],
    ...over,
  };
}

describe("buildPayload", () => {
  it("maps form values to UpsertRecipeInput, indexes ingredients by order", () => {
    const out = buildPayload(values(), "TO_TRY");
    expect(out.listType).toBe("TO_TRY");
    expect(out.ingredients).toHaveLength(2);
    expect(out.ingredients[1]).toMatchObject({ ingredientId: null, nameEn: "Yeast", order: 1 });
    expect(out.steps).toHaveLength(1); // empty manual step dropped
    expect(out.steps[0].method).toBe("MANUAL");
    expect(out.steps[0].stepNumber).toBe(1);
    expect(out.steps[0].ingredients[0].recipeIngredientOrder).toBe(0);
  });

  it("keeps machine steps with a program even when instruction is empty, renumbers per method", () => {
    const out = buildPayload(values({
      manualSteps: [],
      machineSteps: [{ instruction: "", programType: "STEAMING", temperature: 100, durationSeconds: 600, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [] }],
    }), "KNOWN");
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0]).toMatchObject({ method: "MACHINE", programType: "STEAMING", stepNumber: 1 });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd web && npx vitest run components/recipes/editor/build-payload.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/schemas/recipe.ts`** (the schema block shown above).

- [ ] **Step 4: Implement `buildPayload`**

```ts
// web/components/recipes/editor/build-payload.ts
import type { RecipeFormValues, FormStepValues } from "@/lib/schemas/recipe";
import type { UpsertRecipeInput, UpsertStepInput } from "@/lib/recipes/upsert";

function isEmptyStep(s: FormStepValues): boolean {
  return !s.instruction.trim() && !s.programType;
}

function toStep(s: FormStepValues, method: "MANUAL" | "MACHINE", stepNumber: number): UpsertStepInput {
  return {
    method,
    stepNumber,
    instruction: s.instruction,
    programType: method === "MANUAL" ? "" : s.programType,
    temperature: s.temperature,
    durationSeconds: s.durationSeconds,
    speed: s.speed,
    turbo: s.turbo,
    direction: s.direction,
    weightGrams: s.weightGrams,
    ingredients: s.ingredients.map((si) => ({
      recipeIngredientOrder: si.recipeIngredientIndex,
      quantity: si.quantity,
    })),
  };
}

export function buildPayload(values: RecipeFormValues, listType: "KNOWN" | "TO_TRY"): UpsertRecipeInput {
  const manual = values.manualSteps.filter((s) => !isEmptyStep(s));
  const machine = values.machineSteps.filter((s) => !isEmptyStep(s));
  let n = 0;
  const steps: UpsertStepInput[] = [
    ...manual.map((s) => toStep(s, "MANUAL", ++n)),
  ];
  n = 0;
  steps.push(...machine.map((s) => toStep(s, "MACHINE", ++n)));

  return {
    title: values.title,
    description: values.description,
    listType,
    defaultServings: values.defaultServings,
    prepTimeMinutes: values.prepTimeMinutes,
    cookTimeMinutes: values.cookTimeMinutes,
    leftoverDays: values.leftoverDays,
    ingredients: values.ingredients.map((ing, order) => ({
      ingredientId: ing.ingredientId,
      nameEn: ing.nameEn,
      nameDe: ing.nameDe || ing.nameEn,
      quantity: ing.quantity,
      unitId: ing.unitId,
      order,
    })),
    steps,
    tagIds: values.tagIds,
  };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd web && npx vitest run components/recipes/editor/build-payload.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the failing test for `toInitialValues`**

```ts
// web/components/recipes/editor/to-initial-values.test.ts
import { describe, expect, it } from "vitest";
import { toInitialValues } from "./to-initial-values";
import type { RecipeDetail } from "@/lib/queries/recipes";

const recipe: RecipeDetail = {
  id: "r1", title: "Bread", description: "Tasty", listType: "KNOWN", defaultServings: 4,
  prepTimeMinutes: 10, cookTimeMinutes: 30, leftoverDays: null, image: "",
  tags: [{ id: "t1", category: "CUISINE", nameEn: "Italian", nameDe: "Italienisch" }],
  ingredients: [
    { id: 11, ingredientId: 1, quantity: "500", unitId: 1, order: 0 },
    { id: 12, ingredientId: 2, quantity: "7", unitId: 1, order: 1 },
  ],
  manualSteps: [
    { id: 21, method: "MANUAL", stepNumber: 1, instruction: "Mix", programType: "", temperature: null, durationSeconds: null, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [{ recipeIngredientId: 11, quantity: "500" }] },
  ],
  machineSteps: [
    { id: 22, method: "MACHINE", stepNumber: 1, instruction: "", programType: "STEAMING", temperature: 100, durationSeconds: 600, speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [] },
  ],
} as unknown as RecipeDetail;

describe("toInitialValues", () => {
  it("maps RecipeDetail to form values and converts recipeIngredientId -> ingredient index", () => {
    const v = toInitialValues(recipe);
    expect(v.title).toBe("Bread");
    expect(v.description).toBe("Tasty");
    expect(v.tagIds).toEqual(["t1"]);
    expect(v.ingredients).toHaveLength(2);
    expect(v.ingredients[0].ingredientId).toBe(1);
    // step-ingredient referencing recipeIngredientId 11 (order 0) -> index 0
    expect(v.manualSteps[0].ingredients[0].recipeIngredientIndex).toBe(0);
    expect(v.machineSteps[0].programType).toBe("STEAMING");
  });
});
```

- [ ] **Step 7: Run to verify fail**

Run: `cd web && npx vitest run components/recipes/editor/to-initial-values.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `toInitialValues`**

```ts
// web/components/recipes/editor/to-initial-values.ts
import type { RecipeDetail, CookingStepDto } from "@/lib/queries/recipes";
import type { RecipeFormValues, FormStepValues } from "@/lib/schemas/recipe";

export function toInitialValues(recipe: RecipeDetail): RecipeFormValues {
  // recipeIngredient PK -> its index in the ingredients array (sorted by order).
  const sortedIngredients = [...recipe.ingredients].sort((a, b) => a.order - b.order);
  const riIdToIndex = new Map<number, number>();
  sortedIngredients.forEach((ri, idx) => riIdToIndex.set(ri.id, idx));

  const toFormStep = (s: CookingStepDto): FormStepValues => ({
    instruction: s.instruction,
    programType: s.programType,
    temperature: s.temperature,
    durationSeconds: s.durationSeconds,
    speed: s.speed,
    turbo: s.turbo,
    direction: s.direction,
    weightGrams: s.weightGrams,
    ingredients: s.ingredients
      .filter((si) => riIdToIndex.has(si.recipeIngredientId))
      .map((si) => ({ recipeIngredientIndex: riIdToIndex.get(si.recipeIngredientId)!, quantity: si.quantity })),
  });

  return {
    title: recipe.title,
    description: recipe.description,
    defaultServings: recipe.defaultServings,
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    leftoverDays: recipe.leftoverDays,
    ingredients: sortedIngredients.map((ri) => ({
      ingredientId: ri.ingredientId,
      nameEn: "",
      nameDe: "",
      quantity: ri.quantity,
      unitId: ri.unitId,
    })),
    manualSteps: [...recipe.manualSteps].sort((a, b) => a.stepNumber - b.stepNumber).map(toFormStep),
    machineSteps: [...recipe.machineSteps].sort((a, b) => a.stepNumber - b.stepNumber).map(toFormStep),
    tagIds: recipe.tags.map((t) => t.id),
  };
}
```

Note: `nameEn`/`nameDe` are empty for existing ingredients because they already have `ingredientId`; the picker fills display names from the loaded ingredient list. They are only populated for newly-typed (auto-create) ingredients.

- [ ] **Step 9: Run to verify pass + full suite + tsc**

Run: `cd web && npx vitest run components/recipes/editor && npm test && npx tsc --noEmit`
Expected: PASS; suite green; no type errors.

- [ ] **Step 10: Commit**

```bash
git add web/lib/schemas/recipe.ts web/components/recipes/editor/build-payload.ts web/components/recipes/editor/build-payload.test.ts web/components/recipes/editor/to-initial-values.ts web/components/recipes/editor/to-initial-values.test.ts
git commit -m "feat(web): recipe form schema + payload/initial-value mappers (Plan 6b)"
```

---

## Task 7: Install @dnd-kit + editor shell + create/edit routes

**Files:**
- Modify: `web/package.json` (add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- Create: `web/components/recipes/recipe-editor.tsx`
- Create: `web/app/(app)/recipes/new/page.tsx`
- Create: `web/app/(app)/recipes/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `recipeFormSchema`/`RecipeFormValues` (Task 6), `buildPayload`/`toInitialValues` (Task 6), `saveRecipeAction` (Task 5), `listIngredients`/`listUnits`/`listTags`/`getRecipe` (`lib/queries/recipes.ts`), `useT`, `Button`/`Input`/form UI.
- Produces: `<RecipeEditor mode="create"|"edit" recipeId={...} listType={...} initialValues={...} ingredients unitsById tags locale />` — the orchestrator island. Sub-components (Tasks 8–11) plug into its react-hook-form context.

This task delivers a **working create+edit flow for the scalar fields** (title, description, servings, prep/cook time) that already saves. Ingredient/step/tag editing are stubbed sections filled in by Tasks 8–11.

- [ ] **Step 1: Install dnd-kit**

```bash
cd web && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Create the editor island (scalar fields + submit wired)**

```tsx
// web/components/recipes/recipe-editor.tsx
"use client";

import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recipeFormSchema, type RecipeFormValues } from "@/lib/schemas/recipe";
import { buildPayload } from "./editor/build-payload";
import { saveRecipeAction } from "@/app/(app)/actions";
import type { IngredientLite, UnitLite, RecipeTagDto } from "@/lib/queries/recipes";
import type { Locale } from "@/lib/i18n/config";

const EMPTY: RecipeFormValues = {
  title: "", description: "", defaultServings: 2,
  prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null,
  ingredients: [], manualSteps: [], machineSteps: [], tagIds: [],
};

export function RecipeEditor(props: {
  mode: "create" | "edit";
  recipeId: string | null;
  listType: "KNOWN" | "TO_TRY";
  initialValues?: RecipeFormValues;
  ingredients: IngredientLite[];
  units: UnitLite[];
  tags: RecipeTagDto[];
  locale: Locale;
}) {
  const { t } = useT();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const form = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: props.initialValues ?? EMPTY,
  });

  async function onSubmit(values: RecipeFormValues) {
    setSaving(true);
    const res = await saveRecipeAction(props.recipeId, buildPayload(values, props.listType));
    setSaving(false);
    if (!res.ok) {
      toast.error(res.message || t("common.error"));
      return;
    }
    toast.success(t(props.mode === "create" ? "recipes.created" : "recipes.saved"));
    router.push(`/recipes/${res.data.id}`);
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <h1 className="text-xl font-semibold">
          {t(props.mode === "create" ? "recipes.newRecipe" : "recipes.editRecipe")}
        </h1>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t("recipes.recipeName")}</label>
          <Input {...form.register("title")} placeholder={t("recipes.titlePlaceholder")} />
          {form.formState.errors.title && (
            <p className="text-sm text-destructive">{t("recipes.titleRequired")}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t("recipes.description")}</label>
          <textarea
            {...form.register("description")}
            className="w-full rounded-md border bg-background p-2 text-sm"
            rows={3}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("recipes.servings")}</label>
            <Input type="number" min={1} {...form.register("defaultServings", { valueAsNumber: true })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("recipes.prepTime")}</label>
            <Input type="number" min={0} {...form.register("prepTimeMinutes", { setValueAs: (v) => (v === "" ? null : Number(v)) })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("recipes.cookTime")}</label>
            <Input type="number" min={0} {...form.register("cookTimeMinutes", { setValueAs: (v) => (v === "" ? null : Number(v)) })} />
          </div>
        </div>

        {/* Task 7 stubs — replaced by later tasks */}
        {/* <IngredientRows ingredients={props.ingredients} units={props.units} locale={props.locale} /> (Task 8) */}
        {/* <StepEditor method="manual" ... /> (Tasks 9-10) */}
        {/* <StepEditor method="machine" ... /> (Tasks 9-10) */}
        {/* <TagSelector tags={props.tags} locale={props.locale} /> (Task 11) */}

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
```

- [ ] **Step 3: Create the `new` route**

```tsx
// web/app/(app)/recipes/new/page.tsx
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { listIngredients, listUnits, listTags } from "@/lib/queries/recipes";
import { RecipeEditor } from "@/components/recipes/recipe-editor";

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const { list } = await searchParams;
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();
  const listType = list === "KNOWN" ? "KNOWN" : "TO_TRY";

  return (
    <RecipeEditor
      mode="create"
      recipeId={null}
      listType={listType}
      ingredients={listIngredients(db)}
      units={listUnits(db)}
      tags={listTags(db, householdId)}
      locale={locale}
    />
  );
}
```

- [ ] **Step 4: Create the `edit` route**

```tsx
// web/app/(app)/recipes/[id]/edit/page.tsx
import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getRecipe, listIngredients, listUnits, listTags } from "@/lib/queries/recipes";
import { RecipeEditor } from "@/components/recipes/recipe-editor";
import { toInitialValues } from "@/components/recipes/editor/to-initial-values";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();

  const recipe = getRecipe(db, householdId, id);
  if (!recipe) notFound();

  return (
    <RecipeEditor
      mode="edit"
      recipeId={recipe.id}
      listType={recipe.listType as "KNOWN" | "TO_TRY"}
      initialValues={toInitialValues(recipe)}
      ingredients={listIngredients(db)}
      units={listUnits(db)}
      tags={listTags(db, householdId)}
      locale={locale}
    />
  );
}
```

- [ ] **Step 5: Add the i18n keys used here**

Add to BOTH `en.json` and `de.json` (under `recipes` / `common`), keeping structure identical. Minimum new keys: `recipes.description`, `recipes.titleRequired`, `recipes.created`, `recipes.saved`, `common.saving`, `common.save`, `common.cancel` (reuse if already present — check first). EN values:

```json
"recipes": { "description": "Description", "titleRequired": "Title is required", "created": "Recipe created", "saved": "Recipe saved" }
"common": { "saving": "Saving…", "save": "Save", "cancel": "Cancel" }
```

DE values:

```json
"recipes": { "description": "Beschreibung", "titleRequired": "Titel ist erforderlich", "created": "Rezept erstellt", "saved": "Rezept gespeichert" }
"common": { "saving": "Speichern…", "save": "Speichern", "cancel": "Abbrechen" }
```

- [ ] **Step 6: Verify tsc + build + suite**

Run: `cd web && npx tsc --noEmit && npm test && npm run build`
Expected: no type errors; suite green; build succeeds with `/recipes/new` and `/recipes/[id]/edit` routes present.

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/package-lock.json web/components/recipes/recipe-editor.tsx web/app/\(app\)/recipes/new/page.tsx web/app/\(app\)/recipes/\[id\]/edit/page.tsx web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json
git commit -m "feat(web): recipe editor shell + create/edit routes (Plan 6b)"
```

---

## Task 8: Ingredient rows + picker

**Files:**
- Create: `web/components/recipes/editor/ingredient-rows.tsx`
- Modify: `web/components/recipes/recipe-editor.tsx` (mount `<IngredientRows>`)

**Interfaces:**
- Consumes: react-hook-form context (`useFormContext<RecipeFormValues>`), `useFieldArray({ name: "ingredients" })`, `IngredientLite[]`, `UnitLite[]`, `Locale`.
- Produces: `<IngredientRows ingredients units locale />`.

Behavior: list of ingredient rows; each row has a name field (autocomplete over `ingredients` by localized name), a quantity text input, and a unit `<select>`. Selecting a suggestion sets `ingredientId` + `nameEn`/`nameDe`; typing a name with no match leaves `ingredientId: null` and stores the typed text in both `nameEn`/`nameDe` (auto-create on save). Add/remove row buttons.

- [ ] **Step 1: Implement `IngredientRows`**

```tsx
// web/components/recipes/editor/ingredient-rows.tsx
"use client";

import { useState } from "react";
import { useFormContext, useFieldArray } from "react-hook-form";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RecipeFormValues } from "@/lib/schemas/recipe";
import type { IngredientLite, UnitLite } from "@/lib/queries/recipes";
import type { Locale } from "@/lib/i18n/config";

function ingredientName(i: IngredientLite, locale: Locale) {
  return locale === "de" ? i.nameDe : i.nameEn;
}

export function IngredientRows({
  ingredients, units, locale,
}: { ingredients: IngredientLite[]; units: UnitLite[]; locale: Locale }) {
  const { t } = useT();
  const { control, register, setValue, watch } = useFormContext<RecipeFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "ingredients" });
  const [query, setQuery] = useState("");

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">{t("ingredients.title")}</h2>
      {fields.map((field, idx) => {
        const matches = query.trim()
          ? ingredients.filter((i) => ingredientName(i, locale).toLowerCase().includes(query.toLowerCase())).slice(0, 6)
          : [];
        return (
          <div key={field.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            <div className="relative min-w-[10rem] flex-1">
              <Input
                defaultValue={watch(`ingredients.${idx}.nameEn`)}
                placeholder={t("ingredients.searchPlaceholder")}
                onChange={(e) => {
                  const v = e.target.value;
                  setQuery(v);
                  setValue(`ingredients.${idx}.ingredientId`, null);
                  setValue(`ingredients.${idx}.nameEn`, v);
                  setValue(`ingredients.${idx}.nameDe`, v);
                }}
              />
              {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="block w-full px-2 py-1 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setValue(`ingredients.${idx}.ingredientId`, m.id);
                          setValue(`ingredients.${idx}.nameEn`, m.nameEn);
                          setValue(`ingredients.${idx}.nameDe`, m.nameDe);
                          setQuery("");
                        }}
                      >
                        {ingredientName(m, locale)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Input className="w-20" placeholder={t("ingredients.quantity")} {...register(`ingredients.${idx}.quantity`)} />
            <select
              className="rounded-md border bg-background p-2 text-sm"
              {...register(`ingredients.${idx}.unitId`, { valueAsNumber: true })}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.abbreviation}</option>
              ))}
            </select>
            <Button type="button" variant="ghost" onClick={() => remove(idx)}>{t("common.remove")}</Button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        onClick={() => append({ ingredientId: null, nameEn: "", nameDe: "", quantity: "", unitId: units[0]?.id ?? 1 })}
      >
        {t("ingredients.add")}
      </Button>
    </section>
  );
}
```

- [ ] **Step 2: Mount it in the editor**

In `recipe-editor.tsx`, import and render `<IngredientRows ingredients={props.ingredients} units={props.units} locale={props.locale} />` where the Task 7 stub comment for ingredients sits.

- [ ] **Step 3: Add i18n keys**

Add to both locales (check `ingredients` section first — some may exist): `ingredients.searchPlaceholder`, `ingredients.quantity`, `ingredients.add`, `common.remove`. EN: `"Search ingredient…"`, `"Qty"`, `"Add ingredient"`, `"Remove"`. DE: `"Zutat suchen…"`, `"Menge"`, `"Zutat hinzufügen"`, `"Entfernen"`.

- [ ] **Step 4: Verify tsc + build + suite**

Run: `cd web && npx tsc --noEmit && npm test && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add web/components/recipes/editor/ingredient-rows.tsx web/components/recipes/recipe-editor.tsx web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json
git commit -m "feat(web): editor ingredient rows + picker (Plan 6b)"
```

---

## Task 9: Step editor with drag-reorder (manual + machine)

**Files:**
- Create: `web/components/recipes/editor/step-editor.tsx`
- Create: `web/components/recipes/editor/sortable-step.tsx`
- Modify: `web/components/recipes/recipe-editor.tsx` (mount two `<StepEditor>` instances)

**Interfaces:**
- Consumes: react-hook-form context, `useFieldArray({ name: "manualSteps" | "machineSteps" })`, `@dnd-kit/core` + `@dnd-kit/sortable`.
- Produces: `<StepEditor method="manual"|"machine" ingredients units locale />`; `<SortableStep id index method ... />`.

Behavior: a list of step cards; drag handle reorders via dnd-kit `arrayMove` + `move(from, to)` from useFieldArray (which auto-keeps step order; `stepNumber` is assigned at payload-build time by array position — see Task 6 `buildPayload`). Each card has an instruction textarea; machine cards additionally render `<ProgramStepForm>` (Task 10 wires program/params) and both render `<StepIngredientAllocator>` (Task 10). Add/remove step buttons.

- [ ] **Step 1: Implement `SortableStep`**

```tsx
// web/components/recipes/editor/sortable-step.tsx
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

export function SortableStep({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="rounded-md border p-3"
    >
      <button type="button" className="cursor-grab text-muted-foreground" aria-label="Drag to reorder" {...attributes} {...listeners}>
        ⠿
      </button>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Implement `StepEditor`**

```tsx
// web/components/recipes/editor/step-editor.tsx
"use client";

import { useFormContext, useFieldArray } from "react-hook-form";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { SortableStep } from "./sortable-step";
import { ProgramStepForm } from "./program-step-form";
import { StepIngredientAllocator } from "./step-ingredient-allocator";
import type { RecipeFormValues, FormStepValues } from "@/lib/schemas/recipe";
import type { IngredientLite, UnitLite } from "@/lib/queries/recipes";
import type { Locale } from "@/lib/i18n/config";

const EMPTY_STEP: FormStepValues = {
  instruction: "", programType: "", temperature: null, durationSeconds: null,
  speed: null, turbo: false, direction: "", weightGrams: null, ingredients: [],
};

export function StepEditor({
  method, ingredients, units, locale,
}: { method: "manual" | "machine"; ingredients: IngredientLite[]; units: UnitLite[]; locale: Locale }) {
  const { t } = useT();
  const name = method === "manual" ? "manualSteps" : "machineSteps";
  const { control, register } = useFormContext<RecipeFormValues>();
  const { fields, append, remove, move } = useFieldArray({ control, name });
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      const from = fields.findIndex((f) => f.id === active.id);
      const to = fields.findIndex((f) => f.id === over.id);
      if (from !== -1 && to !== -1) move(from, to); // useFieldArray.move handles the reorder
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">
        {t(method === "manual" ? "steps.manualTitle" : "steps.machineTitle")}
      </h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {fields.map((field, idx) => (
              <SortableStep key={field.id} id={field.id}>
                <div className="space-y-2">
                  {method === "machine" && <ProgramStepForm name={name} index={idx} />}
                  <textarea
                    {...register(`${name}.${idx}.instruction`)}
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    rows={2}
                    placeholder={t("steps.instructionPlaceholder")}
                  />
                  <StepIngredientAllocator name={name} index={idx} ingredients={ingredients} units={units} locale={locale} />
                  <Button type="button" variant="ghost" onClick={() => remove(idx)}>{t("common.remove")}</Button>
                </div>
              </SortableStep>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button type="button" variant="outline" onClick={() => append({ ...EMPTY_STEP, ingredients: [] })}>
        {t("steps.add")}
      </Button>
    </section>
  );
}
```

- [ ] **Step 3: Mount both editors** in `recipe-editor.tsx` (manual then machine) at the step stub locations.

- [ ] **Step 4: Add i18n keys** to both locales: `steps.manualTitle`, `steps.machineTitle`, `steps.instructionPlaceholder`, `steps.add`. EN: `"Manual steps"`, `"Machine steps"`, `"What to do in this step…"`, `"Add step"`. DE: `"Manuelle Schritte"`, `"Maschinen-Schritte"`, `"Was in diesem Schritt zu tun ist…"`, `"Schritt hinzufügen"`.

- [ ] **Step 5: Verify tsc + build + suite**

Run: `cd web && npx tsc --noEmit && npm test && npm run build`
Expected: clean (Task 10 provides `ProgramStepForm` + `StepIngredientAllocator`; this task will not compile until those exist — see note).

> **Sequencing note:** `step-editor.tsx` imports `ProgramStepForm` and `StepIngredientAllocator` (Task 10). To keep each task independently green, create minimal stub files for both at the START of this task (returning `null`, with the exact props below), then flesh them out in Task 10:
> ```tsx
> // program-step-form.tsx (stub) — props: { name: "manualSteps"|"machineSteps"; index: number }
> export function ProgramStepForm(_: { name: "manualSteps"|"machineSteps"; index: number }) { return null; }
> // step-ingredient-allocator.tsx (stub) — props below
> import type { IngredientLite, UnitLite } from "@/lib/queries/recipes";
> import type { Locale } from "@/lib/i18n/config";
> export function StepIngredientAllocator(_: { name: "manualSteps"|"machineSteps"; index: number; ingredients: IngredientLite[]; units: UnitLite[]; locale: Locale }) { return null; }
> ```
> Commit the stubs with this task so it builds; Task 10 replaces the bodies.

- [ ] **Step 6: Commit**

```bash
git add web/components/recipes/editor/step-editor.tsx web/components/recipes/editor/sortable-step.tsx web/components/recipes/editor/program-step-form.tsx web/components/recipes/editor/step-ingredient-allocator.tsx web/components/recipes/recipe-editor.tsx web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json
git commit -m "feat(web): editor step list with drag-reorder (Plan 6b)"
```

---

## Task 10: Machine program form + per-step ingredient allocation

**Files:**
- Modify: `web/components/recipes/editor/program-step-form.tsx`
- Modify: `web/components/recipes/editor/step-ingredient-allocator.tsx`

**Interfaces:**
- Consumes: react-hook-form context; `PROGRAM_PARAMS`, `validateProgramStep` (`lib/domain/recipes/program-validation.ts`); `validateStepIngredientTotals` (`lib/domain/recipes/step-validation.ts`); `useFieldArray` for the nested `ingredients` array under a step.
- Produces: full `ProgramStepForm` and `StepIngredientAllocator` (props as declared in Task 9).

- [ ] **Step 1: Implement `ProgramStepForm`** (program grid + params gated by `PROGRAM_PARAMS`, live validation message)

```tsx
// web/components/recipes/editor/program-step-form.tsx
"use client";

import { useFormContext } from "react-hook-form";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PROGRAM_PARAMS, validateProgramStep } from "@/lib/domain/recipes/program-validation";
import type { RecipeFormValues } from "@/lib/schemas/recipe";

const PROGRAMS = Object.keys(PROGRAM_PARAMS);

export function ProgramStepForm({ name, index }: { name: "manualSteps" | "machineSteps"; index: number }) {
  const { t } = useT();
  const { watch, setValue, register } = useFormContext<RecipeFormValues>();
  const step = watch(`${name}.${index}`);
  const programType = step?.programType ?? "";
  const params = programType ? PROGRAM_PARAMS[programType] : [];
  const fieldNames = new Set(params.map(([f]) => f));

  const errors = programType
    ? validateProgramStep(programType, {
        temperature: step.temperature, durationSeconds: step.durationSeconds, speed: step.speed,
        direction: step.direction || null, turbo: step.turbo, weightGrams: step.weightGrams,
      })
    : [];

  if (!programType) {
    return (
      <div className="flex flex-wrap gap-1">
        {PROGRAMS.map((p) => (
          <Button key={p} type="button" size="sm" variant="outline"
            onClick={() => setValue(`${name}.${index}.programType`, p)}>
            {t(`steps.programs.${p}`)}
          </Button>
        ))}
        <span className="self-center text-xs text-muted-foreground">{t("steps.orFreeText")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t(`steps.programs.${programType}`)}</span>
        <Button type="button" size="sm" variant="ghost" onClick={() => setValue(`${name}.${index}.programType`, "")}>
          {t("steps.changeProgram")}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {fieldNames.has("temperature") && (
          <Input type="number" placeholder={t("steps.temperature")} {...register(`${name}.${index}.temperature`, { setValueAs: (v) => (v === "" ? null : Number(v)) })} />
        )}
        {fieldNames.has("duration_seconds") && (
          <Input type="number" placeholder={t("steps.durationSeconds")} {...register(`${name}.${index}.durationSeconds`, { setValueAs: (v) => (v === "" ? null : Number(v)) })} />
        )}
        {fieldNames.has("speed") && (
          <Input type="number" placeholder={t("steps.speed")} {...register(`${name}.${index}.speed`, { setValueAs: (v) => (v === "" ? null : Number(v)) })} />
        )}
        {fieldNames.has("weight_grams") && (
          <Input type="number" placeholder={t("steps.weightGrams")} {...register(`${name}.${index}.weightGrams`, { setValueAs: (v) => (v === "" ? null : Number(v)) })} />
        )}
        {fieldNames.has("direction") && (
          <select className="rounded-md border bg-background p-2 text-sm" {...register(`${name}.${index}.direction`)}>
            <option value="">—</option>
            <option value="LEFT">{t("steps.directionLeft")}</option>
            <option value="RIGHT">{t("steps.directionRight")}</option>
          </select>
        )}
        {fieldNames.has("turbo") && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register(`${name}.${index}.turbo`)} /> {t("steps.turbo")}
          </label>
        )}
      </div>
      {errors.length > 0 && <p className="text-xs text-destructive">{errors[0]}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Implement `StepIngredientAllocator`** (allocate recipe ingredients to a step; live over-allocation highlight via `validateStepIngredientTotals`)

```tsx
// web/components/recipes/editor/step-ingredient-allocator.tsx
"use client";

import { useFormContext, useFieldArray } from "react-hook-form";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateStepIngredientTotals } from "@/lib/domain/recipes/step-validation";
import type { RecipeFormValues } from "@/lib/schemas/recipe";
import type { IngredientLite, UnitLite } from "@/lib/queries/recipes";
import type { Locale } from "@/lib/i18n/config";

export function StepIngredientAllocator({
  name, index, ingredients, locale,
}: { name: "manualSteps" | "machineSteps"; index: number; ingredients: IngredientLite[]; units: UnitLite[]; locale: Locale }) {
  const { t } = useT();
  const { control, register, watch } = useFormContext<RecipeFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: `${name}.${index}.ingredients` });

  const recipeIngredients = watch("ingredients");
  const manualSteps = watch("manualSteps");
  const machineSteps = watch("machineSteps");

  // Compute over-allocation across ALL steps (mirrors server validation).
  const allStepIngredients = [...manualSteps, ...machineSteps].flatMap((s) =>
    s.ingredients.map((si) => ({ recipeIngredientOrder: si.recipeIngredientIndex, quantity: si.quantity || "0" })),
  );
  const overErrors = validateStepIngredientTotals(
    recipeIngredients.map((ri, order) => ({ order, quantity: ri.quantity || "0" })),
    allStepIngredients,
  );
  const overAllocated = overErrors.length > 0;

  const displayName = (ri: RecipeFormValues["ingredients"][number]) => {
    if (ri.ingredientId) {
      const match = ingredients.find((i) => i.id === ri.ingredientId);
      if (match) return locale === "de" ? match.nameDe : match.nameEn;
    }
    return ri.nameEn || t("steps.unnamedIngredient");
  };

  return (
    <div className="space-y-1">
      {fields.map((f, i) => (
        <div key={f.id} className="flex items-center gap-2">
          <select className="rounded-md border bg-background p-1 text-sm" {...register(`${name}.${index}.ingredients.${i}.recipeIngredientIndex`, { valueAsNumber: true })}>
            {recipeIngredients.map((ri, order) => (
              <option key={order} value={order}>{displayName(ri)}</option>
            ))}
          </select>
          <Input className={`w-20 ${overAllocated ? "border-destructive" : ""}`} placeholder={t("ingredients.quantity")} {...register(`${name}.${index}.ingredients.${i}.quantity`)} />
          <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>{t("common.remove")}</Button>
        </div>
      ))}
      {recipeIngredients.length > 0 && (
        <Button type="button" variant="outline" size="sm"
          onClick={() => append({ recipeIngredientIndex: 0, quantity: "" })}>
          {t("steps.addStepIngredient")}
        </Button>
      )}
      {overAllocated && <p className="text-xs text-destructive">{t("steps.overAllocated")}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Add i18n keys** to both locales: `steps.programs.<TYPE>` for all 13 program types, plus `steps.orFreeText`, `steps.changeProgram`, `steps.temperature`, `steps.durationSeconds`, `steps.speed`, `steps.weightGrams`, `steps.directionLeft`, `steps.directionRight`, `steps.turbo`, `steps.addStepIngredient`, `steps.overAllocated`, `steps.unnamedIngredient`. Use the program display labels from `frontend/src/constants/machinePrograms.ts` (EN) and their German equivalents already in the old frontend's locale files (`frontend/src/i18n/`). Verify EN/DE key parity.

- [ ] **Step 4: Verify tsc + build + suite**

Run: `cd web && npx tsc --noEmit && npm test && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add web/components/recipes/editor/program-step-form.tsx web/components/recipes/editor/step-ingredient-allocator.tsx web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json
git commit -m "feat(web): machine program form + step ingredient allocation (Plan 6b)"
```

---

## Task 11: Tag selector + inline create

**Files:**
- Create: `web/components/recipes/editor/tag-selector.tsx`
- Modify: `web/components/recipes/recipe-editor.tsx` (mount `<TagSelector>`)

**Interfaces:**
- Consumes: react-hook-form context (`tagIds` field), `RecipeTagDto[]`, `createTagAction` (Task 5), `useT`, `Locale`.
- Produces: `<TagSelector tags locale />`.

Behavior: tags grouped by category with checkboxes bound to `tagIds`; an inline "create new tag" control (category select + name inputs) calls `createTagAction`, and on success appends the new tag id to the selection and the local tag list. Client-side dedupe prevents creating a name that already exists in that category.

- [ ] **Step 1: Implement `TagSelector`**

```tsx
// web/components/recipes/editor/tag-selector.tsx
"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { useT } from "@/lib/i18n/provider";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTagAction } from "@/app/(app)/actions";
import type { RecipeFormValues } from "@/lib/schemas/recipe";
import type { RecipeTagDto } from "@/lib/queries/recipes";
import type { Locale } from "@/lib/i18n/config";

const CATEGORIES = ["DIETARY", "PROTEIN", "CUISINE", "MEAL_TYPE"] as const;

export function TagSelector({ tags, locale }: { tags: RecipeTagDto[]; locale: Locale }) {
  const { t } = useT();
  const { watch, setValue } = useFormContext<RecipeFormValues>();
  const selected = watch("tagIds");
  const [localTags, setLocalTags] = useState<RecipeTagDto[]>(tags);
  const [creating, setCreating] = useState(false);
  const [newCat, setNewCat] = useState<string>("CUISINE");
  const [newEn, setNewEn] = useState("");
  const [newDe, setNewDe] = useState("");

  const tagName = (tag: RecipeTagDto) => (locale === "de" ? tag.nameDe : tag.nameEn);

  function toggle(id: string) {
    setValue("tagIds", selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  async function create() {
    if (!newEn.trim() || !newDe.trim()) return;
    const dup = localTags.some((tg) => tg.category === newCat && tg.nameEn.toLowerCase() === newEn.trim().toLowerCase());
    if (dup) { toast.error(t("tags.duplicate")); return; }
    setCreating(true);
    const res = await createTagAction({ category: newCat, nameEn: newEn.trim(), nameDe: newDe.trim() });
    setCreating(false);
    if (!res.ok) { toast.error(res.message || t("common.error")); return; }
    const created: RecipeTagDto = { id: res.data.id, category: newCat, nameEn: newEn.trim(), nameDe: newDe.trim() };
    setLocalTags([...localTags, created]);
    setValue("tagIds", [...selected, created.id]);
    setNewEn(""); setNewDe("");
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">{t("tags.title")}</h2>
      {CATEGORIES.map((cat) => {
        const inCat = localTags.filter((tg) => tg.category === cat);
        if (inCat.length === 0) return null;
        return (
          <div key={cat} className="space-y-1">
            <p className="text-xs uppercase text-muted-foreground">{t(`tags.categories.${cat}`)}</p>
            <div className="flex flex-wrap gap-1">
              {inCat.map((tg) => (
                <button key={tg.id} type="button" onClick={() => toggle(tg.id)}
                  className={`rounded-full border px-2 py-0.5 text-sm ${selected.includes(tg.id) ? "bg-primary text-primary-foreground" : ""}`}>
                  {tagName(tg)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-end gap-2 rounded-md border p-2">
        <select className="rounded-md border bg-background p-2 text-sm" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`tags.categories.${c}`)}</option>)}
        </select>
        <Input className="w-32" placeholder={t("tags.nameEn")} value={newEn} onChange={(e) => setNewEn(e.target.value)} />
        <Input className="w-32" placeholder={t("tags.nameDe")} value={newDe} onChange={(e) => setNewDe(e.target.value)} />
        <Button type="button" variant="outline" disabled={creating} onClick={create}>{t("tags.create")}</Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount it** in `recipe-editor.tsx` at the tag stub location.

- [ ] **Step 3: Add i18n keys** to both locales (check `tags` section — `categories.*` likely already exist): `tags.title`, `tags.categories.DIETARY/PROTEIN/CUISINE/MEAL_TYPE`, `tags.nameEn`, `tags.nameDe`, `tags.create`, `tags.duplicate`. Verify parity.

- [ ] **Step 4: Verify tsc + build + suite**

Run: `cd web && npx tsc --noEmit && npm test && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add web/components/recipes/editor/tag-selector.tsx web/components/recipes/recipe-editor.tsx web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json
git commit -m "feat(web): editor tag selector + inline create (Plan 6b)"
```

---

## Task 12: Wire editor entry points (Edit / Add buttons)

**Files:**
- Modify: `web/components/recipes/recipe-detail-actions.tsx` (Edit → `/recipes/${id}/edit`)
- Modify: recipe list page/components — "Add recipe" / quick-add → `/recipes/new?list=KNOWN|TO_TRY`

**Interfaces:**
- Consumes: the new routes from Task 7.

- [ ] **Step 1: Point the Edit affordance at the edit route**

In `recipe-detail-actions.tsx`, the Edit control currently links to `/recipes/${id}/edit` (per Plan 6 Task 5 it was already a link). Confirm it does, and that the route no longer 404s. If it is a disabled placeholder, make it an active `Link`:

```tsx
import Link from "next/link";
// ...
<Button asChild variant="outline"><Link href={`/recipes/${recipe.id}/edit`}>{t("recipes.editRecipe")}</Link></Button>
```

- [ ] **Step 2: Point the recipe-list "Add" buttons at the create route**

In the recipes list page/components (`app/(app)/recipes/page.tsx` and/or `components/recipes/*`), make `recipes.addRecipe` / `recipes.quickAdd` link to `/recipes/new?list=KNOWN` (Known tab) and `/recipes/new?list=TO_TRY` (To-Try tab) as appropriate:

```tsx
<Button asChild><Link href="/recipes/new?list=TO_TRY">{t("recipes.addRecipe")}</Link></Button>
```

- [ ] **Step 3: Verify tsc + build + suite**

Run: `cd web && npx tsc --noEmit && npm test && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add web/components/recipes web/app/\(app\)/recipes/page.tsx
git commit -m "feat(web): wire editor entry points from detail + list (Plan 6b)"
```

---

## Task 13: Tag management settings page

**Files:**
- Create: `web/app/(app)/settings/tags/page.tsx`
- Create: `web/app/(app)/settings/tags/tag-management-client.tsx`
- Modify: `web/app/(app)/settings/settings-client.tsx` (or settings page) — link to `/settings/tags`

**Interfaces:**
- Consumes: `listTags` (`lib/queries/recipes.ts`), `updateTagAction`/`deleteTagAction`/`createTagAction`/`resetTagsAction` (Task 5), `useT`.
- Produces: the tag management UI.

- [ ] **Step 1: Create the server route**

```tsx
// web/app/(app)/settings/tags/page.tsx
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { listTags } from "@/lib/queries/recipes";
import { TagManagementClient } from "./tag-management-client";

export default async function TagSettingsPage() {
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();
  return <TagManagementClient tags={listTags(db, householdId)} locale={locale} />;
}
```

- [ ] **Step 2: Create the client island** (list grouped by category; inline rename, delete with confirm, create, reset-to-defaults with confirm; `router.refresh()` after each mutation)

```tsx
// web/app/(app)/settings/tags/tag-management-client.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTagAction, updateTagAction, deleteTagAction, resetTagsAction } from "@/app/(app)/actions";
import type { RecipeTagDto } from "@/lib/queries/recipes";
import type { Locale } from "@/lib/i18n/config";

const CATEGORIES = ["DIETARY", "PROTEIN", "CUISINE", "MEAL_TYPE"] as const;

export function TagManagementClient({ tags, locale }: { tags: RecipeTagDto[]; locale: Locale }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState<string>("CUISINE");
  const [newEn, setNewEn] = useState("");
  const [newDe, setNewDe] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast.error(res.message || t("common.error")); return false; }
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t("tags.manageTitle")}</h1>

      {CATEGORIES.map((cat) => {
        const inCat = tags.filter((tg) => tg.category === cat);
        return (
          <section key={cat} className="space-y-2">
            <h2 className="text-sm uppercase text-muted-foreground">{t(`tags.categories.${cat}`)}</h2>
            {inCat.map((tg) => (
              <TagRow key={tg.id} tag={tg} locale={locale} busy={busy} run={run} />
            ))}
          </section>
        );
      })}

      <section className="flex flex-wrap items-end gap-2 rounded-md border p-2">
        <select className="rounded-md border bg-background p-2 text-sm" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`tags.categories.${c}`)}</option>)}
        </select>
        <Input className="w-32" placeholder={t("tags.nameEn")} value={newEn} onChange={(e) => setNewEn(e.target.value)} />
        <Input className="w-32" placeholder={t("tags.nameDe")} value={newDe} onChange={(e) => setNewDe(e.target.value)} />
        <Button type="button" disabled={busy} onClick={async () => {
          if (!newEn.trim() || !newDe.trim()) return;
          const ok = await run(() => createTagAction({ category: newCat, nameEn: newEn.trim(), nameDe: newDe.trim() }));
          if (ok) { setNewEn(""); setNewDe(""); }
        }}>{t("tags.create")}</Button>
      </section>

      <Button type="button" variant="destructive" disabled={busy} onClick={async () => {
        if (!confirm(t("tags.resetConfirm"))) return;
        await run(() => resetTagsAction());
      }}>{t("tags.reset")}</Button>
    </div>
  );
}

function TagRow({ tag, locale, busy, run }: {
  tag: RecipeTagDto; locale: Locale; busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; message?: string }>) => Promise<boolean>;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [en, setEn] = useState(tag.nameEn);
  const [de, setDe] = useState(tag.nameDe);

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input className="w-32" value={en} onChange={(e) => setEn(e.target.value)} />
        <Input className="w-32" value={de} onChange={(e) => setDe(e.target.value)} />
        <Button type="button" size="sm" disabled={busy} onClick={async () => {
          const ok = await run(() => updateTagAction(tag.id, { nameEn: en.trim(), nameDe: de.trim() }));
          if (ok) setEditing(false);
        }}>{t("common.save")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-sm">{locale === "de" ? tag.nameDe : tag.nameEn}</span>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>{t("common.edit")}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={async () => {
        if (!confirm(t("tags.deleteConfirmPlain"))) return;
        await run(() => deleteTagAction(tag.id));
      }}>{t("common.remove")}</Button>
    </div>
  );
}
```

- [ ] **Step 3: Link from settings**

In `settings-client.tsx` (or the settings page), add a link/section to `/settings/tags`:

```tsx
import Link from "next/link";
// ...
<section className="space-y-2">
  <h2 className="text-sm font-medium">{t("tags.manageTitle")}</h2>
  <Button asChild variant="outline"><Link href="/settings/tags">{t("tags.manageLink")}</Link></Button>
</section>
```

- [ ] **Step 4: Add i18n keys** to both locales: `tags.manageTitle`, `tags.manageLink`, `tags.reset`, `tags.resetConfirm`, `tags.deleteConfirmPlain`, `common.edit` (reuse if present). Verify parity.

- [ ] **Step 5: Verify tsc + build + suite**

Run: `cd web && npx tsc --noEmit && npm test && npm run build`
Expected: clean; `/settings/tags` route present.

- [ ] **Step 6: Commit**

```bash
git add web/app/\(app\)/settings/tags web/app/\(app\)/settings/settings-client.tsx web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json
git commit -m "feat(web): tag management settings page (Plan 6b)"
```

---

## Task 14: i18n parity audit + carry-forward cleanup

**Files:**
- Modify: `web/lib/i18n/locales/en.json`, `web/lib/i18n/locales/de.json`
- Modify: shopping-days validation component (add `aria-invalid`)

**Interfaces:** none (cleanup).

- [ ] **Step 1: Run the i18n parity check**

Run:
```bash
cd web && node -e "const en=require('./lib/i18n/locales/en.json'),de=require('./lib/i18n/locales/de.json');const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?flat(v,p+k+'.'):[p+k]);const a=new Set(flat(en)),b=new Set(flat(de));const onlyA=[...a].filter(x=>!b.has(x)),onlyB=[...b].filter(x=>!a.has(x));console.log('en-only:',onlyA);console.log('de-only:',onlyB);"
```
Expected: both arrays empty. If not, add the missing keys to reach parity.

- [ ] **Step 2: Remove orphan i18n keys**

Delete `recipes.deleteConfirm` (the live key is `recipes.confirmDelete`) and the `cooking.prev` / `cooking.next` synonyms (live keys are `cooking.prevStep` / `cooking.nextStep`) from BOTH locales — but FIRST grep the codebase to confirm they are unreferenced:

```bash
cd web && grep -rn "recipes.deleteConfirm\|cooking\.prev\b\|cooking\.next\b\|\"cooking.prev\"\|\"cooking.next\"" app components lib | grep -v locales
```
If any reference exists, update it to the live key instead of deleting. Then remove the orphan keys from `en.json` and `de.json`.

- [ ] **Step 3: Add `aria-invalid` to shopping-days validation**

Locate the shopping-days input in the plan setup / generate drawer (`components/plan/generate-plan-drawer.tsx` or similar) and add `aria-invalid={!!error}` to the days input that currently only toasts on invalid input.

- [ ] **Step 4: Verify tsc + build + suite + parity**

Run: `cd web && npx tsc --noEmit && npm test && npm run build` and re-run the parity check from Step 1.
Expected: clean; parity arrays empty.

- [ ] **Step 5: Commit**

```bash
git add web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json web/components/plan
git commit -m "chore(web): i18n parity + carry-forward cleanup (Plan 6b)"
```

---

## Task 15: Integration verification + progress ledger

**Files:**
- Modify: `.superpowers/sdd/progress.md` (append Plan 6b section)

- [ ] **Step 1: Full verification sweep**

Run:
```bash
cd web && npm test && npx tsc --noEmit && npm run build && npm run lint
```
Expected: all tests green (Plan 6 baseline + new Plan 6b service/mapper tests), no type errors, build succeeds with the new routes (`/recipes/new`, `/recipes/[id]/edit`, `/settings/tags`), lint clean.

- [ ] **Step 2: Manual smoke (best-effort, may be deferred)**

If a seeded/onboarded household DB + live session is available, run `npm run dev` and verify: create a recipe (with a typed-new ingredient, a manual step, a machine step with a program, allocated step-ingredients, and tags) → saves and redirects to detail; edit it → changes persist; create/rename/delete a tag and reset-to-defaults under `/settings/tags`. If no seeded session is available, note this as deferred (consistent with Plans 4–6).

- [ ] **Step 3: Append the Plan 6b ledger to `.superpowers/sdd/progress.md`**

Summarize: commits range, test count delta, which carry-forward items are now closed (`/recipes/[id]/edit` route live; `seedDefaultTags` implemented; tag CRUD/reset + ingredient create built; orphan keys removed; shopping-days `aria-invalid` added), and remaining carry-forward for Plan 7 (image serving/upload/generate/delete, AI generate, bulk-create; `loadSelectablePools` inArray hardening; `renewIteration` redundant re-select).

- [ ] **Step 4: Commit**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs(web): Plan 6b progress ledger + integration verification (Plan 6b)"
```

---

## Self-Review

**Spec coverage:**
- Recipe create/edit editor → Tasks 6–12. ✓
- `upsertRecipe` transactional persistence (replace-all, order remap, validate-first) → Task 4. ✓
- Ingredient auto-create → Task 4 (in upsert) + Task 3 (`createIngredient`). ✓
- Tag CRUD + reset + `seedDefaultTags` (37 defaults) → Tasks 1–2 + actions Task 5 + UI Task 13. ✓
- Description field → Tasks 6 (schema/mappers) + 7 (editor field). ✓
- Drag-and-drop reordering (@dnd-kit) → Task 9. ✓
- Carry-forward cleanup (orphan keys, `aria-invalid`) → Task 14. ✓
- Out of scope (images/AI/bulk-create) → not built; remaining carry-forward noted in Task 15. ✓

**Type consistency:** `UpsertRecipeInput`/`UpsertStepInput`/`UpsertIngredientInput` defined in Task 4 are consumed verbatim by `buildPayload` (Task 6) and `saveRecipeAction` (Task 5). `RecipeFormValues`/`FormStepValues`/`FormIngredientValues` defined in Task 6 are consumed by the editor + sub-components (Tasks 7–11). `RecipeTagDto`/`IngredientLite`/`UnitLite`/`RecipeDetail`/`CookingStepDto`/`StepIngredientDto` are reused from `lib/queries/recipes.ts`. Sub-component prop contracts (`ProgramStepForm`, `StepIngredientAllocator`, `IngredientRows`, `StepEditor`, `TagSelector`) are declared in their tasks and stubbed in Task 9 to keep builds green.

**Placeholder scan:** no TBD/TODO; every code step shows real code; i18n steps list exact keys + EN/DE values (or instruct to port from the old frontend's locale files for the program labels).

**Note on reordering (Task 9):** `useFieldArray.move(from, to)` performs the reorder directly from the drag-end indices — no `arrayMove` helper is imported.
