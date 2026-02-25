from datetime import date, timedelta
from decimal import Decimal

import pytest

from planner.models import MealPlan, MealPlanEntry, PlanIteration
from recipes.models import Ingredient, Recipe, RecipeIngredient, Unit
from shopping.models import ShoppingList
from shopping.services import generate_shopping_lists_for_iteration


@pytest.fixture
def auth_client(client):
    from users.models import Household, HouseholdMember, User

    user = User.objects.create_user(email="test@test.com", password="test")
    household = Household.objects.create(name="Test")
    HouseholdMember.objects.create(user=user, household=household, role="OWNER")
    user.active_household = household
    user.save()
    client.force_login(user)
    return client, household


@pytest.fixture
def setup_iteration(auth_client):
    _, household = auth_client
    ingredient = Ingredient.objects.create(name_en="Tomato", name_de="Tomate", category="PRODUCE")
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")
    recipe = Recipe.objects.create(
        household=household, title="Test Recipe", list_type="KNOWN", default_servings=2
    )
    RecipeIngredient.objects.create(
        recipe=recipe, ingredient=ingredient, quantity=100, unit=unit, order=1
    )

    plan = MealPlan.objects.create(
        household=household,
        iteration_weeks=1,
        shopping_days=[5],
        servings=2,
        known_ratio=0.7,
        default_leftover_days=1,
    )
    iteration = PlanIteration.objects.create(
        meal_plan=plan,
        start_date=date(2026, 2, 28),
        end_date=date(2026, 3, 6),
        status="ACTIVE",
    )
    for i in range(7):
        MealPlanEntry.objects.create(
            iteration=iteration,
            date=date(2026, 2, 28) + timedelta(days=i),
            meal_type="LUNCH",
            recipe=recipe,
            servings=2,
            is_leftover=(i % 2 == 1),
        )
    return iteration, plan, ingredient, unit


@pytest.mark.django_db
class TestGenerateShoppingListsForIteration:
    def test_creates_one_list_per_segment(self, setup_iteration):
        iteration, plan, _, _ = setup_iteration
        lists = generate_shopping_lists_for_iteration(iteration, plan.shopping_days)
        assert len(lists) == 1  # 1-week, 1 shopping day = 1 list

    def test_shopping_date_set(self, setup_iteration):
        iteration, plan, _, _ = setup_iteration
        lists = generate_shopping_lists_for_iteration(iteration, plan.shopping_days)
        assert lists[0].shopping_date == date(2026, 2, 28)

    def test_only_non_leftover_entries_aggregated(self, setup_iteration):
        iteration, plan, _, _ = setup_iteration
        lists = generate_shopping_lists_for_iteration(iteration, plan.shopping_days)
        # All non-leftover entries use the same ingredient, so should aggregate to 1 item
        assert lists[0].items.count() == 1

    def test_quantity_scaled_correctly(self, setup_iteration):
        iteration, plan, _, _ = setup_iteration
        lists = generate_shopping_lists_for_iteration(iteration, plan.shopping_days)
        item = lists[0].items.first()
        assert item is not None
        # 4 non-leftover entries (days 0, 2, 4, 6), each 100g at scale 2/2=1.0
        assert item.quantity == Decimal("400")

    def test_two_shopping_days_creates_two_lists(self, auth_client):
        _, household = auth_client
        ingredient = Ingredient.objects.create(
            name_en="Onion", name_de="Zwiebel", category="PRODUCE"
        )
        unit = Unit.objects.create(name_en="piece", name_de="Stück", abbreviation="pc")
        recipe = Recipe.objects.create(
            household=household, title="R1", list_type="KNOWN", default_servings=2
        )
        RecipeIngredient.objects.create(
            recipe=recipe, ingredient=ingredient, quantity=1, unit=unit, order=1
        )

        plan = MealPlan.objects.create(
            household=household,
            iteration_weeks=2,
            shopping_days=[2, 5],
            servings=2,
            known_ratio=0.7,
            default_leftover_days=0,
        )
        # Wed Mar 4 – Tue Mar 17, 2 weeks
        iteration = PlanIteration.objects.create(
            meal_plan=plan,
            start_date=date(2026, 3, 4),
            end_date=date(2026, 3, 17),
            status="ACTIVE",
        )
        for i in range(14):
            MealPlanEntry.objects.create(
                iteration=iteration,
                date=date(2026, 3, 4) + timedelta(days=i),
                meal_type="LUNCH",
                recipe=recipe,
                servings=2,
                is_leftover=False,
            )
        lists = generate_shopping_lists_for_iteration(iteration, plan.shopping_days)
        assert len(lists) == 4  # Wed+Sat for 2 weeks = 4 segments

    def test_replaces_existing_lists(self, setup_iteration):
        iteration, plan, _, _ = setup_iteration
        generate_shopping_lists_for_iteration(iteration, plan.shopping_days)
        generate_shopping_lists_for_iteration(iteration, plan.shopping_days)
        assert ShoppingList.objects.filter(iteration=iteration).count() == 1
