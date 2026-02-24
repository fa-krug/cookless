from uuid import UUID

from django.shortcuts import get_object_or_404

from ninja import Router

from planner.models import MealPlan
from shopping.models import ShoppingList, ShoppingListItem
from shopping.schemas import (
    BulkToggleIn,
    GenerateShoppingListIn,
    ShoppingListItemOut,
    ShoppingListOut,
)
from shopping.services import generate_shopping_list
from users.permissions import require_household_member

router = Router()


@router.post("/shopping-lists/generate/", response={201: ShoppingListOut}, tags=["shopping-lists"])
def generate_list(request, payload: GenerateShoppingListIn):
    require_household_member(request)
    meal_plan = get_object_or_404(
        MealPlan, pk=payload.meal_plan, household=request.user.active_household
    )
    shopping_list = generate_shopping_list(meal_plan)
    return ShoppingList.objects.prefetch_related("items__ingredient", "items__unit").get(
        pk=shopping_list.pk
    )


@router.get("/shopping-lists/", response=list[ShoppingListOut], tags=["shopping-lists"])
def list_shopping_lists(request):
    require_household_member(request)
    return (
        ShoppingList.objects.filter(meal_plan__household=request.user.active_household)
        .prefetch_related("items__ingredient", "items__unit")
        .order_by("-created_at")
    )


@router.get("/shopping-lists/{list_id}/", response=ShoppingListOut, tags=["shopping-lists"])
def get_shopping_list(request, list_id: UUID):
    require_household_member(request)
    return get_object_or_404(
        ShoppingList.objects.prefetch_related("items__ingredient", "items__unit"),
        pk=list_id,
        meal_plan__household=request.user.active_household,
    )


@router.patch(
    "/shopping-lists/items/{item_id}/toggle/",
    response=ShoppingListItemOut,
    tags=["shopping-lists"],
)
def toggle_item(request, item_id: UUID):
    require_household_member(request)
    item = get_object_or_404(
        ShoppingListItem.objects.select_related("ingredient", "unit"),
        pk=item_id,
        shopping_list__meal_plan__household=request.user.active_household,
    )
    item.is_checked = not item.is_checked
    item.save(update_fields=["is_checked"])
    return item


@router.patch(
    "/shopping-lists/items/bulk-toggle/",
    response=list[ShoppingListItemOut],
    tags=["shopping-lists"],
)
def bulk_toggle_items(request, payload: BulkToggleIn):
    require_household_member(request)
    items = ShoppingListItem.objects.filter(
        pk__in=payload.item_ids,
        shopping_list__meal_plan__household=request.user.active_household,
    ).select_related("ingredient", "unit")
    items.update(is_checked=payload.is_checked)
    # Re-fetch to return updated state
    return ShoppingListItem.objects.filter(
        pk__in=payload.item_ids,
        shopping_list__meal_plan__household=request.user.active_household,
    ).select_related("ingredient", "unit")
