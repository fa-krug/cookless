# Frontend Deduplication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate ~5,400 lines of duplicated frontend code through shared UI primitives, hooks, and components.

**Architecture:** Bottom-up extraction in 5 layers — UI primitives, composite components, shared hooks/constants, recipe form unification, cleanup. Each layer is independently shippable.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, TanStack React Query, Vitest

---

### Task 1: Create `Input` UI primitive

**Files:**
- Create: `frontend/src/components/ui/Input.tsx`

**Step 1: Create the Input component**

```tsx
import { forwardRef, type ComponentPropsWithoutRef } from "react";

const Input = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<"input">>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-md border border-gray-300 px-2 py-1.5 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export default Input;
```

**Step 2: Run existing tests to confirm nothing breaks**

Run: `cd frontend && npm test`
Expected: All tests pass (no consumers yet)

**Step 3: Commit**

```bash
git add frontend/src/components/ui/Input.tsx
git commit -m "feat(frontend): add Input UI primitive"
```

---

### Task 2: Create `Textarea` UI primitive

**Files:**
- Create: `frontend/src/components/ui/Textarea.tsx`

**Step 1: Create the Textarea component**

```tsx
import { forwardRef, type ComponentPropsWithoutRef } from "react";

const Textarea = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<"textarea">>(
  ({ className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      className={`w-full rounded-md border border-gray-300 px-2 py-1.5 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 ${className}`}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export default Textarea;
```

**Step 2: Commit**

```bash
git add frontend/src/components/ui/Textarea.tsx
git commit -m "feat(frontend): add Textarea UI primitive"
```

---

### Task 3: Create `Select` UI primitive

**Files:**
- Create: `frontend/src/components/ui/Select.tsx`

**Step 1: Create the Select component**

```tsx
import { forwardRef, type ComponentPropsWithoutRef } from "react";

const Select = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<"select">>(
  ({ className = "", ...props }, ref) => (
    <select
      ref={ref}
      className={`w-full rounded-md border border-gray-300 px-2 py-1.5 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 ${className}`}
      {...props}
    />
  ),
);
Select.displayName = "Select";

export default Select;
```

**Step 2: Commit**

```bash
git add frontend/src/components/ui/Select.tsx
git commit -m "feat(frontend): add Select UI primitive"
```

---

### Task 4: Replace input/select/textarea usages in `IngredientForm`

**Files:**
- Modify: `frontend/src/components/IngredientForm.tsx`

**Step 1: Replace the three input elements and one select element**

Import `Input` and `Select` from `../components/ui/Input` and `../components/ui/Select`.

Replace in `IngredientRowInput`:
- Line 128-135 (quantity input): Replace `<input ... className="w-16 shrink-0 rounded-md border border-gray-300 px-2 py-1.5 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">` with `<Input ... className="w-16 shrink-0" />`
- Line 138-148 (unit select): Replace `<select ... className="w-20 shrink-0 rounded-md border border-gray-300 px-2 py-1.5 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">` with `<Select ... className="w-20 shrink-0" />`
- Line 152-166 (ingredient autocomplete input): Replace `<input ... className="w-full rounded-md border border-gray-300 px-2 py-1.5 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">` with `<Input ... />`

**Step 2: Run tests**

Run: `cd frontend && npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add frontend/src/components/IngredientForm.tsx
git commit -m "refactor(frontend): use Input/Select primitives in IngredientForm"
```

---

### Task 5: Replace input/textarea usages in `SortableStep`

**Files:**
- Modify: `frontend/src/components/SortableStep.tsx`

**Step 1: Replace the textarea element**

Import `Textarea` from `./ui/Textarea`.

Replace line 67-72 (step textarea): Replace `<textarea ... className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">` with `<Textarea ... className="text-sm" />`

**Step 2: Run tests**

Run: `cd frontend && npm test`
Expected: All tests pass (StepEditor.test.tsx should still pass)

**Step 3: Commit**

```bash
git add frontend/src/components/SortableStep.tsx
git commit -m "refactor(frontend): use Textarea primitive in SortableStep"
```

---

### Task 6: Replace input usages in `RecipeCreatePage`

**Files:**
- Modify: `frontend/src/pages/RecipeCreatePage.tsx`

**Step 1: Replace all input elements using the repeated class pattern**

Import `Input` from `../components/ui/Input`.

Replace:
- Line 122-128 (title input): Replace className with `className="rounded-lg px-3 py-2 text-lg font-medium"`
- Line 137-144 (servings input): Remove the duplicated focus classes, use `<Input type="number" ... />`
- Line 150-157 (prep time input): Same
- Line 163-169 (cook time input): Same

**Step 2: Run tests**

Run: `cd frontend && npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add frontend/src/pages/RecipeCreatePage.tsx
git commit -m "refactor(frontend): use Input primitive in RecipeCreatePage"
```

---

### Task 7: Replace input usages in `RecipeDetailPage`

**Files:**
- Modify: `frontend/src/pages/RecipeDetailPage.tsx`

**Step 1: Replace all input elements using the repeated class pattern**

Import `Input` from `../components/ui/Input`.

Replace the same pattern as RecipeCreatePage:
- Line 371-377 (title input): Use `<Input className="rounded-lg px-3 py-2 text-lg font-medium" />`
- Line 386-393 (servings input): Use `<Input type="number" ... />`
- Line 399-406 (prep time input): Same
- Line 413-419 (cook time input): Same

**Step 2: Run tests**

Run: `cd frontend && npm test`
Expected: All tests pass (RecipeDetailPage skeleton tests should still pass)

**Step 3: Commit**

```bash
git add frontend/src/pages/RecipeDetailPage.tsx
git commit -m "refactor(frontend): use Input primitive in RecipeDetailPage"
```

---

### Task 8: Create `queryKeys` constants

**Files:**
- Create: `frontend/src/hooks/queryKeys.ts`

**Step 1: Create the query keys file**

```ts
export const queryKeys = {
  recipes: ["recipes"] as const,
  recipe: (id: string) => ["recipes", id] as const,
  tags: ["tags"] as const,
  mealPlans: ["meal-plans"] as const,
  mealPlan: (id: string) => ["meal-plans", id] as const,
  shoppingLists: ["shopping-lists"] as const,
  shoppingList: (id: string) => ["shopping-lists", id] as const,
  households: ["households"] as const,
  ingredients: ["ingredients"] as const,
  units: ["units"] as const,
};
```

**Step 2: Commit**

```bash
git add frontend/src/hooks/queryKeys.ts
git commit -m "feat(frontend): add centralized query key constants"
```

---

### Task 9: Use `queryKeys` in `useRecipes`

**Files:**
- Modify: `frontend/src/hooks/useRecipes.ts`

**Step 1: Replace all string literal query keys**

Import `queryKeys` from `./queryKeys`.

Replace:
- Line 9: `queryKey: ["recipes", listType, tagIds]` → `queryKey: [...queryKeys.recipes, listType, tagIds]`
- Line 28: `queryKey: ["recipes", "all-summaries"]` → `queryKey: [...queryKeys.recipes, "all-summaries"]`
- Line 39: `queryKey: ["recipes"]` → `queryKey: queryKeys.recipes`
- Line 47: `queryKey: ["recipes", id]` → `queryKey: queryKeys.recipe(id)`
- Line 59-60: `queryKey: ["recipes"]` and `["recipes", variables.id]` → `queryKeys.recipes` and `queryKeys.recipe(variables.id)`
- Line 71-72: Same pattern for move
- Line 83: `queryKey: ["recipes"]` → `queryKeys.recipes`

**Step 2: Run tests**

Run: `cd frontend && npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add frontend/src/hooks/useRecipes.ts frontend/src/hooks/queryKeys.ts
git commit -m "refactor(frontend): use queryKeys in useRecipes"
```

---

### Task 10: Use `queryKeys` in `useTags`

**Files:**
- Modify: `frontend/src/hooks/useTags.ts`

**Step 1: Replace all string literal query keys**

Import `queryKeys` from `./queryKeys`.

Replace all `{ queryKey: ["tags"] }` with `{ queryKey: queryKeys.tags }` and `{ queryKey: ["recipes"] }` with `{ queryKey: queryKeys.recipes }`.

**Step 2: Run tests and commit**

Run: `cd frontend && npm test`

```bash
git add frontend/src/hooks/useTags.ts
git commit -m "refactor(frontend): use queryKeys in useTags"
```

---

### Task 11: Use `queryKeys` in `useMealPlan`

**Files:**
- Modify: `frontend/src/hooks/useMealPlan.ts`

**Step 1: Replace all string literal query keys**

Import `queryKeys` from `./queryKeys`.

Replace all `["meal-plans"]` with `queryKeys.mealPlans`, `["meal-plans", id]` with `queryKeys.mealPlan(id)`, and `["shopping-lists"]` with `queryKeys.shoppingLists`.

**Step 2: Run tests and commit**

Run: `cd frontend && npm test`

```bash
git add frontend/src/hooks/useMealPlan.ts
git commit -m "refactor(frontend): use queryKeys in useMealPlan"
```

---

### Task 12: Use `queryKeys` in `useShoppingList`

**Files:**
- Modify: `frontend/src/hooks/useShoppingList.ts`

**Step 1: Replace all string literal query keys**

Import `queryKeys` from `./queryKeys`.

Replace all `["shopping-lists"]` with `queryKeys.shoppingLists` and `["shopping-lists", id]` with `queryKeys.shoppingList(id)`.

**Step 2: Run tests and commit**

Run: `cd frontend && npm test`

```bash
git add frontend/src/hooks/useShoppingList.ts
git commit -m "refactor(frontend): use queryKeys in useShoppingList"
```

---

### Task 13: Use `queryKeys` in `useHousehold`

**Files:**
- Modify: `frontend/src/hooks/useHousehold.ts`

**Step 1: Replace all string literal query keys**

Import `queryKeys` from `./queryKeys`.

Replace all `["households"]` with `queryKeys.households`.

**Step 2: Run tests and commit**

Run: `cd frontend && npm test`

```bash
git add frontend/src/hooks/useHousehold.ts
git commit -m "refactor(frontend): use queryKeys in useHousehold"
```

---

### Task 14: Use `queryKeys` in `useRecipeImage`

**Files:**
- Modify: `frontend/src/hooks/useRecipeImage.ts`

**Step 1: Replace all string literal query keys**

Import `queryKeys` from `./queryKeys`.

Replace all `["recipes"]` with `queryKeys.recipes` and `["recipes", variables.id]` / `["recipes", id]` with `queryKeys.recipe(...)`.

**Step 2: Run tests and commit**

Run: `cd frontend && npm test`

```bash
git add frontend/src/hooks/useRecipeImage.ts
git commit -m "refactor(frontend): use queryKeys in useRecipeImage"
```

---

### Task 15: Use `queryKeys` in remaining consumers

**Files:**
- Modify: `frontend/src/hooks/useIngredients.ts` (if it has `["ingredients"]` literals)
- Modify: `frontend/src/hooks/useUnits.ts` (if it has `["units"]` literals)
- Modify: `frontend/src/pages/RecipeCreatePage.tsx` (line 97: `queryKey: ["ingredients"]`)
- Modify: `frontend/src/pages/RecipeDetailPage.tsx` (line 197: `queryKey: ["ingredients"]`, line 216-228: `["recipes", recipe.list_type]`)

**Step 1: Replace all remaining string literal query keys**

Search all files for remaining `queryKey: ["` patterns and replace with `queryKeys.*`.

**Step 2: Run tests and commit**

Run: `cd frontend && npm test`

```bash
git add -A
git commit -m "refactor(frontend): use queryKeys in all remaining consumers"
```

---

### Task 16: Extract `useDialog` hook

**Files:**
- Create: `frontend/src/hooks/useDialog.ts`
- Modify: `frontend/src/components/ui/Modal.tsx`
- Modify: `frontend/src/components/ui/Drawer.tsx`

**Step 1: Create the useDialog hook**

```ts
import { useEffect, useId, useRef } from "react";

interface UseDialogOptions {
  open: boolean;
  onClose: () => void;
}

export function useDialog({ open, onClose }: UseDialogOptions) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previousFocusRef.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleCancel(e: Event) {
      e.preventDefault();
      onClose();
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose();
    }
  }

  return { dialogRef, titleId, handleBackdropClick };
}
```

**Step 2: Refactor Modal to use useDialog**

Replace Modal.tsx:

```tsx
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../../hooks/useDialog";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
};

export default function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  const { t } = useTranslation();
  const { dialogRef, titleId, handleBackdropClick } = useDialog({ open, onClose });

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
      className={`m-auto w-full rounded-2xl border-none bg-transparent p-0 backdrop:bg-black/40 ${SIZE_CLASSES[size]}`}
    >
      <div className="rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
```

**Step 3: Refactor Drawer to use useDialog**

Replace Drawer.tsx:

```tsx
import { useTranslation } from "react-i18next";
import { useDialog } from "../../hooks/useDialog";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxHeight?: string;
}

export default function Drawer({
  open,
  onClose,
  title,
  children,
  maxHeight = "85vh",
}: DrawerProps) {
  const { t } = useTranslation();
  const { dialogRef, titleId, handleBackdropClick } = useDialog({ open, onClose });

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
      className="m-0 mt-auto w-full max-w-lg border-none bg-transparent p-0 backdrop:bg-black/40"
    >
      <div
        className="rounded-t-2xl bg-white shadow-xl"
        style={{ maxHeight }}
      >
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        <div className="flex items-center justify-between px-4 pb-3">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {t("common.close")}
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-6" style={{ maxHeight: `calc(${maxHeight} - 5rem)` }}>
          {children}
        </div>
      </div>
    </dialog>
  );
}
```

**Step 4: Run tests**

Run: `cd frontend && npm test`
Expected: Modal.test.tsx and Drawer.test.tsx all pass unchanged

**Step 5: Commit**

```bash
git add frontend/src/hooks/useDialog.ts frontend/src/components/ui/Modal.tsx frontend/src/components/ui/Drawer.tsx
git commit -m "refactor(frontend): extract useDialog hook from Modal and Drawer"
```

---

### Task 17: Extract `TagSelector` component

**Files:**
- Create: `frontend/src/components/TagSelector.tsx`
- Modify: `frontend/src/pages/RecipeCreatePage.tsx`
- Modify: `frontend/src/pages/RecipeDetailPage.tsx`

**Step 1: Create the TagSelector component**

Extract the tag section from RecipeCreatePage lines 194-298 into a standalone component:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TAG_CATEGORIES, type GroupedTags, type TagCategory } from "../api/types";
import { useCreateTag } from "../hooks/useTags";
import { useCloseDetailsOnClickOutside } from "../hooks/useCloseDetailsOnClickOutside";
import { useDropUp } from "../hooks/useDropUp";

interface TagSelectorProps {
  groupedTags: GroupedTags;
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

export default function TagSelector({ groupedTags, selectedTagIds, onChange }: TagSelectorProps) {
  const { t, i18n } = useTranslation();
  const createTag = useCreateTag();
  const tagSectionRef = useCloseDetailsOnClickOutside<HTMLDivElement>();
  const tagDropUp = useDropUp();
  const [addingCategory, setAddingCategory] = useState<TagCategory | null>(null);
  const [newTagEn, setNewTagEn] = useState("");
  const [newTagDe, setNewTagDe] = useState("");

  return (
    <div ref={tagSectionRef} className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700">{t("tags.title")}</h3>
      <div className="flex flex-wrap gap-2">
        {TAG_CATEGORIES.map((category) => {
          const tags = groupedTags[category] || [];
          const selected = tags.filter((tag) => selectedTagIds.includes(tag.id));
          return (
            <details key={category} className="relative" ref={tagDropUp(category).ref} onToggle={tagDropUp(category).onToggle}>
              <summary className="cursor-pointer select-none rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm">
                {t(`tags.${category}`)}
                {selected.length > 0 && (
                  <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-xs text-white">
                    {selected.length}
                  </span>
                )}
              </summary>
              <div className={`absolute z-10 max-h-60 min-w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg ${tagDropUp(category).openUp ? "bottom-full mb-1" : "mt-1"}`}>
                {tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTagIds.includes(tag.id)}
                      onChange={(e) => {
                        onChange(
                          e.target.checked
                            ? [...selectedTagIds, tag.id]
                            : selectedTagIds.filter((tid) => tid !== tag.id),
                        );
                      }}
                      className="rounded accent-orange-500"
                    />
                    <span className="text-sm">
                      {i18n.language === "de" ? tag.name_de : tag.name_en}
                    </span>
                  </label>
                ))}
                {/* Add new tag inline */}
                {addingCategory === category ? (
                  <div className="mt-1 space-y-1 border-t pt-1">
                    <input
                      type="text"
                      placeholder={t("tags.nameEn")}
                      value={newTagEn}
                      onChange={(e) => setNewTagEn(e.target.value)}
                      className="w-full rounded border px-2 py-1"
                    />
                    <input
                      type="text"
                      placeholder={t("tags.nameDe")}
                      value={newTagDe}
                      onChange={(e) => setNewTagDe(e.target.value)}
                      className="w-full rounded border px-2 py-1"
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          if (newTagEn.trim() && newTagDe.trim()) {
                            const tag = await createTag.mutateAsync({
                              category,
                              name_en: newTagEn.trim(),
                              name_de: newTagDe.trim(),
                            });
                            onChange([...selectedTagIds, tag.id]);
                            setNewTagEn("");
                            setNewTagDe("");
                            setAddingCategory(null);
                          }
                        }}
                        className="rounded bg-orange-500 px-2 py-1 text-xs text-white hover:bg-orange-600"
                      >
                        {t("common.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingCategory(null);
                          setNewTagEn("");
                          setNewTagDe("");
                        }}
                        className="px-2 py-1 text-xs text-gray-500"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingCategory(category)}
                    className="mt-1 w-full border-t px-2 py-1 text-left text-sm text-orange-600 hover:text-orange-700"
                  >
                    + {t("tags.addTag")}
                  </button>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Replace tag section in RecipeCreatePage**

Remove the `addingCategory`, `newTagEn`, `newTagDe` state variables (lines 43-45).
Remove the `tagSectionRef` and `tagDropUp` hooks (lines 32-33).
Remove the `createTag` hook (line 31).
Remove the `useCloseDetailsOnClickOutside` and `useDropUp` imports (lines 12-13).
Remove the `useCreateTag` import from line 14.
Remove `TAG_CATEGORIES` and `TagCategory` from the types import (line 7).

Replace lines 194-298 (the tag section) with:

```tsx
{groupedTags && (
  <TagSelector
    groupedTags={groupedTags}
    selectedTagIds={tagIds}
    onChange={setTagIds}
  />
)}
```

Add import: `import TagSelector from "../components/TagSelector";`

**Step 3: Replace tag section in RecipeDetailPage**

Same changes in RecipeForm function (lines 112-114 hooks, lines 143-145 state, lines 442-548 JSX).
Remove `TAG_CATEGORIES` and `TagCategory` from the types import (line 9).
Remove `useCloseDetailsOnClickOutside` and `useDropUp` imports (lines 24-25).
Remove `useCreateTag` import from line 26.

Replace the tag JSX with:

```tsx
{groupedTags && (
  <TagSelector
    groupedTags={groupedTags}
    selectedTagIds={tagIds}
    onChange={setTagIds}
  />
)}
```

**Step 4: Run tests**

Run: `cd frontend && npm test`
Expected: All tests pass

**Step 5: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 6: Commit**

```bash
git add frontend/src/components/TagSelector.tsx frontend/src/pages/RecipeCreatePage.tsx frontend/src/pages/RecipeDetailPage.tsx
git commit -m "refactor(frontend): extract TagSelector component"
```

---

### Task 18: Extract `useRecipeForm` hook

**Files:**
- Create: `frontend/src/hooks/useRecipeForm.ts`
- Modify: `frontend/src/pages/RecipeCreatePage.tsx`
- Modify: `frontend/src/pages/RecipeDetailPage.tsx`

**Step 1: Create the useRecipeForm hook**

This hook extracts the duplicated state variables, payload building, and ingredient auto-creation:

```ts
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Ingredient, ListType, Recipe, RecipeUpdatePayload } from "../api/types";
import type { IngredientRow } from "../components/IngredientForm";
import type { StepRow } from "../components/StepEditor";
import { createIngredient } from "./useIngredients";
import { queryKeys } from "./queryKeys";
import { useToast } from "./useToast";
import { useTranslation } from "react-i18next";

interface UseRecipeFormOptions {
  recipe?: Recipe;
  listType?: ListType;
  allIngredients?: Ingredient[];
}

function buildIngredientRows(
  recipe: Recipe,
  allIngredients: Ingredient[],
  nameKey: "name_de" | "name_en",
): IngredientRow[] {
  return recipe.ingredients.map((ri) => {
    const ing = allIngredients.find((i) => i.id === ri.ingredient);
    return {
      ingredient: ri.ingredient,
      ingredientName: ing ? ing[nameKey] : String(ri.ingredient),
      quantity: ri.quantity,
      unit: ri.unit,
      order: ri.order,
    };
  });
}

function buildStepRows(steps: Recipe["manual_steps"]): StepRow[] {
  return steps.map((s) => ({
    step_number: s.step_number,
    instruction: s.instruction,
  }));
}

export function useRecipeForm({ recipe, listType = "KNOWN", allIngredients = [] }: UseRecipeFormOptions) {
  const { i18n } = useTranslation();
  const lang = i18n.language === "de" ? "de" : "en";
  const nameKey = lang === "de" ? "name_de" : "name_en";

  const [title, setTitle] = useState(recipe?.title ?? "");
  const [defaultServings, setDefaultServings] = useState(recipe?.default_servings ?? 2);
  const [prepTime, setPrepTime] = useState(recipe?.prep_time_minutes?.toString() ?? "");
  const [cookTime, setCookTime] = useState(recipe?.cook_time_minutes?.toString() ?? "");
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    recipe ? buildIngredientRows(recipe, allIngredients, nameKey) : [],
  );
  const [manualSteps, setManualSteps] = useState<StepRow[]>(
    recipe ? buildStepRows(recipe.manual_steps) : [],
  );
  const [machineSteps, setMachineSteps] = useState<StepRow[]>(
    recipe
      ? recipe.machine_steps.map((s) => ({
          step_number: s.step_number,
          instruction: s.instruction,
          ...(s.program_type && {
            program_type: s.program_type,
            temperature: s.temperature,
            duration_seconds: s.duration_seconds,
            speed: s.speed,
            turbo: s.turbo,
            direction: s.direction,
            weight_grams: s.weight_grams,
          }),
        }))
      : [],
  );
  const [tagIds, setTagIds] = useState<string[]>(recipe?.tags.map((tag) => tag.id) ?? []);

  async function buildPayload(): Promise<RecipeUpdatePayload> {
    const resolvedIngredients = await Promise.all(
      ingredients.map(async (row) => {
        if (row.ingredient > 0 || !row.ingredientName.trim()) return row;
        const created = await createIngredient(row.ingredientName.trim());
        return { ...row, ingredient: created.id };
      }),
    );

    return {
      title,
      list_type: recipe?.list_type ?? listType,
      default_servings: defaultServings || 1,
      prep_time_minutes: prepTime ? Number(prepTime) : null,
      cook_time_minutes: cookTime ? Number(cookTime) : null,
      leftover_days: recipe?.leftover_days ?? null,
      ingredients: resolvedIngredients
        .filter((row) => row.ingredient > 0)
        .map((row, i) => ({
          ingredient: row.ingredient,
          quantity: row.quantity || "0",
          unit: row.unit,
          order: i,
        })),
      manual_steps: manualSteps
        .filter((s) => s.instruction.trim())
        .map((s, i) => ({ step_number: i + 1, instruction: s.instruction })),
      machine_steps: machineSteps
        .filter((s) => s.instruction.trim() || s.program_type)
        .map((s, i) => ({
          step_number: i + 1,
          instruction: s.instruction || "",
          ...(s.program_type && {
            program_type: s.program_type,
            temperature: s.temperature ?? null,
            duration_seconds: s.duration_seconds ?? null,
            speed: s.speed ?? null,
            turbo: s.turbo ?? false,
            direction: s.direction ?? null,
            weight_grams: s.weight_grams ?? null,
          }),
        })),
      tag_ids: tagIds,
    };
  }

  return {
    title,
    setTitle,
    defaultServings,
    setDefaultServings,
    prepTime,
    setPrepTime,
    cookTime,
    setCookTime,
    ingredients,
    setIngredients,
    manualSteps,
    setManualSteps,
    machineSteps,
    setMachineSteps,
    tagIds,
    setTagIds,
    buildPayload,
  };
}
```

**Step 2: Refactor RecipeCreatePage to use useRecipeForm**

Remove state declarations (lines 35-42), the `handleSave` payload building logic (lines 50-93), the `createIngredient` import.

Replace with:

```tsx
const form = useRecipeForm({ listType });
```

Update handleSave to:

```tsx
async function handleSave(e: React.FormEvent) {
  e.preventDefault();
  const payload = await form.buildPayload();
  createRecipe.mutate(payload, {
    onSuccess: (newRecipe) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ingredients });
      addToast(t("success.recipeSaved"), "success");
      navigate("/recipes", { state: { newRecipeId: newRecipe.id } });
    },
    onError: () => addToast(t("errors.recipeSave"), "error"),
  });
}
```

Update JSX to use `form.title`, `form.setTitle`, `form.ingredients`, `form.setIngredients`, etc.

**Step 3: Refactor RecipeDetailPage RecipeForm to use useRecipeForm**

Remove state declarations (lines 121-145), the `buildIngredientRows`/`buildStepRows` helper functions (lines 61-83), the handleSave payload building logic (lines 150-193).

Replace with:

```tsx
const form = useRecipeForm({ recipe, allIngredients });
```

Update handleSave similarly. Update JSX to use `form.*` properties.

**Step 4: Run tests**

Run: `cd frontend && npm test`
Expected: All tests pass

**Step 5: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 6: Commit**

```bash
git add frontend/src/hooks/useRecipeForm.ts frontend/src/pages/RecipeCreatePage.tsx frontend/src/pages/RecipeDetailPage.tsx
git commit -m "refactor(frontend): extract useRecipeForm hook"
```

---

### Task 19: Final verification

**Step 1: Run all tests**

Run: `cd frontend && npm test`
Expected: All tests pass

**Step 2: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 3: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Run build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 5: Commit if any remaining changes**

```bash
git add -A
git commit -m "refactor(frontend): frontend deduplication complete"
```
