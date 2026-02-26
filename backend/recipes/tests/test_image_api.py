from io import BytesIO

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
