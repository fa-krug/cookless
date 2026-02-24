import random
from collections import Counter
from datetime import timedelta

from planner.models import MealPlan, MealPlanEntry
from recipes.models import Recipe


def generate_meal_plan(household, start_date, days=7, servings=2, known_ratio=0.7, meals_per_day=2):
    total_meal_slots = days * meals_per_day
    # Estimate ~2 meals per cooking session (cook + leftover)
    cooking_sessions = max(total_meal_slots // 2, 1)
    known_count = round(cooking_sessions * known_ratio)
    try_count = cooking_sessions - known_count

    known_recipes = list(Recipe.objects.filter(household=household, list_type="KNOWN"))
    try_recipes = list(Recipe.objects.filter(household=household, list_type="TO_TRY"))

    # Step 1 & 2: Select recipes with ingredient overlap scoring
    best_set = _select_recipes_with_overlap(known_recipes, try_recipes, known_count, try_count)

    # Step 3 & 4: Assign to schedule with leftovers
    plan = MealPlan.objects.create(
        household=household,
        start_date=start_date,
        end_date=start_date + timedelta(days=days - 1),
    )
    _assign_schedule(plan, best_set, start_date, days, servings, meals_per_day)
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


def _assign_schedule(plan, recipes, start_date, days, servings, meals_per_day):
    meal_types = ["LUNCH", "DINNER"][:meals_per_day]
    slots = []
    for day_offset in range(days):
        for meal_type in meal_types:
            slots.append((start_date + timedelta(days=day_offset), meal_type))

    slot_index = 0
    random.shuffle(recipes)

    for recipe in recipes:
        if slot_index >= len(slots):
            break
        date, meal_type = slots[slot_index]
        cooking_entry = MealPlanEntry.objects.create(
            meal_plan=plan,
            date=date,
            meal_type=meal_type,
            recipe=recipe,
            servings=servings,
            is_leftover=False,
        )
        slot_index += 1

        # Assign leftover for next available slot
        if slot_index < len(slots):
            lo_date, lo_meal = slots[slot_index]
            MealPlanEntry.objects.create(
                meal_plan=plan,
                date=lo_date,
                meal_type=lo_meal,
                recipe=recipe,
                servings=servings,
                is_leftover=True,
                source_entry=cooking_entry,
            )
            slot_index += 1
