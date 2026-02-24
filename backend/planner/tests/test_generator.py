from datetime import date

from django.contrib.auth import get_user_model

import pytest

from planner.services import generate_meal_plan
from recipes.models import Ingredient, Recipe, RecipeIngredient, Unit
from users.models import Household

User = get_user_model()


def _create_recipes(household, known=5, to_try=3):
    """Helper to create test recipes with shared ingredients."""
    flour = Ingredient.objects.create(name_de="Mehl", name_en="flour", category="PANTRY")
    egg = Ingredient.objects.create(name_de="Ei", name_en="egg", category="DAIRY")
    gram = Unit.objects.create(name_de="Gramm", name_en="gram", abbreviation="g")
    piece = Unit.objects.create(name_de="Stueck", name_en="piece", abbreviation="pcs")
    recipes = []
    for i in range(known):
        r = Recipe.objects.create(
            household=household, title=f"Known{i}", list_type="KNOWN", default_servings=2
        )
        RecipeIngredient.objects.create(
            recipe=r, ingredient=flour, quantity=200, unit=gram, order=1
        )
        if i % 2 == 0:
            RecipeIngredient.objects.create(
                recipe=r, ingredient=egg, quantity=2, unit=piece, order=2
            )
        recipes.append(r)
    for i in range(to_try):
        r = Recipe.objects.create(
            household=household, title=f"Try{i}", list_type="TO_TRY", default_servings=2
        )
        RecipeIngredient.objects.create(
            recipe=r, ingredient=flour, quantity=150, unit=gram, order=1
        )
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
