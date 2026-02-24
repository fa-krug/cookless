from datetime import date
from decimal import Decimal

import pytest

from planner.models import MealPlan, MealPlanEntry
from recipes.models import Ingredient, Recipe, RecipeIngredient, Unit
from shopping.services import generate_shopping_list
from users.models import Household


@pytest.mark.django_db
def test_shopping_list_aggregates_ingredients():
    household = Household.objects.create(name="Home")
    flour = Ingredient.objects.create(name_de="Mehl", name_en="flour", category="PANTRY")
    gram = Unit.objects.create(name_de="Gramm", name_en="gram", abbreviation="g")

    r1 = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    RecipeIngredient.objects.create(recipe=r1, ingredient=flour, quantity=200, unit=gram, order=1)

    r2 = Recipe.objects.create(
        household=household, title="Bread", list_type="KNOWN", default_servings=2
    )
    RecipeIngredient.objects.create(recipe=r2, ingredient=flour, quantity=300, unit=gram, order=1)

    plan = MealPlan.objects.create(
        household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7)
    )
    MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 1),
        meal_type="DINNER",
        recipe=r1,
        servings=2,
        is_leftover=False,
    )
    MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 3),
        meal_type="DINNER",
        recipe=r2,
        servings=2,
        is_leftover=False,
    )

    shopping_list = generate_shopping_list(plan)
    flour_item = shopping_list.items.get(ingredient=flour)
    assert flour_item.quantity == Decimal("500.00")


@pytest.mark.django_db
def test_shopping_list_skips_leftovers():
    household = Household.objects.create(name="Home")
    flour = Ingredient.objects.create(name_de="Mehl", name_en="flour", category="PANTRY")
    gram = Unit.objects.create(name_de="Gramm", name_en="gram", abbreviation="g")

    r1 = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    RecipeIngredient.objects.create(recipe=r1, ingredient=flour, quantity=200, unit=gram, order=1)

    plan = MealPlan.objects.create(
        household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7)
    )
    cooking = MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 1),
        meal_type="DINNER",
        recipe=r1,
        servings=2,
        is_leftover=False,
    )
    MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 2),
        meal_type="LUNCH",
        recipe=r1,
        servings=2,
        is_leftover=True,
        source_entry=cooking,
    )

    shopping_list = generate_shopping_list(plan)
    assert shopping_list.items.count() == 1
    item = shopping_list.items.first()
    assert item is not None
    assert item.quantity == Decimal("200.00")


@pytest.mark.django_db
def test_shopping_list_scales_by_servings():
    """Quantities scale when entry servings differ from recipe default_servings."""
    household = Household.objects.create(name="Home")
    flour = Ingredient.objects.create(name_de="Mehl", name_en="flour", category="PANTRY")
    gram = Unit.objects.create(name_de="Gramm", name_en="gram", abbreviation="g")

    r1 = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    RecipeIngredient.objects.create(recipe=r1, ingredient=flour, quantity=200, unit=gram, order=1)

    plan = MealPlan.objects.create(
        household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7)
    )
    MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 1),
        meal_type="DINNER",
        recipe=r1,
        servings=4,
        is_leftover=False,
    )

    shopping_list = generate_shopping_list(plan)
    flour_item = shopping_list.items.get(ingredient=flour)
    assert flour_item.quantity == Decimal("400.00")


@pytest.mark.django_db
def test_shopping_list_converts_to_base_units():
    """Ingredients in derived units are converted and aggregated in base units."""
    household = Household.objects.create(name="Home")
    flour = Ingredient.objects.create(name_de="Mehl", name_en="flour", category="PANTRY")
    gram = Unit.objects.create(name_de="Gramm", name_en="gram", abbreviation="g")
    kg = Unit.objects.create(
        name_de="Kilogramm",
        name_en="kilogram",
        abbreviation="kg",
        base_unit=gram,
        conversion_factor=Decimal("1000"),
    )

    r1 = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    RecipeIngredient.objects.create(recipe=r1, ingredient=flour, quantity=200, unit=gram, order=1)

    r2 = Recipe.objects.create(
        household=household, title="Bread", list_type="KNOWN", default_servings=2
    )
    RecipeIngredient.objects.create(
        recipe=r2, ingredient=flour, quantity=Decimal("1.5"), unit=kg, order=1
    )

    plan = MealPlan.objects.create(
        household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7)
    )
    MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 1),
        meal_type="DINNER",
        recipe=r1,
        servings=2,
        is_leftover=False,
    )
    MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 3),
        meal_type="DINNER",
        recipe=r2,
        servings=2,
        is_leftover=False,
    )

    shopping_list = generate_shopping_list(plan)
    flour_item = shopping_list.items.get(ingredient=flour)
    # 200g + 1.5kg (= 1500g) = 1700g
    assert flour_item.quantity == Decimal("1700.00")
    assert flour_item.unit == gram


@pytest.mark.django_db
def test_shopping_list_replaces_existing_for_same_plan():
    """Regenerating a shopping list for the same meal plan replaces the old one."""
    household = Household.objects.create(name="Home")
    flour = Ingredient.objects.create(name_de="Mehl", name_en="flour", category="PANTRY")
    gram = Unit.objects.create(name_de="Gramm", name_en="gram", abbreviation="g")

    r1 = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    RecipeIngredient.objects.create(recipe=r1, ingredient=flour, quantity=200, unit=gram, order=1)

    plan = MealPlan.objects.create(
        household=household, start_date=date(2026, 3, 1), end_date=date(2026, 3, 7)
    )
    MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 1),
        meal_type="DINNER",
        recipe=r1,
        servings=2,
        is_leftover=False,
    )

    first_list = generate_shopping_list(plan)
    second_list = generate_shopping_list(plan)

    from shopping.models import ShoppingList

    assert ShoppingList.objects.filter(meal_plan=plan).count() == 1
    assert first_list.id != second_list.id
