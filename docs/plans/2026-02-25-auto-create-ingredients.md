# Auto-Create Ingredients Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically create unknown ingredients when saving a recipe, so users don't silently lose ingredient rows.

**Architecture:** On recipe save, any ingredient row with `ingredient === 0` and a non-empty name gets created via `POST /api/v1/ingredients/` before the recipe payload is sent. The typed name is used for both `name_en` and `name_de`. No backend changes needed.

**Tech Stack:** React, TypeScript, TanStack React Query, Django Ninja (existing endpoint)

---

### Task 1: Backend test — verify creating ingredient via API works

Confirm the existing `POST /api/v1/ingredients/` endpoint works as expected. This test doesn't exist yet and we'll need it as a safety net.

**Files:**
- Modify: `backend/recipes/tests/test_api.py`

**Step 1: Write the test**

Add at the end of `test_api.py`:

```python
@pytest.mark.django_db
def test_create_ingredient(auth_client):
    client, household = auth_client
    response = client.post(
        "/api/v1/ingredients/",
        json.dumps({"name_en": "Chickpeas", "name_de": "Kichererbsen", "category": "PANTRY"}),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name_en"] == "Chickpeas"
    assert data["name_de"] == "Kichererbsen"
    assert data["category"] == "PANTRY"
    assert "id" in data
```

**Step 2: Run test to verify it passes**

Run: `pytest backend/recipes/tests/test_api.py::test_create_ingredient -v`
Expected: PASS (endpoint already exists)

**Step 3: Commit**

```bash
git add backend/recipes/tests/test_api.py
git commit -m "test: add test for create ingredient endpoint"
```

---

### Task 2: Add `createIngredient` API helper to frontend

**Files:**
- Modify: `frontend/src/hooks/useIngredients.ts`

**Step 1: Add the createIngredient function**

Add to `frontend/src/hooks/useIngredients.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Ingredient } from "../api/types";

export function useIngredients() {
  return useQuery<Ingredient[]>({
    queryKey: ["ingredients"],
    queryFn: () => api.get<Ingredient[]>("/api/v1/ingredients/"),
  });
}

export async function createIngredient(name: string): Promise<Ingredient> {
  return api.post<Ingredient>("/api/v1/ingredients/", {
    name_en: name,
    name_de: name,
    category: "OTHER",
  });
}
```

This is a plain async function (not a hook) because we need to call it in a loop before saving.

**Step 2: Commit**

```bash
git add frontend/src/hooks/useIngredients.ts
git commit -m "feat: add createIngredient API helper"
```

---

### Task 3: Auto-create unknown ingredients in handleSave

**Files:**
- Modify: `frontend/src/pages/RecipeDetailPage.tsx`

**Step 1: Import createIngredient**

Add `createIngredient` to the import from `useIngredients`:

```typescript
import { useIngredients } from "../hooks/useIngredients";
```

Change to:

```typescript
import { createIngredient, useIngredients } from "../hooks/useIngredients";
```

**Step 2: Make handleSave async and auto-create ingredients**

Replace the `handleSave` function in `RecipeForm` with:

```typescript
async function handleSave(e: React.FormEvent) {
  e.preventDefault();

  // Auto-create unknown ingredients (ingredient === 0 with a typed name)
  const resolvedIngredients = await Promise.all(
    ingredients.map(async (row) => {
      if (row.ingredient > 0 || !row.ingredientName.trim()) return row;
      const created = await createIngredient(row.ingredientName.trim());
      return { ...row, ingredient: created.id };
    }),
  );

  const payload: RecipeUpdatePayload = {
    title,
    list_type: recipe.list_type,
    default_servings: defaultServings,
    prep_time_minutes: prepTime ? Number(prepTime) : null,
    cook_time_minutes: cookTime ? Number(cookTime) : null,
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
      .filter((s) => s.instruction.trim())
      .map((s, i) => ({ step_number: i + 1, instruction: s.instruction })),
  };

  updateRecipe.mutate({ id: recipeId, data: payload }, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      navigate("/recipes");
    },
  });
}
```

**Step 3: Add queryClient access**

Add inside `RecipeForm`, near the other hooks:

```typescript
const queryClient = useQueryClient();
```

And add the import at the top of the file:

```typescript
import { useQueryClient } from "@tanstack/react-query";
```

**Step 4: Verify build**

Run: `cd frontend && npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat: auto-create unknown ingredients on recipe save"
```

---

### Task 4: Manual smoke test

**Step 1: Verify the happy path**

1. Start dev servers: `cd backend && python manage.py runserver 0.0.0.0:8000` and `cd frontend && npm run dev`
2. Open a recipe, add an ingredient row
3. Type a name that doesn't exist (e.g. "Tahini")
4. Set quantity and unit, save
5. Verify: recipe saves with the new ingredient, no data loss
6. Verify: re-open the recipe — the ingredient appears correctly
7. Verify: the new ingredient now shows in the autocomplete dropdown on any recipe

---

### Task 5: Frontend lint check

**Step 1: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 2: Fix any issues if needed**

**Step 3: Final commit if there were lint fixes**

```bash
git add -A
git commit -m "fix: lint issues from auto-create ingredients"
```
