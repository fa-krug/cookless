from uuid import UUID

from django.shortcuts import get_object_or_404

from ninja import Router
from ninja.errors import HttpError

from users.permissions import require_household_member

from .models import MealPlan, PlanIteration
from .schemas import MealPlanOut, PlanIterationOut, SetupPlanIn
from .services import generate_next_iteration, renew_iteration, setup_meal_plan

router = Router(tags=["meal-plans"])


@router.post("/meal-plans/setup/", response={201: MealPlanOut})
def setup_plan(request, payload: SetupPlanIn):
    require_household_member(request)
    try:
        plan = setup_meal_plan(
            household=request.user.active_household,
            iteration_weeks=payload.iteration_weeks,
            shopping_days=payload.shopping_days,
            servings=payload.servings,
            known_ratio=payload.known_ratio,
            default_leftover_days=payload.default_leftover_days,
        )
    except ValueError as e:
        raise HttpError(422, str(e)) from None
    return 201, plan


@router.get("/meal-plans/", response=list[MealPlanOut])
def list_plans(request):
    require_household_member(request)
    return MealPlan.objects.filter(household=request.user.active_household).prefetch_related(
        "iterations__entries"
    )


@router.get("/meal-plans/{plan_id}/", response=MealPlanOut)
def get_plan(request, plan_id: UUID):
    require_household_member(request)
    qs = MealPlan.objects.prefetch_related("iterations__entries")
    return get_object_or_404(qs, id=plan_id, household=request.user.active_household)


@router.post("/meal-plans/iterations/{iteration_id}/renew/", response={200: PlanIterationOut})
def renew(request, iteration_id: UUID):
    require_household_member(request)
    iteration = get_object_or_404(
        PlanIteration,
        id=iteration_id,
        meal_plan__household=request.user.active_household,
    )
    renewed = renew_iteration(iteration)
    return renewed


@router.post("/meal-plans/iterations/next/", response={201: PlanIterationOut})
def next_iteration(request):
    require_household_member(request)
    plan = get_object_or_404(MealPlan, household=request.user.active_household)
    iteration = generate_next_iteration(plan)
    return 201, iteration
