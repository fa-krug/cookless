import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import CookingStep, Recipe
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="prog@example.com")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = Client()
    client.force_login(user)
    return client, household


@pytest.mark.django_db
def test_create_recipe_with_program_step(auth_client):
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [
            {
                "step_number": 1,
                "instruction": "",
                "program_type": "MANUAL_COOKING",
                "temperature": 100,
                "duration_seconds": 300,
                "speed": 5,
                "direction": "LEFT",
                "turbo": False,
            }
        ],
    }
    resp = client.post("/api/v1/recipes/", json.dumps(payload), content_type="application/json")
    assert resp.status_code == 201
    data = resp.json()
    step = data["machine_steps"][0]
    assert step["program_type"] == "MANUAL_COOKING"
    assert step["temperature"] == 100
    assert step["duration_seconds"] == 300
    assert step["speed"] == 5
    assert step["direction"] == "LEFT"
    assert step["turbo"] is False


@pytest.mark.django_db
def test_create_recipe_with_free_text_machine_step(auth_client):
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [{"step_number": 1, "instruction": "Add to machine"}],
    }
    resp = client.post("/api/v1/recipes/", json.dumps(payload), content_type="application/json")
    assert resp.status_code == 201
    step = resp.json()["machine_steps"][0]
    assert step["program_type"] is None
    assert step["instruction"] == "Add to machine"


@pytest.mark.django_db
def test_create_recipe_program_step_missing_required_param(auth_client):
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [
            {
                "step_number": 1,
                "instruction": "",
                "program_type": "MANUAL_COOKING",
                "temperature": 100,
            }
        ],
    }
    resp = client.post("/api/v1/recipes/", json.dumps(payload), content_type="application/json")
    assert resp.status_code == 422


@pytest.mark.django_db
def test_create_recipe_program_step_out_of_range(auth_client):
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [
            {
                "step_number": 1,
                "instruction": "",
                "program_type": "MANUAL_COOKING",
                "temperature": 200,
                "duration_seconds": 300,
                "speed": 5,
                "direction": "LEFT",
            }
        ],
    }
    resp = client.post("/api/v1/recipes/", json.dumps(payload), content_type="application/json")
    assert resp.status_code == 422


@pytest.mark.django_db
def test_reject_program_type_on_manual_step(auth_client):
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "manual_steps": [
            {
                "step_number": 1,
                "instruction": "",
                "program_type": "CHOPPING",
                "duration_seconds": 30,
                "speed": 8,
            }
        ],
    }
    resp = client.post("/api/v1/recipes/", json.dumps(payload), content_type="application/json")
    assert resp.status_code == 422


@pytest.mark.django_db
def test_reject_free_text_step_empty_instruction(auth_client):
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [{"step_number": 1, "instruction": ""}],
    }
    resp = client.post("/api/v1/recipes/", json.dumps(payload), content_type="application/json")
    assert resp.status_code == 422


@pytest.mark.django_db
def test_weighing_program_step(auth_client):
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [
            {
                "step_number": 1,
                "instruction": "",
                "program_type": "WEIGHING",
                "weight_grams": 200,
            }
        ],
    }
    resp = client.post("/api/v1/recipes/", json.dumps(payload), content_type="application/json")
    assert resp.status_code == 201
    step = resp.json()["machine_steps"][0]
    assert step["program_type"] == "WEIGHING"
    assert step["weight_grams"] == 200


@pytest.mark.django_db
def test_recipe_detail_returns_program_fields(auth_client):
    client, household = auth_client
    recipe = Recipe.objects.create(
        household=household, title="Soup", list_type="KNOWN", default_servings=2
    )
    CookingStep.objects.create(
        recipe=recipe,
        method="MACHINE",
        step_number=1,
        instruction="",
        program_type="STEAMING",
        temperature=100,
        duration_seconds=600,
    )
    resp = client.get(f"/api/v1/recipes/{recipe.id}/")
    assert resp.status_code == 200
    step = resp.json()["machine_steps"][0]
    assert step["program_type"] == "STEAMING"
    assert step["temperature"] == 100
    assert step["duration_seconds"] == 600
    assert step["speed"] is None
    assert step["direction"] is None
    assert step["turbo"] is False
    assert step["weight_grams"] is None


@pytest.mark.django_db
def test_update_recipe_replaces_program_steps(auth_client):
    client, household = auth_client
    recipe = Recipe.objects.create(
        household=household, title="Soup", list_type="KNOWN", default_servings=2
    )
    CookingStep.objects.create(
        recipe=recipe, method="MACHINE", step_number=1, instruction="Old step"
    )
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [
            {
                "step_number": 1,
                "instruction": "",
                "program_type": "CHOPPING",
                "duration_seconds": 30,
                "speed": 8,
            }
        ],
    }
    resp = client.put(
        f"/api/v1/recipes/{recipe.id}/",
        json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 200
    step = resp.json()["machine_steps"][0]
    assert step["program_type"] == "CHOPPING"
    assert step["instruction"] == ""
