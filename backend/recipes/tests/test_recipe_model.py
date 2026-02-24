from django.contrib.auth import get_user_model

import pytest

from recipes.models import CookingStep, Ingredient, Recipe, RecipeIngredient, Unit
from users.models import Household

User = get_user_model()


@pytest.mark.django_db
def test_create_recipe_with_ingredients_and_steps():
    household = Household.objects.create(name="Home")
    flour = Ingredient.objects.create(name_de="Mehl", name_en="flour", category="PANTRY")
    gram = Unit.objects.create(name_de="Gramm", name_en="gram", abbreviation="g")

    recipe = Recipe.objects.create(
        household=household,
        title="Pancakes",
        list_type="KNOWN",
        default_servings=2,
    )
    RecipeIngredient.objects.create(
        recipe=recipe, ingredient=flour, quantity=200, unit=gram, order=1
    )
    CookingStep.objects.create(
        recipe=recipe, method="MANUAL", step_number=1, instruction="Mix flour"
    )
    CookingStep.objects.create(
        recipe=recipe, method="MACHINE", step_number=1, instruction="Add flour to MC"
    )

    assert recipe.ingredients.count() == 1
    assert recipe.steps.filter(method="MANUAL").count() == 1
    assert recipe.steps.filter(method="MACHINE").count() == 1


@pytest.mark.django_db
def test_recipe_str():
    household = Household.objects.create(name="Home")
    recipe = Recipe.objects.create(
        household=household,
        title="Pancakes",
        list_type="KNOWN",
        default_servings=2,
    )
    assert str(recipe) == "Pancakes"


@pytest.mark.django_db
def test_recipe_ingredient_ordering():
    household = Household.objects.create(name="Home")
    flour = Ingredient.objects.create(name_de="Mehl", name_en="flour", category="PANTRY")
    sugar = Ingredient.objects.create(name_de="Zucker", name_en="sugar", category="PANTRY")
    gram = Unit.objects.create(name_de="Gramm", name_en="gram", abbreviation="g")

    recipe = Recipe.objects.create(
        household=household, title="Cake", list_type="KNOWN", default_servings=4
    )
    ri2 = RecipeIngredient.objects.create(
        recipe=recipe, ingredient=sugar, quantity=100, unit=gram, order=2
    )
    ri1 = RecipeIngredient.objects.create(
        recipe=recipe, ingredient=flour, quantity=200, unit=gram, order=1
    )

    ingredients = list(recipe.ingredients.all())
    assert ingredients == [ri1, ri2]


@pytest.mark.django_db
def test_cooking_step_ordering():
    household = Household.objects.create(name="Home")
    recipe = Recipe.objects.create(
        household=household, title="Soup", list_type="KNOWN", default_servings=2
    )
    machine_2 = CookingStep.objects.create(
        recipe=recipe, method="MACHINE", step_number=2, instruction="Blend"
    )
    manual_1 = CookingStep.objects.create(
        recipe=recipe, method="MANUAL", step_number=1, instruction="Chop"
    )
    machine_1 = CookingStep.objects.create(
        recipe=recipe, method="MACHINE", step_number=1, instruction="Heat"
    )

    steps = list(recipe.steps.all())
    assert steps == [machine_1, machine_2, manual_1]
