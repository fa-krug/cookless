import json
from datetime import date

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from planner.models import MealPlan, MealPlanEntry, PlanIteration
from recipes.models import Ingredient, Recipe, RecipeIngredient, Unit
from shopping.models import ShoppingList as ShoppingListModel
from users.models import Household, HouseholdMember

User = get_user_model()


def _create_recipes(household, known=5, to_try=3):
    """Create recipes with ingredients so the generator can score overlap."""
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")
    ingredients = [
        Ingredient.objects.create(name_en=f"Ingredient {i}", name_de=f"Zutat {i}", category="OTHER")
        for i in range(5)
    ]
    recipes = []
    for i in range(known):
        r = Recipe.objects.create(
            household=household,
            title=f"Known Recipe {i}",
            list_type="KNOWN",
            default_servings=2,
        )
        # Add 2 ingredients per recipe with some overlap
        for j in range(2):
            RecipeIngredient.objects.create(
                recipe=r,
                ingredient=ingredients[(i + j) % len(ingredients)],
                quantity=100,
                unit=unit,
                order=j,
            )
        recipes.append(r)
    for i in range(to_try):
        r = Recipe.objects.create(
            household=household,
            title=f"Try Recipe {i}",
            list_type="TO_TRY",
            default_servings=2,
        )
        for j in range(2):
            RecipeIngredient.objects.create(
                recipe=r,
                ingredient=ingredients[(i + j + 2) % len(ingredients)],
                quantity=100,
                unit=unit,
                order=j,
            )
        recipes.append(r)
    return recipes


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


def _setup_payload(**overrides):
    """Return a default setup payload, with optional overrides."""
    payload = {
        "iteration_weeks": 1,
        "shopping_days": [5],
        "servings": 2,
        "known_ratio": 0.7,
        "default_leftover_days": 1,
    }
    payload.update(overrides)
    return payload


@pytest.mark.django_db
def test_setup_meal_plan(auth_client):
    client, household = auth_client
    _create_recipes(household)
    response = client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps(_setup_payload()),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["iteration_weeks"] == 1
    assert data["shopping_days"] == [5]
    assert data["servings"] == 2
    assert len(data["iterations"]) == 1
    iteration = data["iterations"][0]
    assert iteration["status"] == "ACTIVE"
    assert len(iteration["entries"]) > 0
    assert MealPlan.objects.filter(household=household).count() == 1


@pytest.mark.django_db
def test_setup_meal_plan_default_weeks(auth_client):
    client, household = auth_client
    _create_recipes(household)
    response = client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps(_setup_payload()),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    iteration = data["iterations"][0]
    # 1 week iteration, dates should span 7 days
    start = date.fromisoformat(iteration["start_date"])
    end = date.fromisoformat(iteration["end_date"])
    assert (end - start).days == 6


@pytest.mark.django_db
def test_list_meal_plans(auth_client):
    client, household = auth_client
    _create_recipes(household)
    client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps(_setup_payload()),
        content_type="application/json",
    )
    response = client.get("/api/v1/meal-plans/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert len(data[0]["iterations"]) == 1


@pytest.mark.django_db
def test_setup_plan_replaces_old(auth_client):
    client, household = auth_client
    _create_recipes(household)
    client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps(_setup_payload()),
        content_type="application/json",
    )
    assert MealPlan.objects.filter(household=household).count() == 1
    client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps(_setup_payload()),
        content_type="application/json",
    )
    assert MealPlan.objects.filter(household=household).count() == 1


@pytest.mark.django_db
def test_get_meal_plan_detail(auth_client):
    client, household = auth_client
    _create_recipes(household)
    gen_response = client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps(_setup_payload()),
        content_type="application/json",
    )
    plan_id = gen_response.json()["id"]

    response = client.get(f"/api/v1/meal-plans/{plan_id}/")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == plan_id
    assert len(data["iterations"]) == 1
    iteration = data["iterations"][0]
    assert len(iteration["entries"]) > 0
    # Verify entry structure
    entry = iteration["entries"][0]
    assert "id" in entry
    assert "date" in entry
    assert "meal_type" in entry
    assert "recipe" in entry
    assert "servings" in entry
    assert "is_leftover" in entry
    assert "is_locked" in entry


@pytest.mark.django_db
def test_get_meal_plan_not_found(auth_client):
    client, household = auth_client
    response = client.get("/api/v1/meal-plans/00000000-0000-0000-0000-000000000000/")
    assert response.status_code == 404


@pytest.mark.django_db
def test_other_household_plans_not_visible(auth_client):
    client, household = auth_client
    _create_recipes(household)

    # Create another household with a plan
    other_user = User.objects.create_user(email="other@example.com")
    other_household = Household.objects.create(name="Other")
    HouseholdMember.objects.create(household=other_household, user=other_user, role="OWNER")
    other_plan = MealPlan.objects.create(
        household=other_household,
        iteration_weeks=1,
        shopping_days=[5],
        servings=2,
        known_ratio=0.7,
        default_leftover_days=1,
    )
    other_iteration = PlanIteration.objects.create(
        meal_plan=other_plan,
        start_date=date(2026, 3, 1),
        end_date=date(2026, 3, 7),
        status="ACTIVE",
    )
    other_recipes = _create_recipes(other_household)
    MealPlanEntry.objects.create(
        iteration=other_iteration,
        date=date(2026, 3, 1),
        meal_type="LUNCH",
        recipe=other_recipes[0],
        servings=2,
    )

    # List should not include other household's plans
    response = client.get("/api/v1/meal-plans/")
    assert response.status_code == 200
    assert len(response.json()) == 0

    # Detail should 404
    response = client.get(f"/api/v1/meal-plans/{other_plan.id}/")
    assert response.status_code == 404


@pytest.mark.django_db
def test_setup_plan_accepts_default_leftover_days(auth_client):
    client, household = auth_client
    _create_recipes(household)
    response = client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps(_setup_payload(default_leftover_days=2)),
        content_type="application/json",
    )
    assert response.status_code == 201


@pytest.mark.django_db
def test_setup_plan_auto_creates_shopping_list(auth_client):
    client, household = auth_client
    _create_recipes(household)
    response = client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps(_setup_payload()),
        content_type="application/json",
    )
    assert response.status_code == 201
    iteration_id = response.json()["iterations"][0]["id"]
    assert ShoppingListModel.objects.filter(iteration_id=iteration_id).count() >= 1


@pytest.mark.django_db
def test_unauthenticated_access():
    client = Client()
    response = client.get("/api/v1/meal-plans/")
    assert response.status_code == 401


@pytest.mark.django_db
def test_renew_iteration(auth_client):
    client, household = auth_client
    _create_recipes(household)
    setup_response = client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps(_setup_payload()),
        content_type="application/json",
    )
    iteration_id = setup_response.json()["iterations"][0]["id"]

    response = client.post(
        f"/api/v1/meal-plans/iterations/{iteration_id}/renew/",
        content_type="application/json",
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == iteration_id
    assert data["status"] == "ACTIVE"
    assert len(data["entries"]) > 0
    # Entries should be regenerated (different set)
    # At minimum, the iteration should still have entries
    assert len(data["entries"]) >= 1


@pytest.mark.django_db
def test_renew_iteration_not_found(auth_client):
    client, household = auth_client
    response = client.post(
        "/api/v1/meal-plans/iterations/00000000-0000-0000-0000-000000000000/renew/",
        content_type="application/json",
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_next_iteration(auth_client):
    client, household = auth_client
    _create_recipes(household)
    setup_response = client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps(_setup_payload()),
        content_type="application/json",
    )
    first_iteration = setup_response.json()["iterations"][0]

    response = client.post(
        "/api/v1/meal-plans/iterations/next/",
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    # New iteration should start after the first one ends
    assert data["start_date"] > first_iteration["end_date"]
    assert data["status"] == "ACTIVE"
    assert len(data["entries"]) > 0

    # Previous iteration should be archived
    first_iter = PlanIteration.objects.get(id=first_iteration["id"])
    assert first_iter.status == "ARCHIVED"


@pytest.mark.django_db
def test_next_iteration_no_plan(auth_client):
    client, household = auth_client
    response = client.post(
        "/api/v1/meal-plans/iterations/next/",
        content_type="application/json",
    )
    assert response.status_code == 404
