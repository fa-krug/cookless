# PX1: Fix N+1 Queries on Recipe List Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate 2N extra SQL queries when listing recipes by using `Prefetch` with `to_attr` instead of `.filter()` on the RelatedManager.

**Architecture:** Replace `resolve_manual_steps`/`resolve_machine_steps` in `RecipeOut` with `to_attr`-based prefetch resolution. Update `list_recipes` and `get_recipe` queryset to use two `Prefetch` objects. The schema resolvers read from the pre-populated `to_attr` lists instead of hitting the database.

**Tech Stack:** Django ORM `Prefetch`, Django Ninja schemas

---

### Task 1: Add test proving N+1 is fixed

**Files:**
- Modify: `backend/recipes/tests/test_api.py`

**Step 1: Write the failing test**

Add to `backend/recipes/tests/test_api.py`:

```python
@pytest.mark.django_db
def test_list_recipes_query_count(auth_client):
    """Listing recipes should use a constant number of queries regardless of recipe count."""
    client, household = auth_client
    ingredient = Ingredient.objects.create(name_en="Flour", name_de="Mehl", category="PANTRY")
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")

    for i in range(5):
        recipe = Recipe.objects.create(
            household=household, title=f"Recipe {i}", list_type="KNOWN", default_servings=2
        )
        RecipeIngredient.objects.create(
            recipe=recipe, ingredient=ingredient, quantity=100, unit=unit, order=1
        )
        CookingStep.objects.create(
            recipe=recipe, method="MANUAL", step_number=1, instruction="Do something"
        )
        CookingStep.objects.create(
            recipe=recipe, method="MACHINE", step_number=1, instruction="Blend it"
        )

    from django.test.utils import override_settings

    # 1 query: session auth, 1: user, 1: household membership check,
    # 1: recipes, 1: prefetch ingredients, 1: prefetch manual steps, 1: prefetch machine steps
    with django_assert_max_num_queries(7):
        response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    assert len(response.json()) == 5
```

Note: This test needs `django_assert_max_num_queries` from `pytest-django`. Update the import to use it:

```python
@pytest.mark.django_db
def test_list_recipes_query_count(auth_client, django_assert_max_num_queries):
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/recipes/tests/test_api.py::test_list_recipes_query_count -v`
Expected: FAIL — currently fires 2N+base queries (the `.filter()` calls bypass prefetch cache)

**Step 3: Commit the failing test**

```bash
git add backend/recipes/tests/test_api.py
git commit -m "test(px1): add query count test for recipe list N+1"
```

---

### Task 2: Fix the prefetch and schema resolvers

**Files:**
- Modify: `backend/recipes/api.py:51-59` (list_recipes queryset)
- Modify: `backend/recipes/api.py:81-88` (get_recipe queryset)
- Modify: `backend/recipes/schemas.py:50-70` (RecipeOut resolvers)

**Step 1: Update `list_recipes` queryset in `backend/recipes/api.py`**

Replace lines 54-56:

```python
# OLD
qs = Recipe.objects.filter(household=request.user.active_household).prefetch_related(
    "ingredients", "steps"
)

# NEW
from django.db.models import Prefetch
from recipes.models import CookingStep

qs = Recipe.objects.filter(household=request.user.active_household).prefetch_related(
    "ingredients",
    Prefetch(
        "steps",
        queryset=CookingStep.objects.filter(method="MANUAL"),
        to_attr="manual_steps_list",
    ),
    Prefetch(
        "steps",
        queryset=CookingStep.objects.filter(method="MACHINE"),
        to_attr="machine_steps_list",
    ),
)
```

Move the `Prefetch` import to the top of the file.

**Step 2: Update `get_recipe` queryset in `backend/recipes/api.py`**

Replace lines 84-85:

```python
# OLD
Recipe.objects.prefetch_related("ingredients", "steps"),

# NEW
Recipe.objects.prefetch_related(
    "ingredients",
    Prefetch(
        "steps",
        queryset=CookingStep.objects.filter(method="MANUAL"),
        to_attr="manual_steps_list",
    ),
    Prefetch(
        "steps",
        queryset=CookingStep.objects.filter(method="MACHINE"),
        to_attr="machine_steps_list",
    ),
),
```

**Step 3: Update `RecipeOut` resolvers in `backend/recipes/schemas.py`**

Replace lines 64-70:

```python
# OLD
@staticmethod
def resolve_manual_steps(obj):
    return obj.steps.filter(method="MANUAL")

@staticmethod
def resolve_machine_steps(obj):
    return obj.steps.filter(method="MACHINE")

# NEW
@staticmethod
def resolve_manual_steps(obj):
    if hasattr(obj, "manual_steps_list"):
        return obj.manual_steps_list
    return obj.steps.filter(method="MANUAL")

@staticmethod
def resolve_machine_steps(obj):
    if hasattr(obj, "machine_steps_list"):
        return obj.machine_steps_list
    return obj.steps.filter(method="MACHINE")
```

The `hasattr` fallback keeps endpoints that don't use the optimized queryset (like `create_recipe`, `update_recipe`) working.

**Step 4: Run the query count test**

Run: `pytest backend/recipes/tests/test_api.py::test_list_recipes_query_count -v`
Expected: PASS

**Step 5: Run all recipe tests**

Run: `pytest backend/recipes/tests/test_api.py -v`
Expected: All pass

**Step 6: Commit**

```bash
git add backend/recipes/api.py backend/recipes/schemas.py
git commit -m "perf(px1): fix N+1 queries on recipe list with Prefetch to_attr"
```
