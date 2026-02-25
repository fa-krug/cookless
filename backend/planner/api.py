from uuid import UUID

from django.shortcuts import get_object_or_404

from ninja import Router

from planner.models import MealPlan, MealPlanEntry
from planner.schemas import GeneratePlanIn, MealPlanEntryOut, MealPlanOut, UpdateEntryIn
from planner.services import generate_meal_plan, regenerate_meal_plan
from recipes.models import Recipe
from shopping.services import generate_shopping_list
from users.permissions import require_household_member

router = Router()


@router.post("/meal-plans/generate/", response={201: MealPlanOut}, tags=["meal-plans"])
def generate_plan(request, payload: GeneratePlanIn):
    require_household_member(request)
    plan = generate_meal_plan(
        household=request.user.active_household,
        start_date=payload.start_date,
        days=payload.days,
        servings=payload.servings,
        known_ratio=payload.known_ratio,
        default_leftover_days=payload.default_leftover_days,
    )
    generate_shopping_list(plan)
    return plan


@router.get("/meal-plans/", response=list[MealPlanOut], tags=["meal-plans"])
def list_meal_plans(request):
    require_household_member(request)
    return (
        MealPlan.objects.filter(household=request.user.active_household)
        .prefetch_related("entries")
        .order_by("-start_date")
    )


@router.get("/meal-plans/{plan_id}/", response=MealPlanOut, tags=["meal-plans"])
def get_meal_plan(request, plan_id: UUID):
    require_household_member(request)
    return get_object_or_404(
        MealPlan.objects.prefetch_related("entries"),
        pk=plan_id,
        household=request.user.active_household,
    )


@router.put("/meal-plans/entries/{entry_id}/", response=MealPlanEntryOut, tags=["meal-plans"])
def update_entry(request, entry_id: UUID, payload: UpdateEntryIn):
    require_household_member(request)
    entry = get_object_or_404(
        MealPlanEntry,
        pk=entry_id,
        meal_plan__household=request.user.active_household,
    )
    recipe = get_object_or_404(Recipe, pk=payload.recipe, household=request.user.active_household)
    entry.recipe = recipe
    if payload.servings is not None:
        entry.servings = payload.servings
    if payload.is_locked is not None:
        entry.is_locked = payload.is_locked
    entry.save()
    return entry


@router.post("/meal-plans/{plan_id}/regenerate/", response=MealPlanOut, tags=["meal-plans"])
def regenerate_plan(request, plan_id: UUID):
    require_household_member(request)
    plan = get_object_or_404(MealPlan, pk=plan_id, household=request.user.active_household)
    return regenerate_meal_plan(plan)
