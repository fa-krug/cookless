# Next.js Migration — Plan 6b: Recipe Editor + Tag Management (Design)

Date: 2026-06-27
Branch: `design/nextjs-migration`
Status: approved, ready for implementation plan

## Context

Plan 6 (Mutations / Server Actions) is complete and merge-ready. It deliberately
deferred the recipe create/edit editor and the tag/ingredient write surface. Carry-forward
notes (`.superpowers/sdd/progress.md`) list these as Plan 6b:

- `/recipes/[id]/edit` still 404s — no recipe editor exists.
- `seedDefaultTags` is an unimplemented stub in `lib/households/manage.ts`.
- Tag CRUD / reset and ingredient create are unbuilt.
- Minor cleanup: orphan `recipes.deleteConfirm` + `cooking.prev`/`cooking.next` synonym i18n
  keys; shopping-days validation lacks `aria-invalid`.

The new `web/` app writes **directly to its SQLite DB via Drizzle** — it does **not** call the
Django API. The Django backend (`backend/recipes/`) is the behavioral source of truth for the
write/seed logic being replicated here.

## Scope

**In scope**
- Recipe create + edit editor (routes, client form island, sub-components).
- `upsertRecipe` persistence service (create + update, replace-all nested data, transactional).
- Ingredient auto-create (unknown ingredient name → global ingredient row).
- `createIngredient` service.
- Full tag management: `createTag` / `updateTag` / `deleteTag` / `resetTags`, plus
  `seedDefaultTags` (37 defaults ported from `backend/recipes/tag_defaults.py`) wired into
  household creation, and a `settings/tags` management UI.
- Description field in the editor (model + read page already support it).
- Drag-and-drop step reordering (`@dnd-kit`).
- Carry-forward cleanup (orphan i18n keys, shopping-days `aria-invalid`).

**Out of scope (→ Plan 7)**
- Recipe image upload / generate / delete.
- AI recipe generation.
- `bulk-create`.

## Architecture & data flow

Follows the established Plan 6 pattern: server-action entry points wrapped in `withHousehold`,
returning the `Result<T>` discriminated union (`lib/actions/result.ts`); domain logic in pure-ish
service functions in `lib/recipes/`; client islands use `useT()` and only receive serializable
props.

### Routes (server components)

- `app/(app)/recipes/new/page.tsx` — reads `?list=KNOWN|TO_TRY` search param (default `TO_TRY`),
  loads ingredients/units/tags via existing queries, renders the editor island with empty initial
  values.
- `app/(app)/recipes/[id]/edit/page.tsx` — `params: Promise<{ id: string }>` (await — matches
  sibling `[id]` route), household-scoped `getRecipe(...)` + `notFound()` on miss, loads
  ingredients/units/tags, maps `RecipeDetail` → editor initial values, renders the editor island.

### Editor client island

`components/recipes/recipe-editor.tsx` plus focused sub-components. One `react-hook-form` form
(zod resolver), `useFieldArray` for `ingredients`, `manualSteps`, `machineSteps`. On submit it
builds the payload and calls `saveRecipeAction(id | null, payload)`; on `res.ok` it
`router.push("/recipes/${res.data.id}")` and toasts success, on `!res.ok` it toasts the error.
Save button shows a pending spinner.

## Persistence — `upsertRecipe` service (`lib/recipes/upsert.ts`)

Replicates the Django write rules (`backend/recipes/api.py`), all within one
`db.transaction(...)` (better-sqlite3 synchronous transactions, consistent with existing services):

1. **Validate before writing.** `validateStepIngredientTotals` and `validateProgramStep` (reuse
   existing domain validators in `lib/domain/recipes/`) run first; any failure throws
   `AuthError(422)` (same surfacing path as `validateShoppingDays` in Plan 6). Manual steps must
   carry no `programType`; a non-program step requires a non-empty instruction. Empty steps
   (no instruction and no program) are dropped at payload-build time.
2. **Auto-create ingredients.** Ingredient rows arriving with a name but no `ingredientId` →
   insert a global `ingredients` row (`nameEn`/`nameDe` = typed name, `category: "OTHER"`),
   reusing the new id within the transaction. Matches Django bulk-create semantics.
3. **Recipe row.** Create path: insert with a new uuid, `createdAt`/`updatedAt = now`. Edit path:
   `ownedRecipe(db, householdId, recipeId)` (404 on miss/cross-tenant) then update, `updatedAt = now`.
4. **Replace-all nested data.** Delete then recreate `recipeIngredients`, `cookingSteps`
   (MANUAL + MACHINE), `stepIngredients`, and `recipeTags`. Step-ingredients reference recipe
   ingredients **by order index**, remapped to the freshly-inserted recipe-ingredient PKs via an
   `order -> newId` map (no dangling references; invalid order → `AuthError(422)`). Tags are
   filtered to household-owned ids before insert (cross-tenant guard).
5. Returns `{ id }`.

`saveRecipeAction(id: string | null, payload)` in `app/(app)/actions.ts` wraps `upsertRecipe` in
`withHousehold`, and on `ok` revalidates `/recipes` and `/recipes/[id]`.

### Edit initial-value mapping

`StepIngredientDto.recipeIngredientId` is a PK; the editor converts it to the owning recipe
ingredient's **order** for the form. The submit payload is therefore order-based and survives the
delete-and-recreate cycle.

## Editor sub-components

- **Ingredient picker** (drawer/section): search existing ingredients by localized name; selecting
  one fills `ingredientId`; a free-typed name with no match is flagged for auto-create on save.
  Fields per row: quantity (string), unit (select), order.
- **Step editor** (one instance for manual, one for machine): add / remove steps, `@dnd-kit`
  drag-to-reorder with auto-renumber, per-step ingredient allocation with live over-allocation
  highlighting (reuse `validateStepIngredientTotals`). Machine steps additionally show a program
  selector grid and parameter inputs (temperature / duration / speed / direction / weight / turbo)
  gated by `PROGRAM_PARAMS` from `lib/domain/recipes/program-validation.ts`.
- **Tag selector**: tags grouped by category, multi-select; an inline "create new tag" control
  calls `createTagAction` and adds the new tag to the selection.
- **Plain fields**: title (required, non-empty), description (textarea), default servings (≥1),
  prep time, cook time.

## Tag management (`lib/recipes/tags.ts` + `app/(app)/settings/tags`)

**Services** (household-scoped, ownership-checked):
- `createTag(db, householdId, { category, nameEn, nameDe })` — `isDefault = false`; unique per
  `(householdId, category, nameEn)` (DB constraint already present).
- `updateTag(db, householdId, tagId, { nameEn, nameDe })` — name fields only; category and
  `isDefault` immutable; ownership-checked.
- `deleteTag(db, householdId, tagId)` — ownership-checked; cascades `recipeTags`.
- `resetTags(db, householdId)` — delete all household tags, then reseed defaults.

**`seedDefaultTags`** — implement the stub in `lib/households/manage.ts` by porting the 37 defaults
from `backend/recipes/tag_defaults.py` into `lib/recipes/tag-defaults.ts` (EN + DE across DIETARY /
PROTEIN / CUISINE / MEAL_TYPE). Idempotent (skip existing `(category, nameEn)` pairs). New
households receive tags on creation.

**UI** — new `app/(app)/settings/tags/page.tsx` (server component lists tags grouped by category)
plus a client island for inline rename, delete (confirm dialog), create, and reset-to-defaults
(confirm dialog). Linked from the existing settings page. Actions revalidate `/settings/tags` and
`/recipes`.

## Ingredient create

`createIngredient(db, { nameEn, nameDe, category })` — global, no dedup (matches Django). Primarily
invoked transactionally inside `upsertRecipe`; no standalone UI beyond the editor's type-to-create.

## Validation, i18n, testing, cleanup

- **Validation**: zod client-side for fast feedback (title, servings); server-side domain
  validators are the source of truth.
- **i18n**: add editor + tag-management keys to both `en` and `de`; key sets must stay identical
  (parity check, consistent with Plan 6).
- **Testing (TDD)**: unit tests for `upsertRecipe` (create; edit/replace-all; ingredient
  auto-create; step-ingredient order remap; over-allocation → 422; cross-tenant → 404), tag
  services (CRUD, ownership, reset, seed idempotency), and `seedDefaultTags`.
- **Cleanup (carry-forward)**: remove orphan `recipes.deleteConfirm` and `cooking.prev` /
  `cooking.next` synonym i18n keys; add `aria-invalid` to shopping-days validation.

## Error handling

Server: `AuthError(404)` for missing / cross-tenant rows, `AuthError(422)` for validation failures,
both surfaced through the `Result` union by `fail()`. Client: toast on `!res.ok`, inline field
errors from the zod resolver, save button shows a pending spinner during submission.

## Decisions

- Tag management lives at `/settings/tags` (the new app has no household page yet; revisit if a
  household-management plan lands later).
- Unknown ingredients are auto-created **inside the upsert transaction** rather than via a separate
  pre-save action — atomic, and matches Django bulk-create semantics.
- Step reordering uses `@dnd-kit` to match the existing app's UX (a new client dependency in `web/`).
- The editor edits `description`, closing the gap with the read page which already renders it.
