import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import Recipe, Tag, TagCategory
from recipes.tag_defaults import seed_default_tags
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.mark.django_db
def test_seed_default_tags_creates_tags():
    household = Household.objects.create(name="Test")
    seed_default_tags(household)
    tags = Tag.objects.filter(household=household)
    assert tags.count() == 37
    assert tags.filter(category=TagCategory.DIETARY).count() == 10
    assert tags.filter(category=TagCategory.PROTEIN).count() == 9
    assert tags.filter(category=TagCategory.CUISINE).count() == 10
    assert tags.filter(category=TagCategory.MEAL_TYPE).count() == 8
    assert all(t.is_default for t in tags)


@pytest.mark.django_db
def test_seed_default_tags_is_idempotent():
    household = Household.objects.create(name="Test")
    seed_default_tags(household)
    seed_default_tags(household)
    assert Tag.objects.filter(household=household).count() == 37


@pytest.fixture
def auth_client_no_household():
    user = User.objects.create_user(email="test@example.com")
    user.onboarding_step = "CREATE_HOUSEHOLD"
    user.save()
    client = Client()
    client.force_login(user)
    return client, user


@pytest.mark.django_db
def test_create_household_seeds_default_tags(auth_client_no_household):
    client, user = auth_client_no_household
    response = client.post(
        "/api/v1/households/",
        json.dumps({"name": "My Home"}),
        content_type="application/json",
    )
    assert response.status_code == 201
    household_id = response.json()["id"]
    assert Tag.objects.filter(household_id=household_id).count() == 37


@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="tag@example.com")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    seed_default_tags(household)
    client = Client()
    client.force_login(user)
    return client, household


@pytest.mark.django_db
def test_list_tags_grouped_by_category(auth_client):
    client, household = auth_client
    response = client.get("/api/v1/tags/")
    assert response.status_code == 200
    data = response.json()
    assert "DIETARY" in data
    assert "PROTEIN" in data
    assert "CUISINE" in data
    assert "MEAL_TYPE" in data
    assert len(data["DIETARY"]) == 10


@pytest.mark.django_db
def test_create_custom_tag(auth_client):
    client, household = auth_client
    response = client.post(
        "/api/v1/tags/",
        json.dumps(
            {
                "category": "CUISINE",
                "name_en": "Korean",
                "name_de": "Koreanisch",
            }
        ),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name_en"] == "Korean"
    assert data["is_default"] is False


@pytest.mark.django_db
def test_update_tag(auth_client):
    client, household = auth_client
    tag = Tag.objects.filter(household=household, name_en="Vegan").first()
    assert tag is not None
    response = client.put(
        f"/api/v1/tags/{tag.id}/",
        json.dumps({"name_en": "Strict Vegan", "name_de": "Streng Vegan"}),
        content_type="application/json",
    )
    assert response.status_code == 200
    assert response.json()["name_en"] == "Strict Vegan"


@pytest.mark.django_db
def test_delete_tag(auth_client):
    client, household = auth_client
    tag = Tag.objects.filter(household=household, name_en="Paleo").first()
    assert tag is not None
    response = client.delete(f"/api/v1/tags/{tag.id}/")
    assert response.status_code == 204
    assert not Tag.objects.filter(id=tag.id).exists()


@pytest.mark.django_db
def test_delete_tag_removes_from_recipes(auth_client):
    client, household = auth_client
    tag = Tag.objects.filter(household=household, name_en="Vegan").first()
    assert tag is not None
    recipe = Recipe.objects.create(
        household=household, title="Salad", list_type="KNOWN", default_servings=2
    )
    recipe.tags.add(tag)
    response = client.delete(f"/api/v1/tags/{tag.id}/")
    assert response.status_code == 204
    assert recipe.tags.count() == 0


@pytest.mark.django_db
def test_cannot_access_other_household_tags(auth_client):
    client, household = auth_client
    other_household = Household.objects.create(name="Other")
    seed_default_tags(other_household)
    other_tag = Tag.objects.filter(household=other_household).first()
    assert other_tag is not None
    response = client.delete(f"/api/v1/tags/{other_tag.id}/")
    assert response.status_code == 404


@pytest.mark.django_db
def test_create_recipe_with_tags(auth_client):
    client, household = auth_client
    tag = Tag.objects.filter(household=household, name_en="Vegan").first()
    assert tag is not None
    response = client.post(
        "/api/v1/recipes/",
        json.dumps(
            {
                "title": "Green Bowl",
                "list_type": "KNOWN",
                "default_servings": 2,
                "ingredients": [],
                "manual_steps": [],
                "machine_steps": [],
                "tag_ids": [str(tag.id)],
            }
        ),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert len(data["tags"]) == 1
    assert data["tags"][0]["name_en"] == "Vegan"


@pytest.mark.django_db
def test_update_recipe_tags(auth_client):
    client, household = auth_client
    vegan = Tag.objects.filter(household=household, name_en="Vegan").first()
    assert vegan is not None
    italian = Tag.objects.filter(household=household, name_en="Italian").first()
    assert italian is not None
    recipe = Recipe.objects.create(
        household=household, title="Pasta", list_type="KNOWN", default_servings=2
    )
    recipe.tags.add(vegan)

    response = client.put(
        f"/api/v1/recipes/{recipe.id}/",
        json.dumps(
            {
                "title": "Pasta",
                "list_type": "KNOWN",
                "default_servings": 2,
                "ingredients": [],
                "manual_steps": [],
                "machine_steps": [],
                "tag_ids": [str(italian.id)],
            }
        ),
        content_type="application/json",
    )
    assert response.status_code == 200
    tag_names = [t["name_en"] for t in response.json()["tags"]]
    assert "Italian" in tag_names
    assert "Vegan" not in tag_names


@pytest.mark.django_db
def test_list_recipes_includes_tags(auth_client):
    client, household = auth_client
    tag = Tag.objects.filter(household=household, name_en="Simple").first()
    assert tag is not None
    recipe = Recipe.objects.create(
        household=household, title="Toast", list_type="KNOWN", default_servings=1
    )
    recipe.tags.add(tag)

    response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert len(items[0]["tags"]) == 1
    assert items[0]["tags"][0]["name_en"] == "Simple"


@pytest.mark.django_db
def test_filter_recipes_by_tags(auth_client):
    client, household = auth_client
    vegan = Tag.objects.filter(household=household, name_en="Vegan").first()
    assert vegan is not None
    pork = Tag.objects.filter(household=household, name_en="Pork").first()
    assert pork is not None

    r1 = Recipe.objects.create(
        household=household, title="Salad", list_type="KNOWN", default_servings=2
    )
    r1.tags.add(vegan)
    r2 = Recipe.objects.create(
        household=household, title="Schnitzel", list_type="KNOWN", default_servings=2
    )
    r2.tags.add(pork)

    response = client.get(f"/api/v1/recipes/?tags={vegan.id}")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "Salad"


@pytest.mark.django_db
def test_reset_tags_deletes_all_and_reseeds(auth_client):
    client, household = auth_client
    # Add a custom tag
    Tag.objects.create(
        household=household,
        category=TagCategory.CUISINE,
        name_en="Korean",
        name_de="Koreanisch",
        is_default=False,
    )
    # Delete a default tag
    Tag.objects.filter(household=household, name_en="Paleo").delete()
    # Rename a default tag
    tag = Tag.objects.filter(household=household, name_en="Vegan").first()
    assert tag is not None
    tag.name_en = "Strict Vegan"
    tag.save()

    response = client.post("/api/v1/tags/reset/")
    assert response.status_code == 200
    data = response.json()

    # All defaults restored, custom tag gone
    tags = Tag.objects.filter(household=household)
    assert tags.count() == 37
    assert all(t.is_default for t in tags)
    assert not tags.filter(name_en="Korean").exists()
    assert tags.filter(name_en="Vegan").exists()
    assert not tags.filter(name_en="Strict Vegan").exists()

    # Response is grouped tags
    assert "DIETARY" in data
    assert len(data["DIETARY"]) == 10


@pytest.mark.django_db
def test_reset_tags_clears_recipe_associations(auth_client):
    client, household = auth_client
    tag = Tag.objects.filter(household=household, name_en="Vegan").first()
    assert tag is not None
    recipe = Recipe.objects.create(
        household=household, title="Salad", list_type="KNOWN", default_servings=2
    )
    recipe.tags.add(tag)

    response = client.post("/api/v1/tags/reset/")
    assert response.status_code == 200
    recipe.refresh_from_db()
    assert recipe.tags.count() == 0
