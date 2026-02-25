# PX2: Lean Recipe List Schema Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce recipe list API payload by returning only the fields the list page uses, eliminating nested `ingredients`, `manual_steps`, and `machine_steps` arrays from the list endpoint.

**Architecture:** Add a new `RecipeListOut` schema with flat fields only. Use it on the `list_recipes` endpoint. Keep `RecipeOut` (with nested data) for `get_recipe`, `create_recipe`, `update_recipe`. Update the frontend `Recipe` type to have a `RecipeSummary` variant and adjust `useRecipes` to return it.

**Tech Stack:** Django Ninja schemas, TypeScript types, TanStack React Query

---

### Task 1: Add backend `RecipeListOut` schema

**Files:**
- Modify: `backend/recipes/schemas.py`

**Step 1: Write the failing test**

Add to `backend/recipes/tests/test_api.py`:

```python
@pytest.mark.django_db
def test_list_recipes_excludes_nested_data(auth_client):
    """The recipe list endpoint should NOT include ingredients or steps."""
    client, household = auth_client
    ingredient = Ingredient.objects.create(name_en="Flour", name_de="Mehl", category="PANTRY")
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")
    recipe = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    RecipeIngredient.objects.create(
        recipe=recipe, ingredient=ingredient, quantity=100, unit=unit, order=1
    )
    CookingStep.objects.create(
        recipe=recipe, method="MANUAL", step_number=1, instruction="Mix"
    )

    response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert "ingredients" not in data[0]
    assert "manual_steps" not in data[0]
    assert "machine_steps" not in data[0]
    assert data[0]["title"] == "Pancakes"
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/recipes/tests/test_api.py::test_list_recipes_excludes_nested_data -v`
Expected: FAIL — current response includes `ingredients`, `manual_steps`, `machine_steps`

**Step 3: Commit the failing test**

```bash
git add backend/recipes/tests/test_api.py
git commit -m "test(px2): add test asserting recipe list excludes nested data"
```

---

### Task 2: Implement `RecipeListOut` and update endpoint

**Files:**
- Modify: `backend/recipes/schemas.py`
- Modify: `backend/recipes/api.py:51-59`

**Step 1: Add `RecipeListOut` to `backend/recipes/schemas.py`**

Add after `RecipeIngredientOut` (before `CookingStepOut`):

```python
class RecipeListOut(Schema):
    id: UUID
    title: str
    list_type: str
    default_servings: int
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    leftover_days: int | None = None
    created_at: datetime
    updated_at: datetime
```

**Step 2: Update `list_recipes` in `backend/recipes/api.py`**

```python
# OLD
@router.get("/recipes/", response=list[RecipeOut], tags=["recipes"])
def list_recipes(request, list_type: str | None = None):
    require_household_member(request)
    qs = Recipe.objects.filter(household=request.user.active_household).prefetch_related(
        "ingredients",
        Prefetch(...),  # from PX1
    )

# NEW
@router.get("/recipes/", response=list[RecipeListOut], tags=["recipes"])
def list_recipes(request, list_type: str | None = None):
    require_household_member(request)
    qs = Recipe.objects.filter(household=request.user.active_household)
    if list_type:
        qs = qs.filter(list_type=list_type)
    return qs
```

Note: The prefetch from PX1 is no longer needed here since we don't return nested data. Keep prefetch only on `get_recipe`.

Update the import in `backend/recipes/api.py` to include `RecipeListOut`:

```python
from recipes.schemas import (
    CookingStepOut,
    IngredientCreateIn,
    IngredientOut,
    RecipeCreateIn,
    RecipeListOut,
    RecipeOut,
    UnitOut,
)
```

**Step 3: Run the new test**

Run: `pytest backend/recipes/tests/test_api.py::test_list_recipes_excludes_nested_data -v`
Expected: PASS

**Step 4: Fix existing tests that assert on nested fields in list response**

Check `test_list_recipes_filtered` — it only checks `len(response.json())`, so it should still pass.

Run: `pytest backend/recipes/tests/test_api.py -v`
Expected: All pass

**Step 5: Commit**

```bash
git add backend/recipes/schemas.py backend/recipes/api.py
git commit -m "perf(px2): add lean RecipeListOut schema for recipe list endpoint"
```

---

### Task 3: Update frontend types and hooks

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/hooks/useRecipes.ts`

**Step 1: Add `RecipeSummary` type to `frontend/src/api/types.ts`**

Add before the `Recipe` interface:

```typescript
export interface RecipeSummary {
  id: string;
  title: string;
  list_type: ListType;
  default_servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  leftover_days: number | null;
  created_at: string;
  updated_at: string;
}
```

**Step 2: Update `useRecipes` in `frontend/src/hooks/useRecipes.ts`**

```typescript
// OLD
export function useRecipes(listType?: ListType) {
  return useQuery<Recipe[]>({

// NEW
import type { ListType, RecipeSummary } from "../api/types";

export function useRecipes(listType?: ListType) {
  return useQuery<RecipeSummary[]>({
    queryKey: ["recipes", listType],
    queryFn: () => {
      const params = listType ? `?list_type=${listType}` : "";
      return api.get<RecipeSummary[]>(`/api/v1/recipes/${params}`);
    },
  });
}
```

**Step 3: Update `RecipeListPage.tsx` type usage**

Update the import in `frontend/src/pages/RecipeListPage.tsx`:

```typescript
// OLD
import type { ListType, Recipe } from "../api/types";

// NEW
import type { ListType, RecipeSummary } from "../api/types";
```

Update `sortRecipes` signature and `filteredRecipes` typing to use `RecipeSummary` instead of `Recipe`.

**Step 4: Update `RecipeCard` component if it references `Recipe` type**

Check `RecipeCard.tsx` — update its prop type to accept `RecipeSummary` instead of `Recipe`.

**Step 5: Run frontend lint and type check**

Run: `cd frontend && npm run lint && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/hooks/useRecipes.ts frontend/src/pages/RecipeListPage.tsx frontend/src/components/RecipeCard.tsx
git commit -m "perf(px2): update frontend to use lean RecipeSummary for list view"
```
