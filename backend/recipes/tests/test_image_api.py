import base64
import json
from io import BytesIO
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import Client

import pytest
from PIL import Image as PILImage

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


def _create_test_image(width=200, height=200, format="JPEG"):
    img = PILImage.new("RGB", (width, height), color="red")
    buf = BytesIO()
    img.save(buf, format=format)
    buf.seek(0)
    buf.name = f"test.{format.lower()}"
    return buf


@pytest.mark.django_db
def test_upload_image(auth_client, recipe):
    client, _, _ = auth_client
    img = _create_test_image()
    response = client.post(
        f"/api/v1/recipes/{recipe.id}/image/upload/",
        {"image": img},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["image"] is not None
    assert data["image"].endswith(".webp")


@pytest.mark.django_db
def test_upload_image_replaces_old(auth_client, recipe):
    client, _, _ = auth_client
    img1 = _create_test_image()
    client.post(f"/api/v1/recipes/{recipe.id}/image/upload/", {"image": img1})
    img2 = _create_test_image()
    response = client.post(
        f"/api/v1/recipes/{recipe.id}/image/upload/",
        {"image": img2},
    )
    assert response.status_code == 200
    recipe.refresh_from_db()
    assert recipe.image


@pytest.mark.django_db
def test_upload_rejects_large_file(auth_client, recipe):
    client, _, _ = auth_client
    img = _create_test_image(width=4000, height=4000, format="PNG")
    data = img.read()
    padded = data + b"\x00" * (5 * 1024 * 1024 - len(data) + 1)
    buf = BytesIO(padded)
    buf.name = "big.png"
    response = client.post(
        f"/api/v1/recipes/{recipe.id}/image/upload/",
        {"image": buf},
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_upload_rejects_invalid_type(auth_client, recipe):
    client, _, _ = auth_client
    buf = BytesIO(b"not an image")
    buf.name = "test.txt"
    response = client.post(
        f"/api/v1/recipes/{recipe.id}/image/upload/",
        {"image": buf},
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_delete_image(auth_client, recipe):
    client, _, _ = auth_client
    img = _create_test_image()
    client.post(f"/api/v1/recipes/{recipe.id}/image/upload/", {"image": img})
    recipe.refresh_from_db()
    assert recipe.image

    response = client.delete(f"/api/v1/recipes/{recipe.id}/image/")
    assert response.status_code == 200
    data = response.json()
    assert data["image"] is None

    recipe.refresh_from_db()
    assert not recipe.image


@pytest.mark.django_db
def test_delete_image_when_none(auth_client, recipe):
    client, _, _ = auth_client
    response = client.delete(f"/api/v1/recipes/{recipe.id}/image/")
    assert response.status_code == 200
    data = response.json()
    assert data["image"] is None


def _mock_gemini_response():
    """Create a fake Gemini imagen response with a small image."""
    img = PILImage.new("RGB", (64, 64), color="green")
    buf = BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return json.dumps({"predictions": [{"bytesBase64Encoded": b64}]}).encode()


@pytest.mark.django_db
def test_generate_image_success(auth_client, recipe):
    client, household, _ = auth_client
    household.ai_enabled = True
    household.gemini_api_key = "test-key-123"
    household.save()

    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.read.return_value = _mock_gemini_response()
    mock_response.__enter__ = MagicMock(return_value=mock_response)
    mock_response.__exit__ = MagicMock(return_value=False)

    with patch("recipes.api.urllib.request.urlopen", return_value=mock_response):
        response = client.post(f"/api/v1/recipes/{recipe.id}/image/generate/")

    assert response.status_code == 200
    data = response.json()
    assert data["image"] is not None
    assert data["image"].endswith(".webp")


@pytest.mark.django_db
def test_generate_image_ai_disabled(auth_client, recipe):
    client, household, _ = auth_client
    household.ai_enabled = False
    household.save()

    response = client.post(f"/api/v1/recipes/{recipe.id}/image/generate/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_generate_image_no_api_key(auth_client, recipe):
    client, household, _ = auth_client
    household.ai_enabled = True
    household.gemini_api_key = ""
    household.save()

    response = client.post(f"/api/v1/recipes/{recipe.id}/image/generate/")
    assert response.status_code == 400
