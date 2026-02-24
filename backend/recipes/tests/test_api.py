import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import Ingredient, Recipe, Unit
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = Client()
    client.force_login(user)
    return client, household


@pytest.mark.django_db
def test_create_recipe(auth_client):
    client, household = auth_client
    response = client.post(
        "/api/v1/recipes/",
        json.dumps(
            {
                "title": "Pancakes",
                "list_type": "KNOWN",
                "default_servings": 2,
                "ingredients": [],
                "manual_steps": [],
                "machine_steps": [],
            }
        ),
        content_type="application/json",
    )
    assert response.status_code == 201
    assert Recipe.objects.filter(household=household).count() == 1


@pytest.mark.django_db
def test_list_recipes_filtered(auth_client):
    client, household = auth_client
    Recipe.objects.create(
        household=household, title="Known1", list_type="KNOWN", default_servings=2
    )
    Recipe.objects.create(household=household, title="Try1", list_type="TO_TRY", default_servings=2)
    response = client.get("/api/v1/recipes/?list_type=KNOWN")
    assert response.status_code == 200
    assert len(response.json()) == 1


@pytest.mark.django_db
def test_other_household_recipes_not_visible(auth_client):
    client, household = auth_client
    other_household = Household.objects.create(name="Other")
    Recipe.objects.create(
        household=other_household, title="Secret", list_type="KNOWN", default_servings=2
    )
    response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    assert len(response.json()) == 0


@pytest.mark.django_db
def test_move_recipe(auth_client):
    client, household = auth_client
    recipe = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    response = client.post(f"/api/v1/recipes/{recipe.id}/move/")
    assert response.status_code == 200
    recipe.refresh_from_db()
    assert recipe.list_type == "TO_TRY"


@pytest.mark.django_db
def test_create_and_read_recipe_with_nested_data(auth_client):
    client, household = auth_client
    ingredient = Ingredient.objects.create(name_en="Flour", name_de="Mehl", category="PANTRY")
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")

    create_response = client.post(
        "/api/v1/recipes/",
        json.dumps(
            {
                "title": "Pancakes",
                "list_type": "KNOWN",
                "default_servings": 4,
                "ingredients": [
                    {
                        "ingredient": ingredient.pk,
                        "quantity": "200.00",
                        "unit": unit.pk,
                        "order": 1,
                    },
                ],
                "manual_steps": [
                    {"step_number": 1, "instruction": "Mix ingredients"},
                ],
                "machine_steps": [
                    {"step_number": 1, "instruction": "Blend for 30 seconds"},
                ],
            }
        ),
        content_type="application/json",
    )
    assert create_response.status_code == 201
    recipe_id = create_response.json()["id"]

    get_response = client.get(f"/api/v1/recipes/{recipe_id}/")
    assert get_response.status_code == 200
    data = get_response.json()

    assert data["title"] == "Pancakes"
    assert len(data["ingredients"]) == 1
    assert data["ingredients"][0]["ingredient"] == ingredient.pk
    assert len(data["manual_steps"]) == 1
    assert data["manual_steps"][0]["instruction"] == "Mix ingredients"
    assert len(data["machine_steps"]) == 1
    assert data["machine_steps"][0]["instruction"] == "Blend for 30 seconds"
