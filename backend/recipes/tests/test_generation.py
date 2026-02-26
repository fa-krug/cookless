from __future__ import annotations

from django.contrib.auth import get_user_model

import pytest

from recipes.generation import build_generation_prompt
from recipes.models import (
    CookingStep,
    Ingredient,
    Recipe,
    RecipeIngredient,
    Tag,
    Unit,
)
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def household():
    user = User.objects.create_user(email="gen@example.com")
    hh = Household.objects.create(name="Test Home")
    HouseholdMember.objects.create(household=hh, user=user, role="OWNER")
    user.active_household = hh
    user.save()
    return hh


@pytest.fixture
def unit():
    return Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")


@pytest.fixture
def ingredient():
    return Ingredient.objects.create(name_en="Chicken", name_de="Hähnchen", category="MEAT")


@pytest.fixture
def tag(household):
    return Tag.objects.create(
        household=household,
        category="CUISINE",
        name_en="Italian",
        name_de="Italienisch",
    )


@pytest.fixture
def recipe_with_details(household, unit, ingredient, tag):
    recipe = Recipe.objects.create(
        household=household,
        title="Chicken Parm",
        list_type="KNOWN",
        default_servings=2,
    )
    RecipeIngredient.objects.create(
        recipe=recipe, ingredient=ingredient, quantity=500, unit=unit, order=0
    )
    CookingStep.objects.create(
        recipe=recipe, method="MANUAL", step_number=1, instruction="Cook the chicken"
    )
    recipe.tags.add(tag)
    return recipe


@pytest.mark.django_db
def test_build_prompt_includes_recipe_reference(household, recipe_with_details):
    prompt = build_generation_prompt(
        household=household,
        count=2,
        tag_ids=[],
        free_text="",
        language="en",
    )
    assert "Chicken Parm" in prompt
    assert "Chicken" in prompt
    assert "500" in prompt


@pytest.mark.django_db
def test_build_prompt_includes_selected_tags(household, tag, recipe_with_details):
    prompt = build_generation_prompt(
        household=household,
        count=2,
        tag_ids=[str(tag.id)],
        free_text="",
        language="en",
    )
    assert "Italian" in prompt
    assert "REQUIRED TAGS" in prompt


@pytest.mark.django_db
def test_build_prompt_includes_free_text(household):
    prompt = build_generation_prompt(
        household=household,
        count=1,
        tag_ids=[],
        free_text="Must be vegan and gluten-free",
        language="en",
    )
    assert "Must be vegan and gluten-free" in prompt


@pytest.mark.django_db
def test_build_prompt_includes_do_not_repeat(household, recipe_with_details):
    prompt = build_generation_prompt(
        household=household,
        count=2,
        tag_ids=[],
        free_text="",
        language="en",
    )
    assert "Do NOT recreate" in prompt
    assert "Chicken Parm" in prompt


@pytest.mark.django_db
def test_build_prompt_no_existing_recipes(household):
    prompt = build_generation_prompt(
        household=household,
        count=3,
        tag_ids=[],
        free_text="",
        language="de",
    )
    assert "Generate exactly 3 recipes" in prompt
    assert "German" in prompt
    # Should not have reference or do-not-repeat sections
    assert "STYLE REFERENCE" not in prompt
    assert "Do NOT recreate" not in prompt
