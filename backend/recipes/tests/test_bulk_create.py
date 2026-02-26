import base64
import json
from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import Client

import pytest
from PIL import Image as PILImage

from recipes.models import Ingredient, Recipe, RecipeIngredient, Tag, Unit
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="test@example.com")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = Client()
    client.force_login(user)
    return client, household


@pytest.fixture
def unit_g():
    return Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")


@pytest.fixture
def unit_ml():
    return Unit.objects.create(name_en="milliliter", name_de="Milliliter", abbreviation="ml")


@pytest.fixture
def ingredient_flour():
    return Ingredient.objects.create(name_en="Flour", name_de="Mehl", category="PANTRY")


def _make_base64_image():
    img = PILImage.new("RGB", (100, 100), color="red")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


@pytest.mark.django_db
def test_bulk_create_recipes(auth_client, unit_g, unit_ml, ingredient_flour):
    client, household = auth_client
    tag = Tag.objects.create(
        household=household, category="CUISINE", name_en="Italian", name_de="Italienisch"
    )

    payload = {
        "recipes": [
            {
                "title": "Recipe One",
                "default_servings": 4,
                "prep_time_minutes": 10,
                "cook_time_minutes": 20,
                "ingredients": [
                    {
                        "name_en": "Flour",
                        "name_de": "Mehl",
                        "category": "PANTRY",
                        "quantity": "200",
                        "unit_abbreviation": "g",
                        "order": 0,
                    }
                ],
                "manual_steps": [{"step_number": 1, "instruction": "Mix it"}],
                "machine_steps": [],
                "tag_ids": [str(tag.id)],
            },
            {
                "title": "Recipe Two",
                "default_servings": 2,
                "ingredients": [
                    {
                        "name_en": "Flour",
                        "name_de": "Mehl",
                        "category": "PANTRY",
                        "quantity": "100",
                        "unit_abbreviation": "ml",
                        "order": 0,
                    }
                ],
                "manual_steps": [],
                "machine_steps": [],
                "tag_ids": [],
            },
        ]
    }

    response = client.post(
        "/api/v1/recipes/bulk-create/",
        json.dumps(payload),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert len(data["created_ids"]) == 2

    assert Recipe.objects.filter(household=household).count() == 2

    recipe_one = Recipe.objects.get(title="Recipe One")
    assert recipe_one.list_type == "TO_TRY"
    assert recipe_one.default_servings == 4
    assert recipe_one.ingredients.count() == 1
    assert recipe_one.tags.count() == 1
    assert recipe_one.steps.filter(method="MANUAL").count() == 1

    recipe_two = Recipe.objects.get(title="Recipe Two")
    assert recipe_two.list_type == "TO_TRY"
    assert recipe_two.ingredients.count() == 1


@pytest.mark.django_db
def test_bulk_create_creates_new_ingredients(auth_client, unit_g):
    client, household = auth_client

    payload = {
        "recipes": [
            {
                "title": "New Ingredient Recipe",
                "ingredients": [
                    {
                        "name_en": "Dragon Fruit",
                        "name_de": "Drachenfrucht",
                        "category": "PRODUCE",
                        "quantity": "150",
                        "unit_abbreviation": "g",
                        "order": 0,
                    }
                ],
                "manual_steps": [],
                "machine_steps": [],
            }
        ]
    }

    response = client.post(
        "/api/v1/recipes/bulk-create/",
        json.dumps(payload),
        content_type="application/json",
    )
    assert response.status_code == 201

    assert Ingredient.objects.filter(name_en="Dragon Fruit").exists()
    ingredient = Ingredient.objects.get(name_en="Dragon Fruit")
    assert ingredient.name_de == "Drachenfrucht"
    assert ingredient.category == "PRODUCE"

    recipe = Recipe.objects.get(title="New Ingredient Recipe")
    assert recipe.ingredients.count() == 1
    ri = RecipeIngredient.objects.get(recipe=recipe)
    assert ri.ingredient == ingredient


@pytest.mark.django_db
def test_bulk_create_with_image_base64(auth_client, unit_g):
    client, household = auth_client
    b64_image = _make_base64_image()

    payload = {
        "recipes": [
            {
                "title": "Image Recipe",
                "ingredients": [],
                "manual_steps": [],
                "machine_steps": [],
                "image_base64": b64_image,
            }
        ]
    }

    response = client.post(
        "/api/v1/recipes/bulk-create/",
        json.dumps(payload),
        content_type="application/json",
    )
    assert response.status_code == 201

    recipe = Recipe.objects.get(title="Image Recipe")
    assert recipe.image
    assert recipe.image.name
