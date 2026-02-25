from collections import defaultdict
from decimal import Decimal

from planner.models import MealPlan
from shopping.models import ShoppingList, ShoppingListItem


def generate_shopping_list(meal_plan: MealPlan) -> ShoppingList:
    """Generate a shopping list from a meal plan.

    Aggregates ingredients across all non-leftover entries, scales quantities
    by servings, and converts to base units before summing.

    If a shopping list already exists for the meal plan, it is replaced.
    """
    # Delete any existing shopping lists for this plan
    meal_plan.shopping_lists.all().delete()

    # Aggregate: (ingredient_id, base_unit_id) -> total quantity in base units
    aggregated: dict[tuple[int, int], Decimal] = defaultdict(Decimal)

    entries = (
        meal_plan.entries.filter(is_leftover=False)
        .select_related("recipe")
        .prefetch_related("recipe__ingredients__ingredient", "recipe__ingredients__unit")
    )

    for entry in entries:
        scale = Decimal(str(entry.servings)) / Decimal(str(entry.recipe.default_servings))
        recipe_ingredients = entry.recipe.ingredients.select_related("ingredient", "unit")

        for ri in recipe_ingredients:
            scaled_quantity = Decimal(str(ri.quantity)) * scale
            base_quantity = ri.unit.to_base(scaled_quantity)
            base_unit = ri.unit.base_unit if ri.unit.base_unit else ri.unit
            key = (ri.ingredient_id, base_unit.pk)
            aggregated[key] += base_quantity

    # Create the shopping list and items
    shopping_list = ShoppingList.objects.create(meal_plan=meal_plan)

    items = []
    for (ingredient_id, unit_id), quantity in aggregated.items():
        items.append(
            ShoppingListItem(
                shopping_list=shopping_list,
                ingredient_id=ingredient_id,
                quantity=quantity.quantize(Decimal("0.01")),
                unit_id=unit_id,
            )
        )

    ShoppingListItem.objects.bulk_create(items)

    return shopping_list


def generate_shopping_lists_for_iteration(iteration, shopping_days):
    """Stub — will be implemented in Task 6."""
    pass
