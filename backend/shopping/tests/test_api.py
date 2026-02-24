import json
from datetime import date

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from planner.models import MealPlan, MealPlanEntry
from recipes.models import Ingredient, Recipe, RecipeIngredient, Unit
from users.models import Household, HouseholdMember

User = get_user_model()


def _setup_plan_with_ingredients(household):
    """Create a meal plan with recipes that have ingredients, ready for shopping list generation."""
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")
    ingredients = [
        Ingredient.objects.create(
            name_en=f"Ingredient {i}", name_de=f"Zutat {i}", category="PRODUCE"
        )
        for i in range(3)
    ]
    recipe = Recipe.objects.create(
        household=household,
        title="Test Recipe",
        list_type="KNOWN",
        default_servings=2,
    )
    for i, ing in enumerate(ingredients):
        RecipeIngredient.objects.create(
            recipe=recipe, ingredient=ing, quantity=100, unit=unit, order=i
        )

    plan = MealPlan.objects.create(
        household=household,
        start_date=date(2026, 3, 1),
        end_date=date(2026, 3, 7),
    )
    MealPlanEntry.objects.create(
        meal_plan=plan,
        date=date(2026, 3, 1),
        meal_type="LUNCH",
        recipe=recipe,
        servings=2,
    )
    return plan, recipe, ingredients, unit


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


@pytest.mark.django_db
def test_generate_shopping_list(auth_client):
    client, household = auth_client
    plan, _, ingredients, _ = _setup_plan_with_ingredients(household)

    response = client.post(
        "/api/v1/shopping-lists/generate/",
        json.dumps({"meal_plan": str(plan.id)}),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["meal_plan"] == str(plan.id)
    assert len(data["items"]) == len(ingredients)
    assert "created_at" in data

    # Verify item structure
    item = data["items"][0]
    assert "id" in item
    assert "ingredient_name" in item
    assert "ingredient_category" in item
    assert "quantity" in item
    assert "unit_abbreviation" in item
    assert "is_checked" in item


@pytest.mark.django_db
def test_generate_shopping_list_plan_not_found(auth_client):
    client, _ = auth_client

    response = client.post(
        "/api/v1/shopping-lists/generate/",
        json.dumps({"meal_plan": "00000000-0000-0000-0000-000000000000"}),
        content_type="application/json",
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_generate_shopping_list_other_household(auth_client):
    client, household = auth_client

    # Create plan in another household
    other_household = Household.objects.create(name="Other")
    plan, _, _, _ = _setup_plan_with_ingredients(other_household)

    response = client.post(
        "/api/v1/shopping-lists/generate/",
        json.dumps({"meal_plan": str(plan.id)}),
        content_type="application/json",
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_list_shopping_lists(auth_client):
    client, household = auth_client
    plan, _, ingredients, _ = _setup_plan_with_ingredients(household)

    # Generate a shopping list via the service
    client.post(
        "/api/v1/shopping-lists/generate/",
        json.dumps({"meal_plan": str(plan.id)}),
        content_type="application/json",
    )

    response = client.get("/api/v1/shopping-lists/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["meal_plan"] == str(plan.id)
    assert len(data[0]["items"]) == len(ingredients)


@pytest.mark.django_db
def test_get_shopping_list_detail(auth_client):
    client, household = auth_client
    plan, _, ingredients, _ = _setup_plan_with_ingredients(household)

    gen_response = client.post(
        "/api/v1/shopping-lists/generate/",
        json.dumps({"meal_plan": str(plan.id)}),
        content_type="application/json",
    )
    list_id = gen_response.json()["id"]

    response = client.get(f"/api/v1/shopping-lists/{list_id}/")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == list_id
    assert len(data["items"]) == len(ingredients)

    # Items should be ordered by category then ingredient name
    item_names = [item["ingredient_name"] for item in data["items"]]
    assert item_names == sorted(item_names)


@pytest.mark.django_db
def test_toggle_item(auth_client):
    client, household = auth_client
    plan, _, _, _ = _setup_plan_with_ingredients(household)

    gen_response = client.post(
        "/api/v1/shopping-lists/generate/",
        json.dumps({"meal_plan": str(plan.id)}),
        content_type="application/json",
    )
    item_id = gen_response.json()["items"][0]["id"]

    # Item starts unchecked
    assert gen_response.json()["items"][0]["is_checked"] is False

    # Toggle to checked
    response = client.patch(
        f"/api/v1/shopping-lists/items/{item_id}/toggle/",
        content_type="application/json",
    )
    assert response.status_code == 200
    assert response.json()["is_checked"] is True

    # Toggle back to unchecked
    response = client.patch(
        f"/api/v1/shopping-lists/items/{item_id}/toggle/",
        content_type="application/json",
    )
    assert response.status_code == 200
    assert response.json()["is_checked"] is False


@pytest.mark.django_db
def test_bulk_toggle_items(auth_client):
    client, household = auth_client
    plan, _, _, _ = _setup_plan_with_ingredients(household)

    gen_response = client.post(
        "/api/v1/shopping-lists/generate/",
        json.dumps({"meal_plan": str(plan.id)}),
        content_type="application/json",
    )
    items = gen_response.json()["items"]
    item_ids = [item["id"] for item in items]

    # Bulk check all items
    response = client.patch(
        "/api/v1/shopping-lists/items/bulk-toggle/",
        json.dumps({"item_ids": item_ids, "is_checked": True}),
        content_type="application/json",
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == len(item_ids)
    assert all(item["is_checked"] is True for item in data)

    # Bulk uncheck all items
    response = client.patch(
        "/api/v1/shopping-lists/items/bulk-toggle/",
        json.dumps({"item_ids": item_ids, "is_checked": False}),
        content_type="application/json",
    )
    assert response.status_code == 200
    data = response.json()
    assert all(item["is_checked"] is False for item in data)


@pytest.mark.django_db
def test_unauthenticated_access():
    client = Client()
    response = client.get("/api/v1/shopping-lists/")
    assert response.status_code == 401

    response = client.post(
        "/api/v1/shopping-lists/generate/",
        json.dumps({"meal_plan": "00000000-0000-0000-0000-000000000000"}),
        content_type="application/json",
    )
    assert response.status_code == 401
