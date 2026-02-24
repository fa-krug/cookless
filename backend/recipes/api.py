from uuid import UUID

from django.db import transaction
from django.shortcuts import get_object_or_404

from ninja import Router

from recipes.models import CookingStep, Ingredient, Recipe, RecipeIngredient, Unit
from recipes.schemas import (
    CookingStepOut,
    IngredientCreateIn,
    IngredientOut,
    RecipeCreateIn,
    RecipeOut,
    UnitOut,
)
from users.permissions import require_household_member

router = Router()


# ── Helpers ──────────────────────────────────────────────────────────


def _save_ingredients(recipe: Recipe, ingredients_data: list) -> None:
    recipe.ingredients.all().delete()
    for item in ingredients_data:
        RecipeIngredient.objects.create(
            recipe=recipe,
            ingredient_id=item.ingredient,
            quantity=item.quantity,
            unit_id=item.unit,
            order=item.order,
        )


def _save_steps(recipe: Recipe, steps_data: list, method: str) -> None:
    recipe.steps.filter(method=method).delete()
    for item in steps_data:
        CookingStep.objects.create(
            recipe=recipe,
            method=method,
            step_number=item.step_number,
            instruction=item.instruction,
        )


# ── Recipes ──────────────────────────────────────────────────────────


@router.get("/recipes/", response=list[RecipeOut], tags=["recipes"])
def list_recipes(request, list_type: str | None = None):
    require_household_member(request)
    qs = Recipe.objects.filter(household=request.user.active_household).prefetch_related(
        "ingredients", "steps"
    )
    if list_type:
        qs = qs.filter(list_type=list_type)
    return qs


@router.post("/recipes/", response={201: RecipeOut}, tags=["recipes"])
def create_recipe(request, payload: RecipeCreateIn):
    require_household_member(request)
    with transaction.atomic():
        recipe = Recipe.objects.create(
            household=request.user.active_household,
            title=payload.title,
            list_type=payload.list_type,
            default_servings=payload.default_servings,
            prep_time_minutes=payload.prep_time_minutes,
            cook_time_minutes=payload.cook_time_minutes,
        )
        _save_ingredients(recipe, payload.ingredients)
        _save_steps(recipe, payload.manual_steps, "MANUAL")
        _save_steps(recipe, payload.machine_steps, "MACHINE")
    return recipe


@router.get("/recipes/{recipe_id}/", response=RecipeOut, tags=["recipes"])
def get_recipe(request, recipe_id: UUID):
    require_household_member(request)
    return get_object_or_404(
        Recipe.objects.prefetch_related("ingredients", "steps"),
        pk=recipe_id,
        household=request.user.active_household,
    )


@router.put("/recipes/{recipe_id}/", response=RecipeOut, tags=["recipes"])
def update_recipe_put(request, recipe_id: UUID, payload: RecipeCreateIn):
    require_household_member(request)
    recipe = get_object_or_404(Recipe, pk=recipe_id, household=request.user.active_household)
    with transaction.atomic():
        recipe.title = payload.title
        recipe.list_type = payload.list_type
        recipe.default_servings = payload.default_servings
        recipe.prep_time_minutes = payload.prep_time_minutes
        recipe.cook_time_minutes = payload.cook_time_minutes
        recipe.save()
        _save_ingredients(recipe, payload.ingredients)
        _save_steps(recipe, payload.manual_steps, "MANUAL")
        _save_steps(recipe, payload.machine_steps, "MACHINE")
    return recipe


@router.patch("/recipes/{recipe_id}/", response=RecipeOut, tags=["recipes"])
def update_recipe_patch(request, recipe_id: UUID, payload: RecipeCreateIn):
    require_household_member(request)
    recipe = get_object_or_404(Recipe, pk=recipe_id, household=request.user.active_household)
    with transaction.atomic():
        recipe.title = payload.title
        recipe.list_type = payload.list_type
        recipe.default_servings = payload.default_servings
        recipe.prep_time_minutes = payload.prep_time_minutes
        recipe.cook_time_minutes = payload.cook_time_minutes
        recipe.save()
        _save_ingredients(recipe, payload.ingredients)
        _save_steps(recipe, payload.manual_steps, "MANUAL")
        _save_steps(recipe, payload.machine_steps, "MACHINE")
    return recipe


@router.delete("/recipes/{recipe_id}/", response={204: None}, tags=["recipes"])
def delete_recipe(request, recipe_id: UUID):
    require_household_member(request)
    recipe = get_object_or_404(Recipe, pk=recipe_id, household=request.user.active_household)
    recipe.delete()
    return None


@router.post("/recipes/{recipe_id}/move/", response=RecipeOut, tags=["recipes"])
def move_recipe(request, recipe_id: UUID):
    require_household_member(request)
    recipe = get_object_or_404(Recipe, pk=recipe_id, household=request.user.active_household)
    recipe.list_type = "TO_TRY" if recipe.list_type == "KNOWN" else "KNOWN"
    recipe.save()
    return recipe


@router.get("/recipes/{recipe_id}/steps/", response=list[CookingStepOut], tags=["recipes"])
def list_steps(request, recipe_id: UUID, method: str | None = None):
    require_household_member(request)
    recipe = get_object_or_404(Recipe, pk=recipe_id, household=request.user.active_household)
    qs = recipe.steps.all()
    if method:
        qs = qs.filter(method=method)
    return qs


# ── Ingredients & Units ──────────────────────────────────────────────


@router.get("/ingredients/", response=list[IngredientOut], tags=["ingredients"])
def list_ingredients(request):
    require_household_member(request)
    return Ingredient.objects.all()


@router.post("/ingredients/", response={201: IngredientOut}, tags=["ingredients"])
def create_ingredient(request, payload: IngredientCreateIn):
    require_household_member(request)
    return Ingredient.objects.create(
        name_de=payload.name_de,
        name_en=payload.name_en,
        category=payload.category,
    )


@router.get("/units/", response=list[UnitOut], tags=["units"])
def list_units(request):
    require_household_member(request)
    return Unit.objects.all()
