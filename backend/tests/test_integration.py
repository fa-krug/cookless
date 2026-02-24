"""End-to-end integration test: full meal-planning flow via API."""

import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import Unit
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="integration@example.com", apple_id="int1")
    household = Household.objects.create(name="Test Household")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = Client()
    client.force_login(user)
    return client, household


@pytest.fixture
def units():
    """Create units via ORM (no API endpoint for unit creation)."""
    gram = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")
    milliliter = Unit.objects.create(name_en="milliliter", name_de="Milliliter", abbreviation="ml")
    piece = Unit.objects.create(name_en="piece", name_de="Stueck", abbreviation="pcs")
    return {"g": gram, "ml": milliliter, "pcs": piece}


def _create_ingredient(client, name_en, name_de, category="OTHER"):
    resp = client.post(
        "/api/v1/ingredients/",
        json.dumps({"name_en": name_en, "name_de": name_de, "category": category}),
        content_type="application/json",
    )
    assert resp.status_code == 201, f"Failed to create ingredient {name_en}: {resp.content}"
    return resp.json()


def _create_recipe(client, title, list_type, ingredients, default_servings=2):
    resp = client.post(
        "/api/v1/recipes/",
        json.dumps(
            {
                "title": title,
                "list_type": list_type,
                "default_servings": default_servings,
                "ingredients": ingredients,
                "manual_steps": [{"step_number": 1, "instruction": f"Prepare {title}"}],
                "machine_steps": [],
            }
        ),
        content_type="application/json",
    )
    assert resp.status_code == 201, f"Failed to create recipe {title}: {resp.content}"
    return resp.json()


@pytest.mark.django_db
class TestFullMealPlanFlow:
    """Integration test covering the complete meal-planning workflow.

    Steps:
    1. Create user + household (via fixture)
    2. Add 5 recipes with ingredients (via API)
    3. Generate meal plan
    4. Generate shopping list
    5. Verify shopping list has aggregated ingredients
    6. Check off items (toggle + bulk toggle)
    """

    def test_end_to_end_flow(self, auth_client, units):
        client, household = auth_client

        # ── Step 1: Create ingredients via API ──────────────────────────
        flour = _create_ingredient(client, "Flour", "Mehl", "PANTRY")
        eggs = _create_ingredient(client, "Eggs", "Eier", "DAIRY")
        milk = _create_ingredient(client, "Milk", "Milch", "DAIRY")
        butter = _create_ingredient(client, "Butter", "Butter", "DAIRY")
        sugar = _create_ingredient(client, "Sugar", "Zucker", "PANTRY")
        chicken = _create_ingredient(client, "Chicken", "Haehnchen", "MEAT")
        rice = _create_ingredient(client, "Rice", "Reis", "PANTRY")
        onion = _create_ingredient(client, "Onion", "Zwiebel", "PRODUCE")
        tomato = _create_ingredient(client, "Tomato", "Tomate", "PRODUCE")
        pasta = _create_ingredient(client, "Pasta", "Nudeln", "PANTRY")
        cheese = _create_ingredient(client, "Cheese", "Kaese", "DAIRY")
        garlic = _create_ingredient(client, "Garlic", "Knoblauch", "PRODUCE")

        # Verify ingredients list
        resp = client.get("/api/v1/ingredients/")
        assert resp.status_code == 200
        assert len(resp.json()) == 12

        # ── Step 2: Create 5 recipes (3 KNOWN, 2 TO_TRY) ──────────────
        # Recipes share overlapping ingredients (flour, eggs, milk, butter, onion, garlic)

        # KNOWN recipe 1: Pancakes (flour, eggs, milk, butter, sugar)
        _create_recipe(
            client,
            "Pancakes",
            "KNOWN",
            [
                {
                    "ingredient": flour["id"],
                    "quantity": "300.00",
                    "unit": units["g"].pk,
                    "order": 1,
                },
                {"ingredient": eggs["id"], "quantity": "3.00", "unit": units["pcs"].pk, "order": 2},
                {
                    "ingredient": milk["id"],
                    "quantity": "250.00",
                    "unit": units["ml"].pk,
                    "order": 3,
                },
                {
                    "ingredient": butter["id"],
                    "quantity": "50.00",
                    "unit": units["g"].pk,
                    "order": 4,
                },
                {"ingredient": sugar["id"], "quantity": "30.00", "unit": units["g"].pk, "order": 5},
            ],
        )

        # KNOWN recipe 2: Chicken Rice (chicken, rice, onion, garlic, butter)
        _create_recipe(
            client,
            "Chicken Rice",
            "KNOWN",
            [
                {
                    "ingredient": chicken["id"],
                    "quantity": "500.00",
                    "unit": units["g"].pk,
                    "order": 1,
                },
                {
                    "ingredient": rice["id"],
                    "quantity": "300.00",
                    "unit": units["g"].pk,
                    "order": 2,
                },
                {
                    "ingredient": onion["id"],
                    "quantity": "2.00",
                    "unit": units["pcs"].pk,
                    "order": 3,
                },
                {
                    "ingredient": garlic["id"],
                    "quantity": "3.00",
                    "unit": units["pcs"].pk,
                    "order": 4,
                },
                {
                    "ingredient": butter["id"],
                    "quantity": "20.00",
                    "unit": units["g"].pk,
                    "order": 5,
                },
            ],
        )

        # KNOWN recipe 3: Pasta Bake (pasta, cheese, tomato, onion, garlic)
        _create_recipe(
            client,
            "Pasta Bake",
            "KNOWN",
            [
                {
                    "ingredient": pasta["id"],
                    "quantity": "400.00",
                    "unit": units["g"].pk,
                    "order": 1,
                },
                {
                    "ingredient": cheese["id"],
                    "quantity": "200.00",
                    "unit": units["g"].pk,
                    "order": 2,
                },
                {
                    "ingredient": tomato["id"],
                    "quantity": "4.00",
                    "unit": units["pcs"].pk,
                    "order": 3,
                },
                {
                    "ingredient": onion["id"],
                    "quantity": "1.00",
                    "unit": units["pcs"].pk,
                    "order": 4,
                },
                {
                    "ingredient": garlic["id"],
                    "quantity": "2.00",
                    "unit": units["pcs"].pk,
                    "order": 5,
                },
            ],
        )

        # TO_TRY recipe 1: French Toast (flour, eggs, milk, butter, sugar)
        _create_recipe(
            client,
            "French Toast",
            "TO_TRY",
            [
                {
                    "ingredient": flour["id"],
                    "quantity": "100.00",
                    "unit": units["g"].pk,
                    "order": 1,
                },
                {"ingredient": eggs["id"], "quantity": "2.00", "unit": units["pcs"].pk, "order": 2},
                {
                    "ingredient": milk["id"],
                    "quantity": "150.00",
                    "unit": units["ml"].pk,
                    "order": 3,
                },
                {
                    "ingredient": butter["id"],
                    "quantity": "30.00",
                    "unit": units["g"].pk,
                    "order": 4,
                },
                {"ingredient": sugar["id"], "quantity": "20.00", "unit": units["g"].pk, "order": 5},
            ],
        )

        # TO_TRY recipe 2: Tomato Rice (rice, tomato, onion, garlic, chicken)
        _create_recipe(
            client,
            "Tomato Rice",
            "TO_TRY",
            [
                {"ingredient": rice["id"], "quantity": "350.00", "unit": units["g"].pk, "order": 1},
                {
                    "ingredient": tomato["id"],
                    "quantity": "3.00",
                    "unit": units["pcs"].pk,
                    "order": 2,
                },
                {
                    "ingredient": onion["id"],
                    "quantity": "1.00",
                    "unit": units["pcs"].pk,
                    "order": 3,
                },
                {
                    "ingredient": garlic["id"],
                    "quantity": "2.00",
                    "unit": units["pcs"].pk,
                    "order": 4,
                },
                {
                    "ingredient": chicken["id"],
                    "quantity": "300.00",
                    "unit": units["g"].pk,
                    "order": 5,
                },
            ],
        )

        # Verify all recipes exist
        resp = client.get("/api/v1/recipes/")
        assert resp.status_code == 200
        assert len(resp.json()) == 5

        # Verify filtering by list_type
        resp = client.get("/api/v1/recipes/?list_type=KNOWN")
        assert resp.status_code == 200
        assert len(resp.json()) == 3

        resp = client.get("/api/v1/recipes/?list_type=TO_TRY")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

        # ── Step 3: Generate meal plan ──────────────────────────────────
        resp = client.post(
            "/api/v1/meal-plans/generate/",
            json.dumps({"start_date": "2026-03-01", "days": 7, "servings": 2}),
            content_type="application/json",
        )
        assert resp.status_code == 201, f"Failed to generate meal plan: {resp.content}"
        meal_plan = resp.json()
        plan_id = meal_plan["id"]

        # Meal plan should have entries covering the week
        assert len(meal_plan["entries"]) > 0
        assert meal_plan["start_date"] == "2026-03-01"
        assert meal_plan["end_date"] == "2026-03-07"

        # Each entry should have required fields
        for entry in meal_plan["entries"]:
            assert entry["meal_type"] in ("LUNCH", "DINNER")
            assert entry["servings"] == 2
            assert "recipe" in entry
            assert "is_leftover" in entry

        # Verify meal plan listing
        resp = client.get("/api/v1/meal-plans/")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

        # Verify individual meal plan retrieval
        resp = client.get(f"/api/v1/meal-plans/{plan_id}/")
        assert resp.status_code == 200
        assert resp.json()["id"] == plan_id

        # ── Step 4: Generate shopping list ──────────────────────────────
        resp = client.post(
            "/api/v1/shopping-lists/generate/",
            json.dumps({"meal_plan": plan_id}),
            content_type="application/json",
        )
        assert resp.status_code == 201, f"Failed to generate shopping list: {resp.content}"
        shopping_list = resp.json()
        shopping_list_id = shopping_list["id"]

        assert shopping_list["meal_plan"] == plan_id
        assert len(shopping_list["items"]) > 0

        # ── Step 5: Verify shopping list aggregation ────────────────────
        items = shopping_list["items"]

        # All items should start unchecked
        for item in items:
            assert item["is_checked"] is False
            assert float(item["quantity"]) > 0
            assert item["ingredient_name"] != ""
            assert item["unit_abbreviation"] != ""

        # Ingredients should be unique per unit — aggregation means no duplicates
        ingredient_unit_pairs = [(i["ingredient_name"], i["unit_abbreviation"]) for i in items]
        assert len(ingredient_unit_pairs) == len(set(ingredient_unit_pairs)), (
            "Shopping list should have aggregated ingredients (no duplicate ingredient+unit pairs)"
        )

        # Verify shopping list retrieval
        resp = client.get(f"/api/v1/shopping-lists/{shopping_list_id}/")
        assert resp.status_code == 200
        assert resp.json()["id"] == shopping_list_id

        # Verify shopping list listing
        resp = client.get("/api/v1/shopping-lists/")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

        # ── Step 6: Toggle individual items and bulk toggle ─────────────
        # Toggle first item ON
        first_item_id = items[0]["id"]
        resp = client.patch(
            f"/api/v1/shopping-lists/items/{first_item_id}/toggle/",
            content_type="application/json",
        )
        assert resp.status_code == 200
        toggled = resp.json()
        assert toggled["is_checked"] is True

        # Toggle it back OFF
        resp = client.patch(
            f"/api/v1/shopping-lists/items/{first_item_id}/toggle/",
            content_type="application/json",
        )
        assert resp.status_code == 200
        toggled = resp.json()
        assert toggled["is_checked"] is False

        # Bulk toggle: check off multiple items
        bulk_item_ids = [item["id"] for item in items[:3]] if len(items) >= 3 else [items[0]["id"]]
        resp = client.patch(
            "/api/v1/shopping-lists/items/bulk-toggle/",
            json.dumps({"item_ids": bulk_item_ids, "is_checked": True}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        bulk_result = resp.json()
        assert len(bulk_result) == len(bulk_item_ids)
        for item in bulk_result:
            assert item["is_checked"] is True

        # Verify the state persisted by re-fetching the shopping list
        resp = client.get(f"/api/v1/shopping-lists/{shopping_list_id}/")
        assert resp.status_code == 200
        refreshed_items = resp.json()["items"]
        checked_ids = {i["id"] for i in refreshed_items if i["is_checked"]}
        for item_id in bulk_item_ids:
            assert item_id in checked_ids, f"Item {item_id} should be checked after bulk toggle"

        # Bulk toggle: uncheck them
        resp = client.patch(
            "/api/v1/shopping-lists/items/bulk-toggle/",
            json.dumps({"item_ids": bulk_item_ids, "is_checked": False}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        bulk_result = resp.json()
        for item in bulk_result:
            assert item["is_checked"] is False
