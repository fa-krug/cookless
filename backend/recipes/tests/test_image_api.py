from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import Recipe
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="img@example.com")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = Client()
    client.force_login(user)
    return client, household, user


@pytest.fixture
def recipe(auth_client):
    _, household, _ = auth_client
    return Recipe.objects.create(
        household=household,
        title="Pasta",
        list_type="KNOWN",
        default_servings=2,
    )


@pytest.mark.django_db
def test_recipe_list_includes_image_field(auth_client, recipe):
    client, _, _ = auth_client
    response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert "image" in item
    assert item["image"] is None


@pytest.mark.django_db
def test_recipe_detail_includes_image_field(auth_client, recipe):
    client, _, _ = auth_client
    response = client.get(f"/api/v1/recipes/{recipe.id}/")
    assert response.status_code == 200
    data = response.json()
    assert "image" in data
    assert data["image"] is None
