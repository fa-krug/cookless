from collections import defaultdict
from decimal import Decimal

from planner.iteration_utils import compute_shopping_segments
from planner.models import MealPlan, PlanIteration
from shopping.models import ShoppingList, ShoppingListItem


def generate_shopping_lists_for_iteration(
    iteration: PlanIteration,
    shopping_days: list[int],
) -> list[ShoppingList]:
    """Generate shopping lists for each shopping segment in an iteration.

    Deletes any existing shopping lists for this iteration, then creates one
    ShoppingList per segment. Each list aggregates ingredients from non-leftover
    entries in its segment, scaled by servings and converted to base units.
    """
    # Delete any existing shopping lists for this iteration
    iteration.shopping_lists.all().delete()

    segments = compute_shopping_segments(iteration.start_date, iteration.end_date, shopping_days)

    created_lists: list[ShoppingList] = []

    for seg_start, shopping_date, seg_end in segments:
        entries = (
            iteration.entries.filter(
                date__gte=seg_start,
                date__lte=seg_end,
                is_leftover=False,
            )
            .select_related("recipe")
            .prefetch_related("recipe__ingredients__ingredient", "recipe__ingredients__unit")
        )

        # Aggregate: (ingredient_id, base_unit_id) -> total quantity in base units
        aggregated: dict[tuple[int, int], Decimal] = defaultdict(Decimal)

        for entry in entries:
            scale = Decimal(str(entry.servings)) / Decimal(str(entry.recipe.default_servings))
            for ri in entry.recipe.ingredients.all():
                scaled_quantity = Decimal(str(ri.quantity)) * scale
                base_quantity = ri.unit.to_base(scaled_quantity)
                base_unit = ri.unit.base_unit if ri.unit.base_unit else ri.unit
                key = (ri.ingredient_id, base_unit.pk)
                aggregated[key] += base_quantity

        shopping_list = ShoppingList.objects.create(
            iteration=iteration,
            shopping_date=shopping_date,
        )

        items = [
            ShoppingListItem(
                shopping_list=shopping_list,
                ingredient_id=ingredient_id,
                quantity=quantity.quantize(Decimal("0.01")),
                unit_id=unit_id,
            )
            for (ingredient_id, unit_id), quantity in aggregated.items()
        ]
        ShoppingListItem.objects.bulk_create(items)

        created_lists.append(shopping_list)

    return created_lists


def generate_shopping_list(meal_plan: MealPlan) -> ShoppingList:
    """Legacy wrapper: generate shopping lists for the active iteration.

    Returns the first shopping list from the active iteration.

    Raises:
        ValueError: If no active iteration exists.
    """
    iteration = meal_plan.iterations.filter(status="ACTIVE").first()
    if not iteration:
        raise ValueError("No active iteration found for this meal plan")

    lists = generate_shopping_lists_for_iteration(iteration, meal_plan.shopping_days)
    return lists[0]
