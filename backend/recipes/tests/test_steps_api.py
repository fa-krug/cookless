from django.contrib.auth import get_user_model

import pytest
from rest_framework.test import APIClient

from recipes.models import CookingStep, Recipe
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client_fixture():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = APIClient()
    client.force_authenticate(user=user)
    return client, household


@pytest.mark.django_db
def test_get_manual_steps(auth_client_fixture):
    client, household = auth_client_fixture
    recipe = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=1, instruction="Mix")
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=2, instruction="Cook")
    CookingStep.objects.create(
        recipe=recipe, method="MACHINE", step_number=1, instruction="Add to MC"
    )

    response = client.get(f"/api/v1/recipes/{recipe.id}/steps/?method=MANUAL")
    assert response.status_code == 200
    assert len(response.data) == 2


@pytest.mark.django_db
def test_get_machine_steps(auth_client_fixture):
    client, household = auth_client_fixture
    recipe = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=1, instruction="Mix")
    CookingStep.objects.create(
        recipe=recipe, method="MACHINE", step_number=1, instruction="Add to MC"
    )

    response = client.get(f"/api/v1/recipes/{recipe.id}/steps/?method=MACHINE")
    assert response.status_code == 200
    assert len(response.data) == 1
    assert response.data[0]["instruction"] == "Add to MC"


@pytest.mark.django_db
def test_get_all_steps_no_filter(auth_client_fixture):
    client, household = auth_client_fixture
    recipe = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=1, instruction="Mix")
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=2, instruction="Cook")
    CookingStep.objects.create(
        recipe=recipe, method="MACHINE", step_number=1, instruction="Add to MC"
    )

    response = client.get(f"/api/v1/recipes/{recipe.id}/steps/")
    assert response.status_code == 200
    assert len(response.data) == 3


@pytest.mark.django_db
def test_steps_recipe_not_in_household(auth_client_fixture):
    client, household = auth_client_fixture
    other_household = Household.objects.create(name="Other")
    recipe = Recipe.objects.create(
        household=other_household, title="Secret", list_type="KNOWN", default_servings=2
    )
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=1, instruction="Mix")

    response = client.get(f"/api/v1/recipes/{recipe.id}/steps/?method=MANUAL")
    assert response.status_code == 404
