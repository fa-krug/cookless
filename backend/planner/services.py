from __future__ import annotations

import random
from collections import Counter
from datetime import date, timedelta

from planner.iteration_utils import compute_iteration_dates, validate_shopping_days
from planner.models import MealPlan, MealPlanEntry, PlanIteration
from recipes.models import Recipe


def setup_meal_plan(
    household,
    iteration_weeks: int,
    shopping_days: list[int],
    servings: int,
    known_ratio: float,
    default_leftover_days: int,
    excluded_tag_ids: list | None = None,
) -> MealPlan:
    """Create or update a meal plan for the household and generate the first iteration."""
    validate_shopping_days(shopping_days)

    plan, _ = MealPlan.objects.update_or_create(
        household=household,
        defaults={
            "iteration_weeks": iteration_weeks,
            "shopping_day_1": shopping_days[0],
            "shopping_day_2": shopping_days[1] if len(shopping_days) > 1 else None,
            "servings": servings,
            "known_ratio": known_ratio,
            "default_leftover_days": default_leftover_days,
        },
    )

    if excluded_tag_ids is not None:
        from recipes.models import Tag

        tags = Tag.objects.filter(id__in=excluded_tag_ids, household=household)
        plan.excluded_tags.set(tags)

    # Delete all existing iterations (cascade deletes entries)
    plan.iterations.all().delete()

    _generate_iteration(plan, date.today())
    return plan


def generate_next_iteration(plan: MealPlan) -> PlanIteration:
    """Generate the next iteration for a plan, archiving the previous one."""
    previous = plan.iterations.order_by("-start_date").first()

    if previous:
        next_start = previous.end_date + timedelta(days=1)
        previous.status = PlanIteration.Status.ARCHIVED
        previous.save(update_fields=["status"])
    else:
        next_start = date.today()

    return _generate_iteration(plan, next_start)


def renew_iteration(iteration: PlanIteration) -> PlanIteration:
    """Delete all entries and shopping lists for an iteration and re-populate it."""
    iteration.entries.all().delete()

    # Delete shopping lists associated with this iteration
    if hasattr(iteration, "shopping_lists"):
        iteration.shopping_lists.all().delete()

    plan = iteration.meal_plan
    exclude_ids = _get_previous_iteration_recipe_ids(plan, iteration)
    _populate_iteration(iteration, plan, exclude_ids)
    return iteration


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _generate_iteration(plan: MealPlan, requested_start: date) -> PlanIteration:
    """Create a new PlanIteration and populate it with entries."""
    start, end = compute_iteration_dates(requested_start, plan.shopping_days, plan.iteration_weeks)

    iteration = PlanIteration.objects.create(
        meal_plan=plan,
        start_date=start,
        end_date=end,
        status=PlanIteration.Status.ACTIVE,
    )

    exclude_ids = _get_previous_iteration_recipe_ids(plan, iteration)
    _populate_iteration(iteration, plan, exclude_ids)
    return iteration


def _populate_iteration(
    iteration: PlanIteration,
    plan: MealPlan,
    exclude_recipe_ids: set,
) -> None:
    """Select recipes, assign schedule, and generate shopping lists for an iteration."""
    days = (iteration.end_date - iteration.start_date).days + 1

    excluded_tags = list(plan.excluded_tags.all())

    recipes = _select_recipes(
        household=plan.household,
        days=days,
        known_ratio=plan.known_ratio,
        default_leftover_days=plan.default_leftover_days,
        exclude_ids=exclude_recipe_ids,
        excluded_tags=excluded_tags,
    )

    _assign_schedule_lunch_only(
        iteration=iteration,
        recipes=recipes,
        start_date=iteration.start_date,
        days=days,
        servings=plan.servings,
        default_leftover_days=plan.default_leftover_days,
    )

    from shopping.services import generate_shopping_lists_for_iteration

    generate_shopping_lists_for_iteration(iteration, plan.shopping_days)


def _get_previous_iteration_recipe_ids(plan: MealPlan, current: PlanIteration) -> set:
    """Get non-leftover recipe IDs from the previous iteration."""
    previous = (
        plan.iterations.filter(start_date__lt=current.start_date).order_by("-start_date").first()
    )
    if not previous:
        return set()
    return set(previous.entries.filter(is_leftover=False).values_list("recipe_id", flat=True))


def _select_recipes(
    household,
    days: int,
    known_ratio: float,
    default_leftover_days: int,
    exclude_ids: set,
    excluded_tags: list | None = None,
) -> list[Recipe]:
    """Select recipes with ingredient overlap optimization."""
    cooking_sessions = max(days // (1 + default_leftover_days), 1)
    known_count = round(cooking_sessions * known_ratio)
    try_count = cooking_sessions - known_count

    known_qs = Recipe.objects.filter(household=household, list_type="KNOWN").prefetch_related(
        "ingredients"
    )
    try_qs = Recipe.objects.filter(household=household, list_type="TO_TRY").prefetch_related(
        "ingredients"
    )

    if excluded_tags:
        known_qs = known_qs.exclude(tags__in=excluded_tags)
        try_qs = try_qs.exclude(tags__in=excluded_tags)

    if exclude_ids:
        known_filtered = list(known_qs.exclude(id__in=exclude_ids))
        try_filtered = list(try_qs.exclude(id__in=exclude_ids))

        # Fallback: re-include excluded recipes only for the deficient pool
        if len(known_filtered) < known_count:
            known_filtered = list(known_qs)
        if len(try_filtered) < try_count:
            try_filtered = list(try_qs)
    else:
        known_filtered = list(known_qs)
        try_filtered = list(try_qs)

    return _select_recipes_with_overlap(known_filtered, try_filtered, known_count, try_count)


def _select_recipes_with_overlap(
    known: list[Recipe],
    try_list: list[Recipe],
    known_count: int,
    try_count: int,
    candidates: int = 50,
) -> list[Recipe]:
    """Pick recipe set with best ingredient overlap from random candidates."""
    best_score = -1
    best_set: list[Recipe] | None = None
    for _ in range(candidates):
        selected_known = random.sample(known, min(known_count, len(known)))
        selected_try = random.sample(try_list, min(try_count, len(try_list)))
        selected = selected_known + selected_try
        score = _ingredient_overlap_score(selected)
        if score > best_score:
            best_score = score
            best_set = selected
    return best_set or []


def _ingredient_overlap_score(recipes: list[Recipe]) -> int:
    """Score recipes by how many ingredients they share."""
    ingredient_counts: Counter[int] = Counter()
    for recipe in recipes:
        ingredient_ids = {ri.ingredient_id for ri in recipe.ingredients.all()}
        for ing_id in ingredient_ids:
            ingredient_counts[ing_id] += 1
    return sum(count for count in ingredient_counts.values() if count > 1)


def _assign_schedule_lunch_only(
    iteration: PlanIteration,
    recipes: list[Recipe],
    start_date: date,
    days: int,
    servings: int,
    default_leftover_days: int,
) -> None:
    """Assign recipes to lunch slots. Spread leftovers non-consecutively."""
    dates = [start_date + timedelta(days=i) for i in range(days)]
    assigned: dict[date, MealPlanEntry | bool] = {}

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
            iteration=iteration,
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
                iteration=iteration,
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
            Recipe.objects.filter(household=iteration.meal_plan.household).exclude(
                id__in=[r.id for r in recipes]
            )
        )
        if not all_recipes:
            all_recipes = list(Recipe.objects.filter(household=iteration.meal_plan.household))
        random.shuffle(all_recipes)
        recipe_cycle = all_recipes * ((len(empty_dates) // max(len(all_recipes), 1)) + 1)
        for i, d in enumerate(empty_dates):
            if i < len(recipe_cycle):
                MealPlanEntry.objects.create(
                    iteration=iteration,
                    date=d,
                    meal_type="LUNCH",
                    recipe=recipe_cycle[i],
                    servings=servings,
                    is_leftover=False,
                )
