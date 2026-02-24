from datetime import date

import pytest

from planner.models import MealPlan, MealPlanEntry
from recipes.models import Recipe
from users.models import Household


@pytest.mark.django_db
def test_create_meal_plan_with_entries():
    household = Household.objects.create(name="Home")
    recipe = Recipe.objects.create(
        household=household, title="Pasta", list_type="KNOWN", default_servings=2
    )

    plan = MealPlan.objects.create(
        household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7)
    )
    cooking_entry = MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 1),
        meal_type="DINNER",
        recipe=recipe,
        servings=4,
        is_leftover=False,
    )
    leftover_entry = MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 2),
        meal_type="LUNCH",
        recipe=recipe,
        servings=2,
        is_leftover=True,
        source_entry=cooking_entry,
    )
    assert plan.entries.count() == 2
    assert leftover_entry.source_entry == cooking_entry


@pytest.mark.django_db
def test_meal_plan_str():
    household = Household.objects.create(name="Home")
    plan = MealPlan.objects.create(
        household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7)
    )
    assert str(plan) == "Home: 2026-03-01 to 2026-03-07"


@pytest.mark.django_db
def test_meal_plan_entry_str():
    household = Household.objects.create(name="Home")
    recipe = Recipe.objects.create(
        household=household, title="Pasta", list_type="KNOWN", default_servings=2
    )
    plan = MealPlan.objects.create(
        household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7)
    )
    entry = MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 1),
        meal_type="DINNER",
        recipe=recipe,
        servings=4,
    )
    assert str(entry) == "2026-03-01 DINNER: Pasta"


@pytest.mark.django_db
def test_meal_plan_entry_defaults():
    household = Household.objects.create(name="Home")
    recipe = Recipe.objects.create(
        household=household, title="Pasta", list_type="KNOWN", default_servings=2
    )
    plan = MealPlan.objects.create(
        household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7)
    )
    entry = MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 1),
        meal_type="BREAKFAST",
        recipe=recipe,
        servings=2,
    )
    assert entry.is_leftover is False
    assert entry.is_locked is False
    assert entry.source_entry is None


@pytest.mark.django_db
def test_meal_plan_cascade_delete():
    household = Household.objects.create(name="Home")
    recipe = Recipe.objects.create(
        household=household, title="Pasta", list_type="KNOWN", default_servings=2
    )
    plan = MealPlan.objects.create(
        household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7)
    )
    MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 1),
        meal_type="DINNER",
        recipe=recipe,
        servings=4,
    )
    assert MealPlanEntry.objects.count() == 1
    plan.delete()
    assert MealPlanEntry.objects.count() == 0


@pytest.mark.django_db
def test_meal_plan_entry_meal_type_choices():
    household = Household.objects.create(name="Home")
    recipe = Recipe.objects.create(
        household=household, title="Pasta", list_type="KNOWN", default_servings=2
    )
    plan = MealPlan.objects.create(
        household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7)
    )
    for meal_type in ["BREAKFAST", "LUNCH", "DINNER", "SNACK"]:
        entry = MealPlanEntry.objects.create(
            meal_plan=plan,
            date=date(2026, 3, 1),
            meal_type=meal_type,
            recipe=recipe,
            servings=2,
        )
        assert entry.meal_type == meal_type
