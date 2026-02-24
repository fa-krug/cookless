from django.contrib.auth import get_user_model

import pytest
from rest_framework.test import APIClient

from recipes.models import Recipe
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = APIClient()
    client.force_authenticate(user=user)
    return client, household


@pytest.mark.django_db
def test_create_recipe(auth_client):
    client, household = auth_client
    response = client.post(
        "/api/v1/recipes/",
        {
            "title": "Pancakes",
            "list_type": "KNOWN",
            "default_servings": 2,
            "ingredients": [],
            "manual_steps": [],
            "machine_steps": [],
        },
        format="json",
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
    assert len(response.data) == 1


@pytest.mark.django_db
def test_other_household_recipes_not_visible(auth_client):
    client, household = auth_client
    other_household = Household.objects.create(name="Other")
    Recipe.objects.create(
        household=other_household, title="Secret", list_type="KNOWN", default_servings=2
    )
    response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    assert len(response.data) == 0


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
