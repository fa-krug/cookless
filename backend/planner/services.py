import random
from collections import Counter
from datetime import timedelta

from planner.models import MealPlan, MealPlanEntry
from recipes.models import Recipe


def generate_meal_plan(
    household, start_date, days=7, servings=2, known_ratio=0.7, default_leftover_days=1
):
    avg_leftover = default_leftover_days
    slots_per_recipe = 1 + avg_leftover
    total_lunch_slots = days
    cooking_sessions = max(total_lunch_slots // slots_per_recipe, 1)

    known_count = round(cooking_sessions * known_ratio)
    try_count = cooking_sessions - known_count

    known_recipes = list(Recipe.objects.filter(household=household, list_type="KNOWN"))
    try_recipes = list(Recipe.objects.filter(household=household, list_type="TO_TRY"))

    best_set = _select_recipes_with_overlap(known_recipes, try_recipes, known_count, try_count)

    MealPlan.objects.filter(household=household).delete()
    plan = MealPlan.objects.create(
        household=household,
        start_date=start_date,
        end_date=start_date + timedelta(days=days - 1),
    )
    _assign_schedule_lunch_only(plan, best_set, start_date, days, servings, default_leftover_days)
    return plan


def _select_recipes_with_overlap(known, try_list, known_count, try_count, candidates=50):
    best_score = -1
    best_set = None
    for _ in range(candidates):
        selected_known = random.sample(known, min(known_count, len(known)))
        selected_try = random.sample(try_list, min(try_count, len(try_list)))
        selected = selected_known + selected_try
        score = _ingredient_overlap_score(selected)
        if score > best_score:
            best_score = score
            best_set = selected
    return best_set or []


def _ingredient_overlap_score(recipes):
    ingredient_counts: Counter[int] = Counter()
    for recipe in recipes:
        ingredient_ids = set(recipe.ingredients.values_list("ingredient_id", flat=True))
        for ing_id in ingredient_ids:
            ingredient_counts[ing_id] += 1
    return sum(count for count in ingredient_counts.values() if count > 1)


def _assign_schedule_lunch_only(plan, recipes, start_date, days, servings, default_leftover_days):
    """Assign recipes to lunch slots only. Spread leftovers non-consecutively."""
    dates = [start_date + timedelta(days=i) for i in range(days)]
    assigned = {}  # date -> entry or True

    random.shuffle(recipes)

    for recipe in recipes:
        leftover_count = (
            recipe.leftover_days if recipe.leftover_days is not None else default_leftover_days
        )

        # Find first free date for cooking
        cook_date = None
        for d in dates:
            if d not in assigned:
                cook_date = d
                break
        if cook_date is None:
            break

        cooking_entry = MealPlanEntry.objects.create(
            meal_plan=plan,
            date=cook_date,
            meal_type="LUNCH",
            recipe=recipe,
            servings=servings,
            is_leftover=False,
        )
        assigned[cook_date] = cooking_entry

        # Place leftovers: skip at least 1 day after cooking, non-consecutive
        placed_leftovers = 0
        last_placed_date = cook_date
        for d in dates:
            if placed_leftovers >= leftover_count:
                break
            if d in assigned:
                continue
            if (d - cook_date).days < 2:
                continue
            if (d - last_placed_date).days < 2:
                continue
            MealPlanEntry.objects.create(
                meal_plan=plan,
                date=d,
                meal_type="LUNCH",
                recipe=recipe,
                servings=servings,
                is_leftover=True,
                source_entry=cooking_entry,
            )
            assigned[d] = True
            last_placed_date = d
            placed_leftovers += 1

    # Fill remaining empty dates with additional recipes
    empty_dates = [d for d in dates if d not in assigned]
    if empty_dates:
        all_recipes = list(
            Recipe.objects.filter(household=plan.household).exclude(id__in=[r.id for r in recipes])
        )
        if not all_recipes:
            all_recipes = list(Recipe.objects.filter(household=plan.household))
        random.shuffle(all_recipes)
        recipe_cycle = all_recipes * ((len(empty_dates) // max(len(all_recipes), 1)) + 1)
        for i, d in enumerate(empty_dates):
            if i < len(recipe_cycle):
                MealPlanEntry.objects.create(
                    meal_plan=plan,
                    date=d,
                    meal_type="LUNCH",
                    recipe=recipe_cycle[i],
                    servings=servings,
                    is_leftover=False,
                )


def regenerate_meal_plan(plan, servings=None, known_ratio=0.7, default_leftover_days=1):
    """Regenerate a meal plan: delete all entries, recreate with lunch-only."""
    if servings is None:
        entries = plan.entries.all()
        servings = entries.order_by("-servings").first().servings if entries.exists() else 2

    days = (plan.end_date - plan.start_date).days + 1
    plan.entries.all().delete()

    known_recipes = list(Recipe.objects.filter(household=plan.household, list_type="KNOWN"))
    try_recipes = list(Recipe.objects.filter(household=plan.household, list_type="TO_TRY"))

    avg_leftover = default_leftover_days
    slots_per_recipe = 1 + avg_leftover
    cooking_sessions = max(days // slots_per_recipe, 1)
    known_count = round(cooking_sessions * known_ratio)
    try_count = cooking_sessions - known_count

    recipes = _select_recipes_with_overlap(known_recipes, try_recipes, known_count, try_count)
    _assign_schedule_lunch_only(
        plan, recipes, plan.start_date, days, servings, default_leftover_days
    )
    return plan
