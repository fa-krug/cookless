# Cookless Phase 4: Meal Plan Generation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization.

**Architecture:** Django + Django Ninja backend serving a React PWA via WhiteNoise in a single container. Cookie auth for frontend, Bearer token auth for programmatic API. Multi-user with households and Sign in with Apple.

**Tech Stack:** Python 3.13, Django 5.x, Django Ninja, Pydantic, React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, react-i18next, Workbox

---

## Phase 4: Meal Plan Generation

### Task 16: MealPlan and MealPlanEntry models

**Files:**
- Create: `backend/planner/__init__.py`
- Create: `backend/planner/models.py`
- Create: `backend/planner/tests/__init__.py`
- Create: `backend/planner/tests/test_models.py`

**Step 1: Write failing tests**

```python
# backend/planner/tests/test_models.py
import pytest
from datetime import date
from users.models import Household
from recipes.models import Recipe
from planner.models import MealPlan, MealPlanEntry

@pytest.mark.django_db
def test_create_meal_plan_with_entries():
    household = Household.objects.create(name="Home")
    recipe = Recipe.objects.create(household=household, title="Pasta", list_type="KNOWN", default_servings=2)

    plan = MealPlan.objects.create(household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7))
    cooking_entry = MealPlanEntry.objects.create(
        meal_plan=plan, date=date(2026, 3, 1), meal_type="DINNER",
        recipe=recipe, servings=4, is_leftover=False,
    )
    leftover_entry = MealPlanEntry.objects.create(
        meal_plan=plan, date=date(2026, 3, 2), meal_type="LUNCH",
        recipe=recipe, servings=2, is_leftover=True, source_entry=cooking_entry,
    )
    assert plan.entries.count() == 2
    assert leftover_entry.source_entry == cooking_entry
```

**Step 2: Implement models, migrate, test, commit**

```bash
git commit -m "feat: add MealPlan and MealPlanEntry models"
```

---

### Task 17: Meal plan generation algorithm

**Files:**
- Create: `backend/planner/services.py`
- Create: `backend/planner/tests/test_generator.py`

**Step 1: Write failing tests for the generator**

```python
# backend/planner/tests/test_generator.py
import pytest
from datetime import date
from django.contrib.auth import get_user_model
from users.models import Household
from recipes.models import Recipe, Ingredient, Unit, RecipeIngredient
from planner.services import generate_meal_plan

User = get_user_model()

def _create_recipes(household, known=5, to_try=3):
    """Helper to create test recipes with shared ingredients."""
    flour = Ingredient.objects.create(name_de="Mehl", name_en="flour", category="PANTRY")
    egg = Ingredient.objects.create(name_de="Ei", name_en="egg", category="DAIRY")
    gram = Unit.objects.create(name_de="Gramm", name_en="gram", abbreviation="g")
    piece = Unit.objects.create(name_de="Stueck", name_en="piece", abbreviation="pcs")
    recipes = []
    for i in range(known):
        r = Recipe.objects.create(household=household, title=f"Known{i}", list_type="KNOWN", default_servings=2)
        RecipeIngredient.objects.create(recipe=r, ingredient=flour, quantity=200, unit=gram, order=1)
        if i % 2 == 0:
            RecipeIngredient.objects.create(recipe=r, ingredient=egg, quantity=2, unit=piece, order=2)
        recipes.append(r)
    for i in range(to_try):
        r = Recipe.objects.create(household=household, title=f"Try{i}", list_type="TO_TRY", default_servings=2)
        RecipeIngredient.objects.create(recipe=r, ingredient=flour, quantity=150, unit=gram, order=1)
        recipes.append(r)
    return recipes

@pytest.mark.django_db
def test_generate_plan_fills_all_days():
    household = Household.objects.create(name="Home")
    _create_recipes(household)
    plan = generate_meal_plan(
        household=household,
        start_date=date(2026, 3, 1),
        days=7,
        servings=2,
        known_ratio=0.7,
    )
    entries = plan.entries.all()
    dates_covered = {e.date for e in entries}
    assert len(dates_covered) == 7

@pytest.mark.django_db
def test_generate_plan_respects_ratio():
    household = Household.objects.create(name="Home")
    _create_recipes(household)
    plan = generate_meal_plan(
        household=household,
        start_date=date(2026, 3, 1),
        days=7,
        servings=2,
        known_ratio=0.7,
    )
    cooking_entries = plan.entries.filter(is_leftover=False)
    known_count = cooking_entries.filter(recipe__list_type="KNOWN").count()
    total = cooking_entries.count()
    actual_ratio = known_count / total
    assert 0.5 <= actual_ratio <= 0.9  # Approximate, allows rounding

@pytest.mark.django_db
def test_generate_plan_has_leftovers():
    household = Household.objects.create(name="Home")
    _create_recipes(household)
    plan = generate_meal_plan(
        household=household,
        start_date=date(2026, 3, 1),
        days=7,
        servings=2,
        known_ratio=0.7,
    )
    leftover_entries = plan.entries.filter(is_leftover=True)
    assert leftover_entries.count() > 0
    for entry in leftover_entries:
        assert entry.source_entry is not None
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest planner/tests/test_generator.py -v`
Expected: FAIL

**Step 3: Implement generate_meal_plan service**

```python
# backend/planner/services.py
import random
from collections import Counter
from datetime import timedelta
from decimal import Decimal
from recipes.models import Recipe
from planner.models import MealPlan, MealPlanEntry

def generate_meal_plan(household, start_date, days=7, servings=2, known_ratio=0.7, meals_per_day=2):
    total_meal_slots = days * meals_per_day
    # Estimate ~2 meals per cooking session (cook + leftover)
    cooking_sessions = max(total_meal_slots // 2, 1)
    known_count = round(cooking_sessions * known_ratio)
    try_count = cooking_sessions - known_count

    known_recipes = list(Recipe.objects.filter(household=household, list_type="KNOWN"))
    try_recipes = list(Recipe.objects.filter(household=household, list_type="TO_TRY"))

    # Step 1 & 2: Select recipes with ingredient overlap scoring
    best_set = _select_recipes_with_overlap(known_recipes, try_recipes, known_count, try_count)

    # Step 3 & 4: Assign to schedule with leftovers
    plan = MealPlan.objects.create(
        household=household,
        start_date=start_date,
        end_date=start_date + timedelta(days=days - 1),
    )
    _assign_schedule(plan, best_set, start_date, days, servings, meals_per_day)
    return plan

def _select_recipes_with_overlap(known, try_list, known_count, try_count, candidates=50):
    best_score = -1
    best_set = None
    for _ in range(candidates):
        selected_known = random.sample(known, min(known_count, len(known)))
        selected_try = random.sample(try_list, min(try_count, len(try_list)))
        selected = selected_known + selected_try
        score = _ingredient_overlap_score(selected)
        if score > best_score:
            best_score = score
            best_set = selected
    return best_set or []

def _ingredient_overlap_score(recipes):
    ingredient_counts = Counter()
    for recipe in recipes:
        ingredient_ids = set(recipe.ingredients.values_list("ingredient_id", flat=True))
        for ing_id in ingredient_ids:
            ingredient_counts[ing_id] += 1
    return sum(count for count in ingredient_counts.values() if count > 1)

def _assign_schedule(plan, recipes, start_date, days, servings, meals_per_day):
    meal_types = ["LUNCH", "DINNER"][:meals_per_day]
    slots = []
    for day_offset in range(days):
        for meal_type in meal_types:
            slots.append((start_date + timedelta(days=day_offset), meal_type))

    slot_index = 0
    random.shuffle(recipes)

    for recipe in recipes:
        if slot_index >= len(slots):
            break
        date, meal_type = slots[slot_index]
        cooking_entry = MealPlanEntry.objects.create(
            meal_plan=plan, date=date, meal_type=meal_type,
            recipe=recipe, servings=servings, is_leftover=False,
        )
        slot_index += 1

        # Assign leftover for next available slot
        if slot_index < len(slots):
            lo_date, lo_meal = slots[slot_index]
            MealPlanEntry.objects.create(
                meal_plan=plan, date=lo_date, meal_type=lo_meal,
                recipe=recipe, servings=servings,
                is_leftover=True, source_entry=cooking_entry,
            )
            slot_index += 1
```

**Step 4: Run tests**

Run: `cd backend && pytest planner/tests/test_generator.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/planner/
git commit -m "feat: implement meal plan generation algorithm"
```

---

### Task 18: Meal Plan API endpoints

**Files:**
- Create: `backend/planner/schemas.py`
- Create: `backend/planner/api.py`
- Create: `backend/planner/tests/test_api.py`
- Modify: `backend/cookless/api.py` (register planner router)

**Step 1: Write failing API tests**

Test: POST generate, GET list, GET detail, PUT swap entry, POST regenerate (locked entries).

**Step 2: Implement Pydantic schemas, API endpoints, register router**

- `MealPlanOut` schema with nested `MealPlanEntryOut`
- `generate_plan` endpoint (POST, calls `generate_meal_plan`)
- `list_meal_plans`, `get_meal_plan` endpoints
- `update_entry` endpoint (swap recipe)
- `regenerate_plan` endpoint (re-generate keeping locked entries)
- Register `planner_router` in `backend/cookless/api.py`

**Step 3: Run tests and commit**

```bash
git commit -m "feat: add meal plan API endpoints with generate and regenerate"
```
