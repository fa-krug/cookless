import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from planner.services import _select_recipes
from recipes.models import Recipe, Tag
from recipes.tag_defaults import seed_default_tags
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def household_with_recipes():
    user = User.objects.create_user(email="plan@example.com")
    household = Household.objects.create(name="Plan Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    seed_default_tags(household)

    pork_tag = Tag.objects.get(household=household, name_en="Pork")
    vegan_tag = Tag.objects.get(household=household, name_en="Vegan")

    r1 = Recipe.objects.create(
        household=household, title="Pork Chops", list_type="KNOWN", default_servings=2
    )
    r1.tags.add(pork_tag)

    r2 = Recipe.objects.create(
        household=household, title="Vegan Bowl", list_type="KNOWN", default_servings=2
    )
    r2.tags.add(vegan_tag)

    r3 = Recipe.objects.create(
        household=household, title="Plain Rice", list_type="KNOWN", default_servings=2
    )

    client = Client()
    client.force_login(user)
    return client, household, pork_tag, vegan_tag, r1, r2, r3


@pytest.mark.django_db
def test_excluded_tags_filter_recipes(household_with_recipes):
    client, household, pork_tag, vegan_tag, r1, r2, r3 = household_with_recipes
    recipes = _select_recipes(
        household=household,
        days=3,
        known_ratio=1.0,
        default_leftover_days=0,
        exclude_ids=set(),
        excluded_tags=[pork_tag],
    )
    recipe_titles = {r.title for r in recipes}
    assert "Pork Chops" not in recipe_titles


@pytest.mark.django_db
def test_setup_plan_with_excluded_tags(household_with_recipes):
    client, household, pork_tag, vegan_tag, r1, r2, r3 = household_with_recipes
    response = client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps(
            {
                "iteration_weeks": 1,
                "shopping_days": [0],
                "servings": 2,
                "known_ratio": 1.0,
                "default_leftover_days": 0,
                "excluded_tag_ids": [str(pork_tag.id)],
            }
        ),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert str(pork_tag.id) in data["excluded_tag_ids"]


@pytest.mark.django_db
def test_meal_plan_out_includes_excluded_tag_ids(household_with_recipes):
    client, household, pork_tag, vegan_tag, r1, r2, r3 = household_with_recipes
    client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps(
            {
                "iteration_weeks": 1,
                "shopping_days": [0],
                "servings": 2,
                "known_ratio": 1.0,
                "default_leftover_days": 0,
                "excluded_tag_ids": [str(pork_tag.id)],
            }
        ),
        content_type="application/json",
    )
    response = client.get("/api/v1/meal-plans/")
    assert response.status_code == 200
    plan = response.json()[0]
    assert str(pork_tag.id) in plan["excluded_tag_ids"]
