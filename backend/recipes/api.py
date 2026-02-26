import base64
import json as json_lib
import time
import urllib.error
import urllib.request
from io import BytesIO
from pathlib import Path
from uuid import UUID

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404

from ninja import File, Router, UploadedFile
from ninja.errors import HttpError
from PIL import Image as PILImage

from recipes.models import CookingStep, Ingredient, Recipe, RecipeIngredient, Unit
from recipes.schemas import (
    CookingStepOut,
    IngredientCreateIn,
    IngredientOut,
    PaginatedRecipeListOut,
    RecipeCreateIn,
    RecipeOut,
    UnitOut,
)
from users.permissions import require_household_member

router = Router()


MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
GEMINI_IMAGEN_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict"
)

IMAGE_PROMPT_TEMPLATE = """You are a professional food photographer. Generate a photorealistic, \
appetizing overhead shot of the following dish on a clean, modern table setting with natural lighting.

Dish: {title}
Key ingredients: {ingredients}

Style: Top-down food photography, shallow depth of field, warm natural light, minimalist plating \
on a white or neutral ceramic plate. No text, no watermarks, no people."""


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


def _save_image_as_webp(recipe: Recipe, img: PILImage.Image) -> None:
    """Resize to max 1024px, convert to WebP, delete old file, save."""
    max_size = 1024
    if max(img.size) > max_size:
        img.thumbnail((max_size, max_size), PILImage.Resampling.LANCZOS)

    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    buf = BytesIO()
    img.save(buf, format="WEBP", quality=85)
    buf.seek(0)

    if recipe.image:
        old_path = Path(settings.MEDIA_ROOT) / recipe.image.name
        if old_path.exists():
            old_path.unlink()

    filename = f"recipes/{recipe.id}_{int(time.time())}.webp"
    recipe.image.save(filename, ContentFile(buf.read()), save=True)


def _process_and_save_image(recipe: Recipe, uploaded_file: UploadedFile) -> None:
    """Validate uploaded image, resize to WebP, save."""
    img = PILImage.open(uploaded_file)
    img.verify()
    uploaded_file.seek(0)
    img = PILImage.open(uploaded_file)
    _save_image_as_webp(recipe, img)


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
    qs = Recipe.objects.filter(household=request.user.active_household)
    if list_type:
        qs = qs.filter(list_type=list_type)

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
    return recipe


@router.get("/recipes/{recipe_id}/", response=RecipeOut, tags=["recipes"])
def get_recipe(request, recipe_id: UUID):
    require_household_member(request)
    return get_object_or_404(
        Recipe.objects.prefetch_related(
            "ingredients",
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


@router.post("/recipes/{recipe_id}/image/upload/", response=RecipeOut, tags=["recipes"])
def upload_recipe_image(request, recipe_id: UUID, image: UploadedFile = File(...)):  # noqa: B008
    require_household_member(request)
    recipe = get_object_or_404(Recipe, pk=recipe_id, household=request.user.active_household)

    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HttpError(400, "Invalid file type")

    if image.size and image.size > MAX_IMAGE_SIZE:
        raise HttpError(400, "File too large (max 5MB)")

    try:
        _process_and_save_image(recipe, image)
    except Exception:
        raise HttpError(400, "Invalid image file") from None

    return recipe


@router.delete("/recipes/{recipe_id}/image/", response=RecipeOut, tags=["recipes"])
def delete_recipe_image(request, recipe_id: UUID):
    require_household_member(request)
    recipe = get_object_or_404(Recipe, pk=recipe_id, household=request.user.active_household)

    if recipe.image:
        old_path = Path(settings.MEDIA_ROOT) / recipe.image.name
        if old_path.exists():
            old_path.unlink()
        recipe.image = ""
        recipe.save(update_fields=["image"])

    return recipe


@router.post("/recipes/{recipe_id}/image/generate/", response=RecipeOut, tags=["recipes"])
def generate_recipe_image(request, recipe_id: UUID):
    require_household_member(request)
    household = request.user.active_household

    if not household.ai_enabled:
        raise HttpError(403, "AI features are disabled")

    if not household.gemini_api_key:
        raise HttpError(400, "Gemini API key not configured")

    recipe = get_object_or_404(
        Recipe.objects.prefetch_related("ingredients__ingredient"),
        pk=recipe_id,
        household=household,
    )

    # Build prompt with ingredient names
    ingredient_names = [ri.ingredient.name_en for ri in recipe.ingredients.all()[:10]]
    prompt = IMAGE_PROMPT_TEMPLATE.format(
        title=recipe.title,
        ingredients=", ".join(ingredient_names) if ingredient_names else "various",
    )

    # Call Gemini
    req_body = json_lib.dumps(
        {
            "instances": [{"prompt": prompt}],
            "parameters": {"sampleCount": 1},
        }
    ).encode()

    api_url = f"{GEMINI_IMAGEN_URL}?key={household.gemini_api_key}"
    req = urllib.request.Request(
        api_url,
        data=req_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp_data = json_lib.loads(resp.read())
    except urllib.error.URLError:
        raise HttpError(502, "Image generation failed") from None
    except TimeoutError:
        raise HttpError(504, "Image generation timed out") from None

    # Decode the base64 image
    try:
        b64_image = resp_data["predictions"][0]["bytesBase64Encoded"]
        image_bytes = base64.b64decode(b64_image)
    except (KeyError, IndexError):
        raise HttpError(502, "Image generation failed") from None

    # Process and save
    img = PILImage.open(BytesIO(image_bytes))
    _save_image_as_webp(recipe, img)

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
