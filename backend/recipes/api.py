from uuid import UUID

from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404

from ninja import Router

from recipes.models import CookingStep, Ingredient, Recipe, RecipeIngredient, Tag, TagCategory, Unit
from recipes.schemas import (
    CookingStepOut,
    IngredientCreateIn,
    IngredientOut,
    PaginatedRecipeListOut,
    RecipeCreateIn,
    RecipeOut,
    UnitOut,
)
from recipes.tag_schemas import GroupedTagsOut, TagCreateIn, TagOut, TagUpdateIn
from users.permissions import require_household_member

router = Router()


# ── Helpers ──────────────────────────────────────────────────────────


def _save_ingredients(recipe: Recipe, ingredients_data: list) -> None:
    recipe.ingredients.all().delete()
    RecipeIngredient.objects.bulk_create(
        [
            RecipeIngredient(
                recipe=recipe,
                ingredient_id=item.ingredient,
                quantity=item.quantity,
                unit_id=item.unit,
                order=item.order,
            )
            for item in ingredients_data
        ]
    )


def _save_steps(recipe: Recipe, steps_data: list, method: str) -> None:
    recipe.steps.filter(method=method).delete()
    CookingStep.objects.bulk_create(
        [
            CookingStep(
                recipe=recipe,
                method=method,
                step_number=item.step_number,
                instruction=item.instruction,
            )
            for item in steps_data
        ]
    )


# ── Recipes ──────────────────────────────────────────────────────────


@router.get("/recipes/", response=PaginatedRecipeListOut, tags=["recipes"])
def list_recipes(
    request,
    list_type: str | None = None,
    limit: int | None = None,
    offset: int = 0,
):
    require_household_member(request)
    qs = Recipe.objects.filter(household=request.user.active_household).prefetch_related("tags")
    if list_type:
        qs = qs.filter(list_type=list_type)
    tags_param = request.GET.get("tags")
    if tags_param:
        tag_ids = [t.strip() for t in tags_param.split(",") if t.strip()]
        qs = qs.filter(tags__id__in=tag_ids).distinct()

    total_count = qs.count()

    if limit is not None:
        limit = max(1, min(limit, 100))
        offset = max(0, offset)
        qs = qs[offset : offset + limit]

    return {"items": qs, "total_count": total_count}


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
            leftover_days=payload.leftover_days,
        )
        _save_ingredients(recipe, payload.ingredients)
        _save_steps(recipe, payload.manual_steps, "MANUAL")
        _save_steps(recipe, payload.machine_steps, "MACHINE")
        if payload.tag_ids:
            recipe.tags.set(
                Tag.objects.filter(id__in=payload.tag_ids, household=request.user.active_household)
            )
    return recipe


@router.get("/recipes/{recipe_id}/", response=RecipeOut, tags=["recipes"])
def get_recipe(request, recipe_id: UUID):
    require_household_member(request)
    return get_object_or_404(
        Recipe.objects.prefetch_related(
            "ingredients",
            "tags",
            Prefetch(
                "steps",
                queryset=CookingStep.objects.filter(method="MANUAL"),
                to_attr="manual_steps_list",
            ),
            Prefetch(
                "steps",
                queryset=CookingStep.objects.filter(method="MACHINE"),
                to_attr="machine_steps_list",
            ),
        ),
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
        recipe.leftover_days = payload.leftover_days
        recipe.save()
        _save_ingredients(recipe, payload.ingredients)
        _save_steps(recipe, payload.manual_steps, "MANUAL")
        _save_steps(recipe, payload.machine_steps, "MACHINE")
        recipe.tags.set(
            Tag.objects.filter(id__in=payload.tag_ids, household=request.user.active_household)
        )
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
        recipe.leftover_days = payload.leftover_days
        recipe.save()
        _save_ingredients(recipe, payload.ingredients)
        _save_steps(recipe, payload.manual_steps, "MANUAL")
        _save_steps(recipe, payload.machine_steps, "MACHINE")
        recipe.tags.set(
            Tag.objects.filter(id__in=payload.tag_ids, household=request.user.active_household)
        )
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


# ── Tags ────────────────────────────────────────────────────────────


@router.get("/tags/", response=GroupedTagsOut, tags=["tags"])
def list_tags(request):
    require_household_member(request)
    tags = Tag.objects.filter(household=request.user.active_household)
    grouped: dict[str, list[Tag]] = {cat.value: [] for cat in TagCategory}
    for tag in tags:
        grouped[tag.category].append(tag)
    return grouped


@router.post("/tags/", response={201: TagOut}, tags=["tags"])
def create_tag(request, payload: TagCreateIn):
    require_household_member(request)
    tag = Tag.objects.create(
        household=request.user.active_household,
        category=payload.category,
        name_en=payload.name_en,
        name_de=payload.name_de,
        is_default=False,
    )
    return 201, tag


@router.put("/tags/{tag_id}/", response=TagOut, tags=["tags"])
def update_tag(request, tag_id: UUID, payload: TagUpdateIn):
    require_household_member(request)
    tag = get_object_or_404(Tag, pk=tag_id, household=request.user.active_household)
    tag.name_en = payload.name_en
    tag.name_de = payload.name_de
    tag.save(update_fields=["name_en", "name_de"])
    return tag


@router.delete("/tags/{tag_id}/", response={204: None}, tags=["tags"])
def delete_tag(request, tag_id: UUID):
    require_household_member(request)
    tag = get_object_or_404(Tag, pk=tag_id, household=request.user.active_household)
    tag.delete()
    return None
