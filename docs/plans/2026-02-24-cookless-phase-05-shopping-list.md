# Cookless Phase 5: Shopping List

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization.

**Architecture:** Django + Django Ninja backend serving a React PWA via WhiteNoise in a single container. Cookie auth for frontend, Bearer token auth for programmatic API. Multi-user with households and Sign in with Apple.

**Tech Stack:** Python 3.13, Django 5.x, Django Ninja, Pydantic, React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, react-i18next, Workbox

---

## Phase 5: Shopping List

### Task 19: ShoppingList model and generation

**Files:**
- Create: `backend/shopping/__init__.py`
- Create: `backend/shopping/models.py`
- Create: `backend/shopping/services.py`
- Create: `backend/shopping/tests/__init__.py`
- Create: `backend/shopping/tests/test_generation.py`

**Step 1: Write failing tests**

```python
# backend/shopping/tests/test_generation.py
import pytest
from datetime import date
from users.models import Household
from recipes.models import Recipe, Ingredient, Unit, RecipeIngredient
from planner.models import MealPlan, MealPlanEntry
from shopping.services import generate_shopping_list

@pytest.mark.django_db
def test_shopping_list_aggregates_ingredients():
    household = Household.objects.create(name="Home")
    flour = Ingredient.objects.create(name_de="Mehl", name_en="flour", category="PANTRY")
    gram = Unit.objects.create(name_de="Gramm", name_en="gram", abbreviation="g")

    r1 = Recipe.objects.create(household=household, title="Pancakes", list_type="KNOWN", default_servings=2)
    RecipeIngredient.objects.create(recipe=r1, ingredient=flour, quantity=200, unit=gram, order=1)

    r2 = Recipe.objects.create(household=household, title="Bread", list_type="KNOWN", default_servings=2)
    RecipeIngredient.objects.create(recipe=r2, ingredient=flour, quantity=300, unit=gram, order=1)

    plan = MealPlan.objects.create(household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7))
    MealPlanEntry.objects.create(meal_plan=plan, date=date(2026, 3, 1), meal_type="DINNER", recipe=r1, servings=2, is_leftover=False)
    MealPlanEntry.objects.create(meal_plan=plan, date=date(2026, 3, 3), meal_type="DINNER", recipe=r2, servings=2, is_leftover=False)

    shopping_list = generate_shopping_list(plan)
    flour_item = shopping_list.items.get(ingredient=flour)
    assert flour_item.quantity == 500  # 200 + 300

@pytest.mark.django_db
def test_shopping_list_skips_leftovers():
    # Leftover entries should not add ingredients
    household = Household.objects.create(name="Home")
    flour = Ingredient.objects.create(name_de="Mehl", name_en="flour", category="PANTRY")
    gram = Unit.objects.create(name_de="Gramm", name_en="gram", abbreviation="g")

    r1 = Recipe.objects.create(household=household, title="Pancakes", list_type="KNOWN", default_servings=2)
    RecipeIngredient.objects.create(recipe=r1, ingredient=flour, quantity=200, unit=gram, order=1)

    plan = MealPlan.objects.create(household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7))
    cooking = MealPlanEntry.objects.create(meal_plan=plan, date=date(2026, 3, 1), meal_type="DINNER", recipe=r1, servings=2, is_leftover=False)
    MealPlanEntry.objects.create(meal_plan=plan, date=date(2026, 3, 2), meal_type="LUNCH", recipe=r1, servings=2, is_leftover=True, source_entry=cooking)

    shopping_list = generate_shopping_list(plan)
    assert shopping_list.items.count() == 1
    assert shopping_list.items.first().quantity == 200
```

**Step 2: Implement ShoppingList model and generate_shopping_list service**

Service logic:
1. Get all non-leftover entries from the plan
2. For each entry, scale recipe ingredients by `entry.servings / recipe.default_servings`
3. Convert all quantities to base units
4. Sum by ingredient
5. Convert back to readable units
6. Create ShoppingListItems grouped by ingredient category

**Step 3: Migrate, run tests, commit**

```bash
git commit -m "feat: add shopping list model and generation service"
```

---

### Task 20: Shopping List API endpoints

**Files:**
- Create: `backend/shopping/schemas.py`
- Create: `backend/shopping/api.py`
- Create: `backend/shopping/tests/test_api.py`
- Modify: `backend/cookless/api.py` (register shopping router)

**Step 1: Write failing tests**

Test: POST generate from meal plan, GET with items grouped by category, PATCH toggle checked, PATCH bulk toggle.

**Step 2: Implement Pydantic schemas, API endpoints, register router**

- `ShoppingListOut` schema with nested `ShoppingListItemOut`
- Items ordered by category then ingredient name
- Toggle checked via PATCH
- Bulk toggle via PATCH with list of item IDs
- Register `shopping_router` in `backend/cookless/api.py`

**Step 3: Run tests and commit**

```bash
git commit -m "feat: add shopping list API with check/uncheck"
```
