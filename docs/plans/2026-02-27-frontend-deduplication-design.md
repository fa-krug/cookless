# Frontend Deduplication Design

## Problem

The frontend has ~5,400+ lines of duplicated code across 20+ files. Key categories: repeated Tailwind class strings (32+ instances), identical React Query mutation boilerplate (40+ instances), duplicated dialog open/close logic, recipe form state/payload duplication between Create and Detail pages, and scattered cache key string literals.

## Approach: Bottom-up component extraction

Work in layers from smallest to largest. Each layer is independently testable and shippable.

## Layer 1: Shared UI Primitives

New files in `components/ui/`:

- **`Input.tsx`** — wraps `<input>` with standard border/focus/ring Tailwind classes. Props pass through to native element.
- **`Textarea.tsx`** — same pattern for `<textarea>`.
- **`Select.tsx`** — same pattern for `<select>`.
- **`Button.tsx`** — variants: `primary` (orange bg), `danger` (red text/hover), `icon` (small square icon button). Supports `disabled` styling.

Replaces 32+ repeated class strings across 10+ files.

## Layer 2: Composite Components

- **`TagSelector.tsx`** — tag category dropdown with checkboxes and inline "add new tag" form. Props: `selectedTagIds`, `onChange`, `groupedTags`. Replaces ~70 lines duplicated in RecipeCreatePage, RecipeDetailPage, and GenerateDrawer.
- Existing `IngredientForm` and `StepEditor` updated to use `Button` icon variant for add/remove buttons.

## Layer 3: Shared Hooks and Constants

- **`useDialog` hook** — extracts the identical `useRef<HTMLDialogElement>` + `useEffect` open/close/cancel logic (24 lines) from Modal and Drawer into one reusable hook. Returns `{ dialogRef, titleId }`.
- **`queryKeys.ts`** — centralized constant object (`{ recipes: ["recipes"], tags: ["tags"], mealPlan: ["meal-plan"], shoppingLists: ["shopping-lists"], household: ["household"] }`). Replaces 17+ scattered string literals across all hooks.
- Existing mutation hooks updated to use `queryKeys` constants. No factory abstraction needed — the per-mutation boilerplate is small once keys are centralized.

## Layer 4: Recipe Form Unification

- **`useRecipeForm(initialRecipe?)`** hook — manages all 11 state variables, payload-building logic, and auto-create-ingredient logic. Returns `{ fields, setters, buildPayload }`.
- **`RecipeFormFields.tsx`** — renders form fields (title, servings, times, ingredients, steps, tags) using shared UI primitives and TagSelector. Used by both Create and Detail pages.
- Pages shrink to: fetch data (Detail only) -> `useRecipeForm()` -> `<RecipeFormFields />` -> submit handler.

Eliminates ~120 lines of duplicated state + ~50 lines of duplicated payload logic.

## Layer 5: Cleanup Pass

- **`mutateWithToast`** helper — small utility wrapping `mutation.mutate(payload, { onSuccess, onError })` with standard toast messages. Keeps the pattern consistent.
- Update skeleton components to use new UI primitives where applicable.

## Out of Scope

- No changes to backend API or types.
- No new features — purely structural refactoring.
- No changes to routing or page structure beyond simplifying Create/Detail.

## Risk Mitigation

- Each layer is a separate commit, independently reviewable.
- Existing tests must pass after each layer.
- Visual regression checked manually after UI primitive extraction.
