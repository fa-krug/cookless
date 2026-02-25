import json
from datetime import date

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from planner.models import MealPlan, MealPlanEntry
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


@pytest.mark.django_db
def test_generate_meal_plan(auth_client):
    client, household = auth_client
    _create_recipes(household)
    response = client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01", "days": 7, "servings": 2}),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["start_date"] == "2026-03-01"
    assert data["end_date"] == "2026-03-07"
    assert len(data["entries"]) > 0
    assert MealPlan.objects.filter(household=household).count() == 1


@pytest.mark.django_db
def test_generate_meal_plan_default_days(auth_client):
    client, household = auth_client
    _create_recipes(household)
    response = client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01"}),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert data["end_date"] == "2026-03-07"


@pytest.mark.django_db
def test_list_meal_plans(auth_client):
    client, household = auth_client
    _create_recipes(household)
    client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01", "days": 7}),
        content_type="application/json",
    )
    response = client.get("/api/v1/meal-plans/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["start_date"] == "2026-03-01"


@pytest.mark.django_db
def test_generate_plan_replaces_old(auth_client):
    client, household = auth_client
    _create_recipes(household)
    client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01", "days": 7}),
        content_type="application/json",
    )
    assert MealPlan.objects.filter(household=household).count() == 1
    client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-08", "days": 7}),
        content_type="application/json",
    )
    assert MealPlan.objects.filter(household=household).count() == 1
    plan = MealPlan.objects.get(household=household)
    assert str(plan.start_date) == "2026-03-08"


@pytest.mark.django_db
def test_get_meal_plan_detail(auth_client):
    client, household = auth_client
    _create_recipes(household)
    gen_response = client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01", "days": 7}),
        content_type="application/json",
    )
    plan_id = gen_response.json()["id"]

    response = client.get(f"/api/v1/meal-plans/{plan_id}/")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == plan_id
    assert len(data["entries"]) > 0
    # Verify entry structure
    entry = data["entries"][0]
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
def test_update_entry_swap_recipe(auth_client):
    client, household = auth_client
    recipes = _create_recipes(household)
    gen_response = client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01", "days": 7}),
        content_type="application/json",
    )
    plan_data = gen_response.json()
    entry = plan_data["entries"][0]
    entry_id = entry["id"]

    # Pick a different recipe than currently assigned
    current_recipe_id = entry["recipe"]
    new_recipe = next(r for r in recipes if str(r.id) != current_recipe_id)

    response = client.put(
        f"/api/v1/meal-plans/entries/{entry_id}/",
        json.dumps({"recipe": str(new_recipe.id), "servings": 4, "is_locked": True}),
        content_type="application/json",
    )
    assert response.status_code == 200
    data = response.json()
    assert data["recipe"] == str(new_recipe.id)
    assert data["servings"] == 4
    assert data["is_locked"] is True


@pytest.mark.django_db
def test_update_entry_partial_fields(auth_client):
    """Test that only provided fields are updated."""
    client, household = auth_client
    _create_recipes(household)
    gen_response = client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01", "days": 7}),
        content_type="application/json",
    )
    entry = gen_response.json()["entries"][0]
    entry_id = entry["id"]
    original_servings = entry["servings"]

    # Only pass recipe (required) without servings/is_locked
    response = client.put(
        f"/api/v1/meal-plans/entries/{entry_id}/",
        json.dumps({"recipe": entry["recipe"]}),
        content_type="application/json",
    )
    assert response.status_code == 200
    data = response.json()
    assert data["servings"] == original_servings
    assert data["is_locked"] is False


@pytest.mark.django_db
def test_update_entry_not_found(auth_client):
    client, household = auth_client
    recipes = _create_recipes(household)
    response = client.put(
        "/api/v1/meal-plans/entries/00000000-0000-0000-0000-000000000000/",
        json.dumps({"recipe": str(recipes[0].id)}),
        content_type="application/json",
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_update_entry_recipe_from_other_household(auth_client):
    """Cannot swap to a recipe from a different household."""
    client, household = auth_client
    _create_recipes(household)
    other_household = Household.objects.create(name="Other")
    other_recipe = Recipe.objects.create(
        household=other_household,
        title="Other Recipe",
        list_type="KNOWN",
        default_servings=2,
    )
    gen_response = client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01", "days": 7}),
        content_type="application/json",
    )
    entry_id = gen_response.json()["entries"][0]["id"]

    response = client.put(
        f"/api/v1/meal-plans/entries/{entry_id}/",
        json.dumps({"recipe": str(other_recipe.id)}),
        content_type="application/json",
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_regenerate_plan(auth_client):
    client, household = auth_client
    _create_recipes(household)
    gen_response = client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01", "days": 7}),
        content_type="application/json",
    )
    plan_id = gen_response.json()["id"]

    response = client.post(f"/api/v1/meal-plans/{plan_id}/regenerate/")
    assert response.status_code == 200
    data = response.json()
    # Regenerate returns the SAME plan
    assert data["id"] == plan_id
    assert data["start_date"] == "2026-03-01"
    assert len(data["entries"]) == 7
    assert all(e["meal_type"] == "LUNCH" for e in data["entries"])
    # No extra plans were created
    assert MealPlan.objects.filter(household=household).count() == 1


@pytest.mark.django_db
def test_other_household_plans_not_visible(auth_client):
    client, household = auth_client
    _create_recipes(household)

    # Create another household with a plan
    other_user = User.objects.create_user(email="other@example.com")
    other_household = Household.objects.create(name="Other")
    HouseholdMember.objects.create(household=other_household, user=other_user, role="OWNER")
    other_recipes = _create_recipes(other_household)
    other_plan = MealPlan.objects.create(
        household=other_household,
        start_date=date(2026, 3, 1),
        end_date=date(2026, 3, 7),
    )
    MealPlanEntry.objects.create(
        meal_plan=other_plan,
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
def test_other_household_entry_not_updatable(auth_client):
    """Cannot update an entry belonging to another household's plan."""
    client, household = auth_client
    recipes = _create_recipes(household)

    other_household = Household.objects.create(name="Other")
    other_recipe = Recipe.objects.create(
        household=other_household,
        title="Other Recipe",
        list_type="KNOWN",
        default_servings=2,
    )
    other_plan = MealPlan.objects.create(
        household=other_household,
        start_date=date(2026, 3, 1),
        end_date=date(2026, 3, 7),
    )
    other_entry = MealPlanEntry.objects.create(
        meal_plan=other_plan,
        date=date(2026, 3, 1),
        meal_type="LUNCH",
        recipe=other_recipe,
        servings=2,
    )

    response = client.put(
        f"/api/v1/meal-plans/entries/{other_entry.id}/",
        json.dumps({"recipe": str(recipes[0].id)}),
        content_type="application/json",
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_generate_plan_accepts_default_leftover_days(auth_client):
    client, household = auth_client
    _create_recipes(household)
    response = client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps(
            {
                "start_date": "2026-03-01",
                "days": 7,
                "servings": 2,
                "default_leftover_days": 2,
            }
        ),
        content_type="application/json",
    )
    assert response.status_code == 201


@pytest.mark.django_db
def test_generate_plan_auto_creates_shopping_list(auth_client):
    client, household = auth_client
    _create_recipes(household)
    response = client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01", "days": 7}),
        content_type="application/json",
    )
    assert response.status_code == 201
    plan_id = response.json()["id"]
    assert ShoppingListModel.objects.filter(meal_plan_id=plan_id).count() == 1


@pytest.mark.django_db
def test_unauthenticated_access():
    client = Client()
    response = client.get("/api/v1/meal-plans/")
    assert response.status_code == 401
