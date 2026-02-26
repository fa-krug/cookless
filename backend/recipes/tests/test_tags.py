import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import Tag, TagCategory
from recipes.tag_defaults import seed_default_tags
from users.models import Household

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
