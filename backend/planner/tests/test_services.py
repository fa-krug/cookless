from datetime import date, timedelta

import pytest

from planner.services import generate_next_iteration, renew_iteration, setup_meal_plan
from recipes.models import Ingredient, Recipe, RecipeIngredient, Unit
from users.models import Household, HouseholdMember, User


@pytest.fixture
def auth_client(client):
    user = User.objects.create_user(email="test@test.com", password="test")
    household = Household.objects.create(name="Test")
    HouseholdMember.objects.create(user=user, household=household, role="OWNER")
    user.active_household = household
    user.save()
    client.force_login(user)
    return client, household


def _create_recipes(household, count=10):
    ingredient = Ingredient.objects.create(name_en="Tomato", name_de="Tomate", category="PRODUCE")
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")
    recipes = []
    for i in range(count):
        lt = "KNOWN" if i < count * 0.7 else "TO_TRY"
        recipe = Recipe.objects.create(
            household=household,
            title=f"Recipe {i}",
            list_type=lt,
            default_servings=2,
        )
        RecipeIngredient.objects.create(
            recipe=recipe, ingredient=ingredient, quantity=100, unit=unit, order=1
        )
        recipes.append(recipe)
    return recipes


@pytest.mark.django_db
class TestSetupMealPlan:
    def test_creates_plan_and_first_iteration(self, auth_client):
        _, household = auth_client
        _create_recipes(household)
        plan = setup_meal_plan(
            household=household,
            iteration_weeks=1,
            shopping_days=[5],
            servings=2,
            known_ratio=0.7,
            default_leftover_days=1,
            start_date=date(2026, 2, 28),
        )
        assert plan.iteration_weeks == 1
        assert plan.shopping_days == [5]
        iterations = list(plan.iterations.all())
        assert len(iterations) == 1
        assert iterations[0].status == "ACTIVE"
        assert iterations[0].entries.count() > 0

    def test_setup_replaces_existing_config(self, auth_client):
        _, household = auth_client
        _create_recipes(household)
        plan1 = setup_meal_plan(
            household=household,
            iteration_weeks=1,
            shopping_days=[5],
            servings=2,
            known_ratio=0.7,
            default_leftover_days=1,
            start_date=date(2026, 2, 28),
        )
        plan2 = setup_meal_plan(
            household=household,
            iteration_weeks=2,
            shopping_days=[2, 5],
            servings=4,
            known_ratio=0.5,
            default_leftover_days=0,
            start_date=date(2026, 3, 4),
        )
        assert plan1.id == plan2.id
        assert plan2.iteration_weeks == 2

    def test_iteration_dates_snap_to_shopping_day(self, auth_client):
        _, household = auth_client
        _create_recipes(household)
        plan = setup_meal_plan(
            household=household,
            iteration_weeks=1,
            shopping_days=[5],
            servings=2,
            known_ratio=0.7,
            default_leftover_days=1,
            start_date=date(2026, 2, 25),
        )
        iteration = plan.iterations.first()
        assert iteration is not None
        # 2026-02-25 is Wednesday (weekday=2), shopping_day=5 (Saturday)
        # snaps forward to Saturday 2026-02-28
        assert iteration.start_date == date(2026, 2, 28)


@pytest.mark.django_db
class TestGenerateNextIteration:
    def test_generates_next_after_current(self, auth_client):
        _, household = auth_client
        _create_recipes(household)
        plan = setup_meal_plan(
            household=household,
            iteration_weeks=1,
            shopping_days=[5],
            servings=2,
            known_ratio=0.7,
            default_leftover_days=1,
            start_date=date(2026, 2, 28),
        )
        prev = plan.iterations.first()
        assert prev is not None
        new_iter = generate_next_iteration(plan)
        assert new_iter.start_date == prev.end_date + timedelta(days=1)
        assert new_iter.status == "ACTIVE"
        prev.refresh_from_db()
        assert prev.status == "ARCHIVED"

    def test_avoids_previous_iteration_recipes(self, auth_client):
        _, household = auth_client
        _create_recipes(household, count=20)
        plan = setup_meal_plan(
            household=household,
            iteration_weeks=1,
            shopping_days=[5],
            servings=2,
            known_ratio=0.7,
            default_leftover_days=0,
            start_date=date(2026, 2, 28),
        )
        first_iter = plan.iterations.first()
        assert first_iter is not None
        prev_recipes = set(
            first_iter.entries.filter(is_leftover=False).values_list("recipe_id", flat=True)
        )
        new_iter = generate_next_iteration(plan)
        new_recipes = set(
            new_iter.entries.filter(is_leftover=False).values_list("recipe_id", flat=True)
        )
        assert len(prev_recipes & new_recipes) == 0


@pytest.mark.django_db
class TestRenewIteration:
    def test_renew_regenerates_entries(self, auth_client):
        _, household = auth_client
        _create_recipes(household)
        plan = setup_meal_plan(
            household=household,
            iteration_weeks=1,
            shopping_days=[5],
            servings=2,
            known_ratio=0.7,
            default_leftover_days=1,
            start_date=date(2026, 2, 28),
        )
        iteration = plan.iterations.first()
        assert iteration is not None
        old_entry_ids = set(iteration.entries.values_list("id", flat=True))
        renew_iteration(iteration)
        new_entry_ids = set(iteration.entries.values_list("id", flat=True))
        assert old_entry_ids != new_entry_ids
        assert iteration.entries.count() > 0
