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
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404

from ninja import File, Router, UploadedFile
from ninja.errors import HttpError
from PIL import Image as PILImage

from recipes.generation import build_generation_prompt, call_gemini_text
from recipes.models import CookingStep, Ingredient, Recipe, RecipeIngredient, Tag, TagCategory, Unit
from recipes.schemas import (
    BulkCreateRecipesIn,
    BulkCreateRecipesOut,
    CookingStepOut,
    GenerateRecipesIn,
    IngredientCreateIn,
    IngredientOut,
    PaginatedRecipeListOut,
    RecipeCreateIn,
    RecipeOut,
    UnitOut,
)
from recipes.tag_defaults import seed_default_tags
from recipes.tag_schemas import GroupedTagsOut, TagCreateIn, TagOut, TagUpdateIn
from users.permissions import require_household_member, require_scope

router = Router()


MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
GEMINI_IMAGEN_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict"
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
    from recipes.programs import validate_program_step

    recipe.steps.filter(method=method).delete()
    step_objects = []
    for item in steps_data:
        program_type = item.program_type

        if method == "MANUAL" and program_type:
            raise HttpError(422, "program_type is not allowed on manual steps")

        if program_type:
            errors = validate_program_step(
                program_type,
                temperature=item.temperature,
                duration_seconds=item.duration_seconds,
                speed=item.speed,
                direction=item.direction,
                turbo=item.turbo,
                weight_grams=item.weight_grams,
            )
            if errors:
                raise HttpError(422, "; ".join(errors))
        elif not item.instruction.strip():
            raise HttpError(422, "Free text steps must have a non-empty instruction")

        step_objects.append(
            CookingStep(
                recipe=recipe,
                method=method,
                step_number=item.step_number,
                instruction=item.instruction if not program_type else "",
                program_type=program_type or "",
                temperature=item.temperature,
                duration_seconds=item.duration_seconds,
                speed=item.speed,
                turbo=item.turbo,
                direction=item.direction or "",
                weight_grams=item.weight_grams,
            )
        )
    CookingStep.objects.bulk_create(step_objects)


# ── Recipes ──────────────────────────────────────────────────────────


@router.get("/recipes/", response=PaginatedRecipeListOut, tags=["recipes"])
def list_recipes(
    request,
    list_type: str | None = None,
    search: str | None = None,
    limit: int | None = None,
    offset: int = 0,
):
    require_household_member(request)
    require_scope(request, "recipes:read")
    qs = Recipe.objects.filter(household=request.user.active_household).prefetch_related("tags")
    if list_type:
        qs = qs.filter(list_type=list_type)
    tags_param = request.GET.get("tags")
    if tags_param:
        tag_ids = [t.strip() for t in tags_param.split(",") if t.strip()]
        qs = qs.filter(tags__id__in=tag_ids).distinct()
    if search:
        qs = qs.filter(title__icontains=search)

    total_count = qs.count()

    if limit is not None:
        limit = max(1, min(limit, 100))
        offset = max(0, offset)
        qs = qs[offset : offset + limit]

    return {"items": qs, "total_count": total_count}


@router.post("/recipes/", response={201: RecipeOut}, tags=["recipes"])
def create_recipe(request, payload: RecipeCreateIn):
    require_household_member(request)
    require_scope(request, "recipes:write")
    with transaction.atomic():
        recipe = Recipe.objects.create(
            household=request.user.active_household,
            title=payload.title,
            description=payload.description,
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


@router.post("/recipes/bulk-create/", response={201: BulkCreateRecipesOut}, tags=["recipes"])
def bulk_create_recipes(request, payload: BulkCreateRecipesIn):
    require_household_member(request)
    require_scope(request, "recipes:write")
    household = request.user.active_household

    # Pre-load lookup maps
    unit_map = {u.abbreviation.lower(): u for u in Unit.objects.all()}
    ingredient_map = {i.name_en.lower(): i for i in Ingredient.objects.all()}

    created_ids: list = []

    with transaction.atomic():
        for recipe_data in payload.recipes:
            recipe = Recipe.objects.create(
                household=household,
                title=recipe_data.title,
                description=recipe_data.description,
                list_type="TO_TRY",
                default_servings=recipe_data.default_servings,
                prep_time_minutes=recipe_data.prep_time_minutes,
                cook_time_minutes=recipe_data.cook_time_minutes,
                leftover_days=recipe_data.leftover_days,
            )
            created_ids.append(recipe.id)

            # Resolve ingredients
            recipe_ingredients = []
            for ing_data in recipe_data.ingredients:
                unit = unit_map.get(ing_data.unit_abbreviation.lower())
                if unit is None:
                    continue  # Skip unknown units

                ingredient = ingredient_map.get(ing_data.name_en.lower())
                if ingredient is None:
                    ingredient = Ingredient.objects.create(
                        name_en=ing_data.name_en,
                        name_de=ing_data.name_de,
                        category=ing_data.category,
                    )
                    ingredient_map[ing_data.name_en.lower()] = ingredient

                recipe_ingredients.append(
                    RecipeIngredient(
                        recipe=recipe,
                        ingredient=ingredient,
                        quantity=ing_data.quantity,
                        unit=unit,
                        order=ing_data.order,
                    )
                )

            if recipe_ingredients:
                RecipeIngredient.objects.bulk_create(recipe_ingredients)

            # Save steps
            _save_steps(recipe, recipe_data.manual_steps, "MANUAL")
            _save_steps(recipe, recipe_data.machine_steps, "MACHINE")

            # Set tags
            if recipe_data.tag_ids:
                recipe.tags.set(Tag.objects.filter(id__in=recipe_data.tag_ids, household=household))

            # Handle image
            if recipe_data.image_base64:
                try:
                    image_bytes = base64.b64decode(recipe_data.image_base64)
                    img = PILImage.open(BytesIO(image_bytes))
                    _save_image_as_webp(recipe, img)
                except Exception:
                    pass  # Silently skip invalid images

    return 201, {"created_ids": created_ids}


@router.post("/recipes/generate/", tags=["recipes"])
def generate_recipes(request, payload: GenerateRecipesIn):
    require_household_member(request)
    require_scope(request, "recipes:write")
    household = request.user.active_household

    if not household.ai_enabled:
        raise HttpError(403, "AI features are disabled")

    if not household.gemini_api_key:
        raise HttpError(400, "Gemini API key not configured")

    # Capture values before entering the generator (request may not be available later)
    api_key = household.gemini_api_key
    language = request.user.preferred_language or "en"
    count = payload.count
    tag_ids = [str(t) for t in payload.tag_ids]
    free_text = payload.free_text
    generate_images = payload.generate_images

    # Pre-fetch tag name->id mapping and unit abbreviation->id mapping
    tag_map = {t.name_en.lower(): str(t.id) for t in Tag.objects.filter(household=household)}
    unit_map = {u.abbreviation.lower(): u.id for u in Unit.objects.all()}

    def event_stream():
        # Build prompt and call Gemini
        prompt = build_generation_prompt(
            household=household,
            count=count,
            tag_ids=tag_ids,
            free_text=free_text,
            language=language,
        )

        try:
            recipes = call_gemini_text(api_key, prompt)
        except Exception as exc:
            yield json_lib.dumps({"type": "error", "message": str(exc)}) + "\n"
            return

        for idx, recipe_data in enumerate(recipes):
            # Resolve tag names to IDs
            resolved_tag_ids = []
            for tag_name in recipe_data.get("tag_names_en", []):
                tag_id = tag_map.get(tag_name.lower())
                if tag_id:
                    resolved_tag_ids.append(tag_id)
            recipe_data["tag_ids"] = resolved_tag_ids

            # Resolve unit abbreviations to IDs
            for ing in recipe_data.get("ingredients", []):
                abbr = ing.get("unit_abbreviation", "")
                ing["unit_id"] = unit_map.get(abbr.lower())

            yield json_lib.dumps({"type": "recipe", "index": idx, "data": recipe_data}) + "\n"

            # Generate image if requested
            if generate_images:
                try:
                    ingredient_names = [
                        ing.get("name_en", "") for ing in recipe_data.get("ingredients", [])[:10]
                    ]
                    img_prompt = IMAGE_PROMPT_TEMPLATE.format(
                        title=recipe_data.get("title", ""),
                        ingredients=", ".join(ingredient_names) if ingredient_names else "various",
                    )
                    req_body = json_lib.dumps(
                        {
                            "instances": [{"prompt": img_prompt}],
                            "parameters": {"sampleCount": 1},
                        }
                    ).encode()
                    img_req = urllib.request.Request(
                        GEMINI_IMAGEN_URL,
                        data=req_body,
                        headers={
                            "Content-Type": "application/json",
                            "x-goog-api-key": api_key,
                        },
                        method="POST",
                    )
                    with urllib.request.urlopen(img_req, timeout=30) as resp:
                        resp_data = json_lib.loads(resp.read())
                    b64_image = resp_data["predictions"][0]["bytesBase64Encoded"]
                    yield (
                        json_lib.dumps(
                            {"type": "image", "index": idx, "data": {"image_base64": b64_image}}
                        )
                        + "\n"
                    )
                except Exception:
                    continue

        yield json_lib.dumps({"type": "done"}) + "\n"

    response = StreamingHttpResponse(event_stream(), content_type="application/x-ndjson")
    response["X-Accel-Buffering"] = "no"
    response["Cache-Control"] = "no-cache"
    return response


@router.get("/recipes/{recipe_id}/", response=RecipeOut, tags=["recipes"])
def get_recipe(request, recipe_id: UUID):
    require_household_member(request)
    require_scope(request, "recipes:read")
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
    require_scope(request, "recipes:write")
    recipe = get_object_or_404(Recipe, pk=recipe_id, household=request.user.active_household)
    with transaction.atomic():
        recipe.title = payload.title
        recipe.description = payload.description
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
    require_scope(request, "recipes:write")
    recipe = get_object_or_404(Recipe, pk=recipe_id, household=request.user.active_household)
    with transaction.atomic():
        recipe.title = payload.title
        recipe.description = payload.description
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
    require_scope(request, "recipes:write")
    recipe = get_object_or_404(Recipe, pk=recipe_id, household=request.user.active_household)
    recipe.delete()
    return None


@router.post("/recipes/{recipe_id}/move/", response=RecipeOut, tags=["recipes"])
def move_recipe(request, recipe_id: UUID):
    require_household_member(request)
    require_scope(request, "recipes:write")
    recipe = get_object_or_404(Recipe, pk=recipe_id, household=request.user.active_household)
    recipe.list_type = "TO_TRY" if recipe.list_type == "KNOWN" else "KNOWN"
    recipe.save()
    return recipe


@router.post("/recipes/{recipe_id}/image/upload/", response=RecipeOut, tags=["recipes"])
def upload_recipe_image(request, recipe_id: UUID, image: UploadedFile = File(...)):  # noqa: B008
    require_household_member(request)
    require_scope(request, "recipes:write")
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
    require_scope(request, "recipes:write")
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
    require_scope(request, "recipes:write")
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

    req = urllib.request.Request(
        GEMINI_IMAGEN_URL,
        data=req_body,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": household.gemini_api_key,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp_data = json_lib.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")[:200]
        raise HttpError(502, f"Image generation failed: {exc.code} {body}") from None
    except urllib.error.URLError as exc:
        raise HttpError(502, f"Image generation failed: {exc.reason}") from None
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
    require_scope(request, "recipes:read")
    recipe = get_object_or_404(Recipe, pk=recipe_id, household=request.user.active_household)
    qs = recipe.steps.all()
    if method:
        qs = qs.filter(method=method)
    return qs


# ── Ingredients & Units ──────────────────────────────────────────────


@router.get("/ingredients/", response=list[IngredientOut], tags=["ingredients"])
def list_ingredients(request):
    require_household_member(request)
    require_scope(request, "recipes:read")
    return Ingredient.objects.all()


@router.post("/ingredients/", response={201: IngredientOut}, tags=["ingredients"])
def create_ingredient(request, payload: IngredientCreateIn):
    require_household_member(request)
    require_scope(request, "recipes:write")
    return Ingredient.objects.create(
        name_de=payload.name_de,
        name_en=payload.name_en,
        category=payload.category,
    )


@router.get("/units/", response=list[UnitOut], tags=["units"])
def list_units(request):
    require_household_member(request)
    require_scope(request, "recipes:read")
    return Unit.objects.all()


# ── Tags ────────────────────────────────────────────────────────────


@router.get("/tags/", response=GroupedTagsOut, tags=["tags"])
def list_tags(request):
    require_household_member(request)
    require_scope(request, "recipes:read")
    tags = Tag.objects.filter(household=request.user.active_household)
    grouped: dict[str, list[Tag]] = {cat.value: [] for cat in TagCategory}
    for tag in tags:
        grouped[tag.category].append(tag)
    return grouped


@router.post("/tags/", response={201: TagOut}, tags=["tags"])
def create_tag(request, payload: TagCreateIn):
    require_household_member(request)
    require_scope(request, "recipes:write")
    tag = Tag.objects.create(
        household=request.user.active_household,
        category=payload.category,
        name_en=payload.name_en,
        name_de=payload.name_de,
        is_default=False,
    )
    return 201, tag


@router.post("/tags/reset/", response=GroupedTagsOut, tags=["tags"])
def reset_tags(request):
    require_household_member(request)
    require_scope(request, "recipes:write")
    household = request.user.active_household
    Tag.objects.filter(household=household).delete()
    seed_default_tags(household)
    tags = Tag.objects.filter(household=household)
    grouped: dict[str, list[Tag]] = {cat.value: [] for cat in TagCategory}
    for tag in tags:
        grouped[tag.category].append(tag)
    return grouped


@router.put("/tags/{tag_id}/", response=TagOut, tags=["tags"])
def update_tag(request, tag_id: UUID, payload: TagUpdateIn):
    require_household_member(request)
    require_scope(request, "recipes:write")
    tag = get_object_or_404(Tag, pk=tag_id, household=request.user.active_household)
    tag.name_en = payload.name_en
    tag.name_de = payload.name_de
    tag.save(update_fields=["name_en", "name_de"])
    return tag


@router.delete("/tags/{tag_id}/", response={204: None}, tags=["tags"])
def delete_tag(request, tag_id: UUID):
    require_household_member(request)
    require_scope(request, "recipes:write")
    tag = get_object_or_404(Tag, pk=tag_id, household=request.user.active_household)
    tag.delete()
    return None
