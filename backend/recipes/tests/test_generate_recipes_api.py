import json
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import Tag, Unit
from users.models import Household, HouseholdMember

User = get_user_model()

MOCK_GEMINI_RECIPES = [
    {
        "title": "Test Soup",
        "default_servings": 4,
        "prep_time_minutes": 15,
        "cook_time_minutes": 30,
        "leftover_days": 2,
        "ingredients": [
            {
                "name_en": "onion",
                "name_de": "Zwiebel",
                "category": "PRODUCE",
                "quantity": "2",
                "unit_abbreviation": "pcs",
                "order": 0,
            }
        ],
        "manual_steps": [{"step_number": 1, "instruction": "Chop the onion"}],
        "machine_steps": [],
        "tag_names_en": ["Italian"],
    }
]


@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="test@example.com")
    household = Household.objects.create(name="Home", ai_enabled=True, gemini_api_key="test-key")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = Client()
    client.force_login(user)
    return client, household


def _make_gemini_response(recipes):
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(recipes)}]}}]}


def _mock_urlopen(gemini_resp):
    """Create a mock for urllib.request.urlopen that returns the given response."""
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(gemini_resp).encode()
    mock_resp.__enter__ = MagicMock(return_value=mock_resp)
    mock_resp.__exit__ = MagicMock(return_value=False)
    return mock_resp


@pytest.mark.django_db
def test_generate_recipes_success(auth_client):
    client, household = auth_client

    # Create a tag and unit so resolution works
    tag = Tag.objects.create(
        household=household, category="CUISINE", name_en="Italian", name_de="Italienisch"
    )
    Unit.objects.create(name_en="pieces", name_de="Stück", abbreviation="pcs")

    gemini_resp = _make_gemini_response(MOCK_GEMINI_RECIPES)
    mock_resp = _mock_urlopen(gemini_resp)

    with patch("recipes.generation.urllib.request.urlopen", return_value=mock_resp):
        response = client.post(
            "/api/v1/recipes/generate/",
            json.dumps({"count": 1, "generate_images": False}),
            content_type="application/json",
        )

        assert response.status_code == 200
        assert response["Content-Type"] == "application/x-ndjson"
        assert response["X-Accel-Buffering"] == "no"
        assert response["Cache-Control"] == "no-cache"

        # Parse NDJSON lines (must consume inside patch context since generator is lazy)
        lines = [json.loads(line) for line in response.streaming_content]

    # Should have a recipe event and a done event
    assert len(lines) == 2
    assert lines[0]["type"] == "recipe"
    assert lines[0]["index"] == 0
    assert lines[0]["data"]["title"] == "Test Soup"
    assert str(tag.id) in lines[0]["data"]["resolved_tag_ids"]

    # Check unit resolution
    assert lines[0]["data"]["ingredients"][0]["unit_id"] is not None

    assert lines[1]["type"] == "done"


@pytest.mark.django_db
def test_generate_recipes_ai_disabled(auth_client):
    client, household = auth_client
    household.ai_enabled = False
    household.save()

    response = client.post(
        "/api/v1/recipes/generate/",
        json.dumps({"count": 1, "generate_images": False}),
        content_type="application/json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_generate_recipes_no_api_key(auth_client):
    client, household = auth_client
    household.gemini_api_key = ""
    household.save()

    response = client.post(
        "/api/v1/recipes/generate/",
        json.dumps({"count": 1, "generate_images": False}),
        content_type="application/json",
    )

    assert response.status_code == 400
