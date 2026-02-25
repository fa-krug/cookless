import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import CookingStep, Ingredient, Recipe, RecipeIngredient, Unit
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
    assert len(response.json()["items"]) == 1


@pytest.mark.django_db
def test_other_household_recipes_not_visible(auth_client):
    client, household = auth_client
    other_household = Household.objects.create(name="Other")
    Recipe.objects.create(
        household=other_household, title="Secret", list_type="KNOWN", default_servings=2
    )
    response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    assert len(response.json()["items"]) == 0


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


@pytest.mark.django_db
def test_recipe_includes_leftover_days(auth_client):
    client, household = auth_client
    response = client.post(
        "/api/v1/recipes/",
        json.dumps(
            {
                "title": "Test",
                "list_type": "KNOWN",
                "default_servings": 2,
                "leftover_days": 3,
            }
        ),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert data["leftover_days"] == 3


@pytest.mark.django_db
def test_list_recipes_query_count(auth_client, django_assert_max_num_queries):
    """Listing recipes should use a constant number of queries regardless of recipe count."""
    client, household = auth_client
    ingredient = Ingredient.objects.create(name_en="Flour", name_de="Mehl", category="PANTRY")
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")

    for i in range(5):
        recipe = Recipe.objects.create(
            household=household, title=f"Recipe {i}", list_type="KNOWN", default_servings=2
        )
        RecipeIngredient.objects.create(
            recipe=recipe, ingredient=ingredient, quantity=100, unit=unit, order=1
        )
        CookingStep.objects.create(
            recipe=recipe, method="MANUAL", step_number=1, instruction="Do something"
        )
        CookingStep.objects.create(
            recipe=recipe, method="MACHINE", step_number=1, instruction="Blend it"
        )

    # 1: session auth, 1: user, 1: active_household FK, 1: household membership check,
    # 1: COUNT query, 1: recipes (no prefetch needed — list uses lean RecipeListOut schema)
    with django_assert_max_num_queries(6):
        response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    assert len(response.json()["items"]) == 5


@pytest.mark.django_db
def test_create_ingredient(auth_client):
    client, household = auth_client
    response = client.post(
        "/api/v1/ingredients/",
        json.dumps({"name_en": "Chickpeas", "name_de": "Kichererbsen", "category": "PANTRY"}),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name_en"] == "Chickpeas"
    assert data["name_de"] == "Kichererbsen"
    assert data["category"] == "PANTRY"
    assert "id" in data


@pytest.mark.django_db
def test_list_recipes_excludes_nested_data(auth_client):
    """The recipe list endpoint should NOT include ingredients or steps."""
    client, household = auth_client
    ingredient = Ingredient.objects.create(name_en="Flour", name_de="Mehl", category="PANTRY")
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")
    recipe = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    RecipeIngredient.objects.create(
        recipe=recipe, ingredient=ingredient, quantity=100, unit=unit, order=1
    )
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=1, instruction="Mix")

    response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 1
    assert "ingredients" not in data["items"][0]
    assert "manual_steps" not in data["items"][0]
    assert "machine_steps" not in data["items"][0]
    assert data["items"][0]["title"] == "Pancakes"


@pytest.mark.django_db
def test_update_recipe_replaces_ingredients_and_steps(auth_client):
    """Updating a recipe should replace all ingredients and steps."""
    client, household = auth_client
    flour = Ingredient.objects.create(name_en="Flour", name_de="Mehl", category="PANTRY")
    sugar = Ingredient.objects.create(name_en="Sugar", name_de="Zucker", category="PANTRY")
    gram = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")

    # Create with flour
    create_resp = client.post(
        "/api/v1/recipes/",
        json.dumps(
            {
                "title": "Cake",
                "list_type": "KNOWN",
                "default_servings": 4,
                "ingredients": [
                    {"ingredient": flour.pk, "quantity": "200.00", "unit": gram.pk, "order": 1}
                ],
                "manual_steps": [{"step_number": 1, "instruction": "Mix"}],
                "machine_steps": [],
            }
        ),
        content_type="application/json",
    )
    recipe_id = create_resp.json()["id"]

    # Update: replace flour with sugar+flour, add a second manual step and a machine step
    update_resp = client.put(
        f"/api/v1/recipes/{recipe_id}/",
        json.dumps(
            {
                "title": "Cake v2",
                "list_type": "KNOWN",
                "default_servings": 8,
                "ingredients": [
                    {"ingredient": sugar.pk, "quantity": "150.00", "unit": gram.pk, "order": 1},
                    {"ingredient": flour.pk, "quantity": "300.00", "unit": gram.pk, "order": 2},
                ],
                "manual_steps": [
                    {"step_number": 1, "instruction": "Sift"},
                    {"step_number": 2, "instruction": "Fold"},
                ],
                "machine_steps": [{"step_number": 1, "instruction": "Blend"}],
            }
        ),
        content_type="application/json",
    )
    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["title"] == "Cake v2"
    assert len(data["ingredients"]) == 2
    assert len(data["manual_steps"]) == 2
    assert len(data["machine_steps"]) == 1

    # Verify old data is gone
    assert RecipeIngredient.objects.filter(recipe_id=recipe_id).count() == 2
    assert CookingStep.objects.filter(recipe_id=recipe_id, method="MANUAL").count() == 2
    assert CookingStep.objects.filter(recipe_id=recipe_id, method="MACHINE").count() == 1


@pytest.mark.django_db
def test_list_recipes_paginated(auth_client):
    client, household = auth_client
    for i in range(25):
        Recipe.objects.create(
            title=f"Recipe {i:02d}",
            household=household,
            list_type="KNOWN",
            default_servings=2,
        )

    response = client.get("/api/v1/recipes/?limit=20&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 20
    assert data["total_count"] == 25

    response = client.get("/api/v1/recipes/?limit=20&offset=20")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 5
    assert data["total_count"] == 25


@pytest.mark.django_db
def test_list_recipes_paginated_with_list_type(auth_client):
    client, household = auth_client
    for i in range(10):
        Recipe.objects.create(
            title=f"Known {i}",
            household=household,
            list_type="KNOWN",
            default_servings=2,
        )
    for i in range(5):
        Recipe.objects.create(
            title=f"ToTry {i}",
            household=household,
            list_type="TO_TRY",
            default_servings=2,
        )

    response = client.get("/api/v1/recipes/?list_type=KNOWN&limit=20&offset=0")
    data = response.json()
    assert data["total_count"] == 10
    assert len(data["items"]) == 10


@pytest.mark.django_db
def test_list_recipes_default_returns_all(auth_client):
    """Without limit/offset params, returns all recipes wrapped in paginated response."""
    client, household = auth_client
    for i in range(5):
        Recipe.objects.create(
            title=f"Recipe {i}",
            household=household,
            list_type="KNOWN",
            default_servings=2,
        )

    response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 5
    assert data["total_count"] == 5
