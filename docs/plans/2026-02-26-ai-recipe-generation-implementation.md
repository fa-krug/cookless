# AI Recipe Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add batch AI recipe generation via Gemini, with tag selection, free-text guidance, optional image generation, streaming preview, and bulk save.

**Architecture:** New `recipes/generation.py` service builds a sophisticated prompt from existing recipes + ingredient/unit catalogs + tags, calls Gemini text model for structured JSON output. New streaming endpoint returns NDJSON. New bulk-create endpoint saves selected recipes. Frontend adds a generation drawer, streaming preview panel, and "Generate with AI" button on RecipeListPage.

**Tech Stack:** Django Ninja (streaming HttpResponse), Gemini 2.0 Flash API (text), Gemini Imagen 3.0 (images), React + TanStack Query, fetch ReadableStream for NDJSON parsing.

---

### Task 1: Recipe generation service (`recipes/generation.py`)

**Files:**
- Create: `backend/recipes/generation.py`
- Test: `backend/recipes/tests/test_generation.py`

This is the core service. It builds the prompt, calls Gemini, and parses the response.

**Context:**
- Existing ingredients: `Ingredient` model has `name_en`, `name_de`, `category` (PRODUCE/DAIRY/MEAT/PANTRY/FROZEN/OTHER)
- Existing units: `Unit` model has `name_en`, `name_de`, `abbreviation`
- Existing tags: `Tag` model has `category`, `name_en`, `name_de`, household-scoped
- Existing recipes: `Recipe` model with `RecipeIngredient` (quantity, unit, ingredient, order) and `CookingStep` (method MANUAL/MACHINE, step_number, instruction)
- Gemini API pattern: see `recipes/api.py` lines 309-331 for urllib usage
- Gemini text model URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`

**Step 1: Write tests for prompt building**

Create `backend/recipes/tests/test_generation.py`:

```python
import json

import pytest

from recipes.generation import build_generation_prompt
from recipes.models import (
    CookingStep,
    Ingredient,
    Recipe,
    RecipeIngredient,
    Tag,
    Unit,
)
from users.models import Household, HouseholdMember, User


@pytest.fixture
def household():
    user = User.objects.create_user(email="gen@example.com")
    household = Household.objects.create(name="Home", ai_enabled=True, gemini_api_key="test-key")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    return household


@pytest.fixture
def sample_data(household):
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")
    ing = Ingredient.objects.create(name_en="tomato", name_de="Tomate", category="PRODUCE")
    tag = Tag.objects.create(
        household=household, category="CUISINE", name_en="Italian", name_de="Italienisch"
    )
    recipe = Recipe.objects.create(
        household=household, title="Pasta", list_type="KNOWN", default_servings=2
    )
    RecipeIngredient.objects.create(recipe=recipe, ingredient=ing, quantity=200, unit=unit, order=0)
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=1, instruction="Cook it")
    recipe.tags.add(tag)
    return {"unit": unit, "ingredient": ing, "tag": tag, "recipe": recipe}


@pytest.mark.django_db
def test_build_prompt_includes_recipe_reference(household, sample_data):
    prompt = build_generation_prompt(
        household=household,
        count=3,
        tag_ids=[],
        free_text="",
        language="en",
    )
    assert "Pasta" in prompt
    assert "tomato" in prompt
    assert "gram" in prompt


@pytest.mark.django_db
def test_build_prompt_includes_selected_tags(household, sample_data):
    prompt = build_generation_prompt(
        household=household,
        count=3,
        tag_ids=[str(sample_data["tag"].id)],
        free_text="",
        language="en",
    )
    assert "Italian" in prompt


@pytest.mark.django_db
def test_build_prompt_includes_free_text(household, sample_data):
    prompt = build_generation_prompt(
        household=household,
        count=2,
        tag_ids=[],
        free_text="comfort food for winter",
        language="en",
    )
    assert "comfort food for winter" in prompt


@pytest.mark.django_db
def test_build_prompt_includes_do_not_repeat(household, sample_data):
    prompt = build_generation_prompt(
        household=household,
        count=3,
        tag_ids=[],
        free_text="",
        language="en",
    )
    assert "Do NOT recreate" in prompt or "do not repeat" in prompt.lower()


@pytest.mark.django_db
def test_build_prompt_no_existing_recipes(household):
    prompt = build_generation_prompt(
        household=household,
        count=3,
        tag_ids=[],
        free_text="",
        language="en",
    )
    # Should work without recipes -- no style reference section
    assert "Generate exactly 3" in prompt
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/recipes/tests/test_generation.py -v`
Expected: FAIL (ImportError: cannot import name 'build_generation_prompt')

**Step 3: Write the generation service**

Create `backend/recipes/generation.py`:

```python
from __future__ import annotations

import json as json_lib
import urllib.error
import urllib.request
from uuid import UUID

from recipes.models import CookingStep, Ingredient, Recipe, RecipeIngredient, Tag, Unit

GEMINI_TEXT_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
)


def build_generation_prompt(
    *,
    household,
    count: int,
    tag_ids: list[str],
    free_text: str,
    language: str,
) -> str:
    """Build a comprehensive prompt for Gemini to generate recipes."""
    sections: list[str] = []

    # ── System role ──────────────────────────────────────────────────
    sections.append(
        "You are a professional recipe creator for a home cooking app. "
        "Generate recipes as a JSON array. Each recipe must be complete, practical, "
        "and suitable for home cooking."
    )

    # ── Output schema ────────────────────────────────────────────────
    lang_note = "German" if language == "de" else "English"
    sections.append(f"""
Output EXACTLY a JSON array of {count} recipe objects. No markdown, no explanation, just valid JSON.
Each recipe object has this exact structure:
{{
  "title": "string (in {lang_note})",
  "default_servings": integer (2-6),
  "prep_time_minutes": integer or null,
  "cook_time_minutes": integer or null,
  "leftover_days": integer (0-3) or null,
  "ingredients": [
    {{"name_en": "string", "name_de": "string", "category": "PRODUCE|DAIRY|MEAT|PANTRY|FROZEN|OTHER", "quantity": "decimal string", "unit_abbreviation": "string", "order": integer}}
  ],
  "manual_steps": [
    {{"step_number": integer, "instruction": "string (in {lang_note})"}}
  ],
  "machine_steps": [
    {{"step_number": integer, "instruction": "string (in {lang_note})"}}
  ],
  "tag_names_en": ["string"]
}}""".strip())

    # ── Ingredient catalog ───────────────────────────────────────────
    ingredients = Ingredient.objects.all()[:200]
    if ingredients:
        ing_lines = [f"- {i.name_en} / {i.name_de} ({i.category})" for i in ingredients]
        sections.append(
            "EXISTING INGREDIENTS (use these exact names when possible, create new ones "
            "following the same pattern — lowercase, singular, bilingual en/de — if needed):\n"
            + "\n".join(ing_lines)
        )

    # ── Unit catalog ─────────────────────────────────────────────────
    units = Unit.objects.all()
    if units:
        unit_lines = [f"- {u.abbreviation} ({u.name_en} / {u.name_de})" for u in units]
        sections.append(
            "AVAILABLE UNITS (use these abbreviations in unit_abbreviation):\n"
            + "\n".join(unit_lines)
        )

    # ── Tag context ──────────────────────────────────────────────────
    all_tags = Tag.objects.filter(household=household)
    if tag_ids:
        selected_tags = all_tags.filter(id__in=tag_ids)
        tag_lines = [f"- {t.category}: {t.name_en} / {t.name_de}" for t in selected_tags]
        sections.append(
            "REQUIRED TAGS — every generated recipe MUST have ALL of these tags:\n"
            + "\n".join(tag_lines)
        )
    if all_tags.exists():
        available_lines = [f"- {t.category}: {t.name_en}" for t in all_tags]
        sections.append(
            "AVAILABLE TAGS (use tag_names_en to assign tags from this list):\n"
            + "\n".join(available_lines)
        )

    # ── Style reference ──────────────────────────────────────────────
    existing_recipes = (
        Recipe.objects.filter(household=household)
        .prefetch_related("ingredients__ingredient", "ingredients__unit", "steps", "tags")
        .order_by("?")
    )
    if tag_ids:
        matching = existing_recipes.filter(tags__id__in=tag_ids).distinct()[:5]
        other = existing_recipes.exclude(id__in=matching.values_list("id", flat=True))[:5]
        sample_recipes = list(matching) + list(other)
    else:
        sample_recipes = list(existing_recipes[:10])

    if sample_recipes:
        ref_parts: list[str] = []
        recipe_titles: list[str] = []
        for r in sample_recipes:
            recipe_titles.append(r.title)
            ings = [
                f"  - {ri.quantity} {ri.unit.abbreviation} {ri.ingredient.name_en}"
                for ri in r.ingredients.all()
            ]
            manual = [f"  {s.step_number}. {s.instruction}" for s in r.steps.filter(method="MANUAL")]
            machine = [f"  {s.step_number}. {s.instruction}" for s in r.steps.filter(method="MACHINE")]
            tags = [t.name_en for t in r.tags.all()]
            ref = f"Title: {r.title}\nServings: {r.default_servings}\nTags: {', '.join(tags)}"
            if ings:
                ref += "\nIngredients:\n" + "\n".join(ings)
            if manual:
                ref += "\nManual steps:\n" + "\n".join(manual)
            if machine:
                ref += "\nMachine steps:\n" + "\n".join(machine)
            ref_parts.append(ref)

        sections.append(
            "STYLE REFERENCE — match the writing style, detail level, and naming conventions "
            "of these existing recipes:\n\n" + "\n\n---\n\n".join(ref_parts)
        )

        # ── Do not repeat ────────────────────────────────────────────
        sections.append(
            "IMPORTANT: Do NOT recreate or closely duplicate any of these existing recipes. "
            "The following titles already exist — generate completely different recipes:\n"
            + "\n".join(f"- {t}" for t in recipe_titles)
        )

    # ── Variety ──────────────────────────────────────────────────────
    sections.append(
        "VARIETY: Ensure each recipe is distinctly different. Vary cooking methods, "
        "main ingredients, complexity levels, and cuisines across the batch."
    )

    # ── Free text ────────────────────────────────────────────────────
    if free_text.strip():
        sections.append(f"ADDITIONAL REQUIREMENTS: {free_text.strip()}")

    # ── Final instruction ────────────────────────────────────────────
    sections.append(
        f"Generate exactly {count} recipes. Respond with ONLY the JSON array, "
        f"no other text."
    )

    return "\n\n".join(sections)


def call_gemini_text(*, api_key: str, prompt: str) -> list[dict]:
    """Call Gemini text model and parse JSON array response."""
    req_body = json_lib.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
        },
    }).encode()

    api_url = f"{GEMINI_TEXT_URL}?key={api_key}"
    req = urllib.request.Request(
        api_url,
        data=req_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp_data = json_lib.loads(resp.read())
    except urllib.error.URLError:
        raise RuntimeError("Gemini API request failed") from None
    except TimeoutError:
        raise RuntimeError("Gemini API request timed out") from None

    # Extract text from Gemini response
    try:
        text = resp_data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise RuntimeError("Unexpected Gemini response format") from None

    # Parse JSON array
    try:
        recipes = json_lib.loads(text)
    except json_lib.JSONDecodeError:
        raise RuntimeError("Gemini returned invalid JSON") from None

    if not isinstance(recipes, list):
        raise RuntimeError("Gemini did not return a JSON array")

    return recipes
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/recipes/tests/test_generation.py -v`
Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add backend/recipes/generation.py backend/recipes/tests/test_generation.py
git commit -m "feat: add recipe generation service with prompt builder and Gemini client"
```

---

### Task 2: Generate recipes API endpoint (streaming NDJSON)

**Files:**
- Modify: `backend/recipes/api.py`
- Modify: `backend/recipes/schemas.py`
- Test: `backend/recipes/tests/test_generate_recipes_api.py`

**Context:**
- Django Ninja router is at `backend/recipes/api.py` line 33: `router = Router()`
- The endpoint must return a streaming response (not a schema-based response)
- Django's `StreamingHttpResponse` works for NDJSON
- Existing AI checks pattern: see `generate_recipe_image` at line 285-294 for `ai_enabled` and `gemini_api_key` checks
- Since Django Ninja doesn't natively support streaming, use `django.http.StreamingHttpResponse` directly via the router

**Step 1: Write tests**

Create `backend/recipes/tests/test_generate_recipes_api.py`:

```python
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import Ingredient, Recipe, Tag, Unit
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="genapi@example.com")
    household = Household.objects.create(
        name="Home", ai_enabled=True, gemini_api_key="test-key-123"
    )
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = Client()
    client.force_login(user)
    return client, household, user


MOCK_GEMINI_RECIPES = [
    {
        "title": "Test Soup",
        "default_servings": 4,
        "prep_time_minutes": 15,
        "cook_time_minutes": 30,
        "leftover_days": 2,
        "ingredients": [
            {
                "name_en": "onion",
                "name_de": "Zwiebel",
                "category": "PRODUCE",
                "quantity": "2",
                "unit_abbreviation": "pcs",
                "order": 0,
            }
        ],
        "manual_steps": [{"step_number": 1, "instruction": "Chop the onion"}],
        "machine_steps": [],
        "tag_names_en": ["Italian"],
    }
]


def _mock_gemini_text_response():
    """Create a fake Gemini text response."""
    return {
        "candidates": [
            {"content": {"parts": [{"text": json.dumps(MOCK_GEMINI_RECIPES)}]}}
        ]
    }


@pytest.mark.django_db
def test_generate_recipes_success(auth_client):
    client, household, _ = auth_client
    Tag.objects.create(
        household=household, category="CUISINE", name_en="Italian", name_de="Italienisch"
    )

    from unittest.mock import MagicMock

    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps(_mock_gemini_text_response()).encode()
    mock_response.__enter__ = MagicMock(return_value=mock_response)
    mock_response.__exit__ = MagicMock(return_value=False)

    with patch("recipes.generation.urllib.request.urlopen", return_value=mock_response):
        response = client.post(
            "/api/v1/recipes/generate/",
            data=json.dumps({"count": 1, "tag_ids": [], "free_text": "", "generate_images": False}),
            content_type="application/json",
        )

    assert response.status_code == 200
    assert response["Content-Type"] == "application/x-ndjson"

    lines = [line for line in response.streaming_content]
    parsed = [json.loads(line) for line in lines if line.strip()]
    recipe_events = [e for e in parsed if e["type"] == "recipe"]
    done_events = [e for e in parsed if e["type"] == "done"]

    assert len(recipe_events) == 1
    assert recipe_events[0]["data"]["title"] == "Test Soup"
    assert len(done_events) == 1


@pytest.mark.django_db
def test_generate_recipes_ai_disabled(auth_client):
    client, household, _ = auth_client
    household.ai_enabled = False
    household.save()

    response = client.post(
        "/api/v1/recipes/generate/",
        data=json.dumps({"count": 1}),
        content_type="application/json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_generate_recipes_no_api_key(auth_client):
    client, household, _ = auth_client
    household.gemini_api_key = ""
    household.save()

    response = client.post(
        "/api/v1/recipes/generate/",
        data=json.dumps({"count": 1}),
        content_type="application/json",
    )
    assert response.status_code == 400
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/recipes/tests/test_generate_recipes_api.py -v`
Expected: FAIL (no endpoint yet)

**Step 3: Add the request schema and endpoint**

Add to `backend/recipes/schemas.py` at the end:

```python
class GenerateRecipesIn(Schema):
    count: int = 10
    tag_ids: list[UUID] = []
    free_text: str = ""
    generate_images: bool = True
```

Add to `backend/recipes/api.py` — new imports at top:

```python
import json as json_lib  # already imported
from django.http import StreamingHttpResponse  # add this
from recipes.generation import build_generation_prompt, call_gemini_text  # add this
from recipes.schemas import GenerateRecipesIn  # add to existing import
```

Add the endpoint before the `# ── Ingredients & Units` section:

```python
@router.post("/recipes/generate/", tags=["recipes"])
def generate_recipes(request, payload: GenerateRecipesIn):
    require_household_member(request)
    household = request.user.active_household

    if not household.ai_enabled:
        raise HttpError(403, "AI features are disabled")
    if not household.gemini_api_key:
        raise HttpError(400, "Gemini API key not configured")

    language = request.user.preferred_language or "en"

    def stream():
        # Build prompt and call Gemini
        prompt = build_generation_prompt(
            household=household,
            count=min(payload.count, 20),
            tag_ids=[str(t) for t in payload.tag_ids],
            free_text=payload.free_text,
            language=language,
        )

        try:
            raw_recipes = call_gemini_text(api_key=household.gemini_api_key, prompt=prompt)
        except RuntimeError as e:
            yield json_lib.dumps({"type": "error", "message": str(e)}) + "\n"
            return

        # Resolve tags and stream each recipe
        all_tags = {t.name_en.lower(): t for t in Tag.objects.filter(household=household)}
        all_units = {u.abbreviation.lower(): u for u in Unit.objects.all()}

        for idx, raw in enumerate(raw_recipes):
            try:
                # Resolve tag names to IDs
                resolved_tag_ids = []
                for tag_name in raw.get("tag_names_en", []):
                    tag = all_tags.get(tag_name.lower())
                    if tag:
                        resolved_tag_ids.append(str(tag.id))

                recipe_data = {
                    "title": raw["title"],
                    "default_servings": raw.get("default_servings", 2),
                    "prep_time_minutes": raw.get("prep_time_minutes"),
                    "cook_time_minutes": raw.get("cook_time_minutes"),
                    "leftover_days": raw.get("leftover_days"),
                    "ingredients": raw.get("ingredients", []),
                    "manual_steps": raw.get("manual_steps", []),
                    "machine_steps": raw.get("machine_steps", []),
                    "tag_ids": resolved_tag_ids,
                }

                yield json_lib.dumps({"type": "recipe", "index": idx, "data": recipe_data}) + "\n"
            except (KeyError, TypeError):
                continue  # Skip malformed recipes

        # Generate images if requested
        if payload.generate_images:
            for idx, raw in enumerate(raw_recipes):
                try:
                    ingredient_names = [
                        i.get("name_en", "") for i in raw.get("ingredients", [])[:10]
                    ]
                    prompt = IMAGE_PROMPT_TEMPLATE.format(
                        title=raw.get("title", "dish"),
                        ingredients=", ".join(ingredient_names) if ingredient_names else "various",
                    )
                    req_body = json_lib.dumps({
                        "instances": [{"prompt": prompt}],
                        "parameters": {"sampleCount": 1},
                    }).encode()
                    api_url = f"{GEMINI_IMAGEN_URL}?key={household.gemini_api_key}"
                    req = urllib.request.Request(
                        api_url,
                        data=req_body,
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        resp_data = json_lib.loads(resp.read())
                    b64_image = resp_data["predictions"][0]["bytesBase64Encoded"]
                    yield json_lib.dumps({
                        "type": "image",
                        "index": idx,
                        "data": {"image_base64": b64_image},
                    }) + "\n"
                except Exception:
                    continue  # Skip failed images silently

        yield json_lib.dumps({"type": "done"}) + "\n"

    response = StreamingHttpResponse(stream(), content_type="application/x-ndjson")
    response["X-Accel-Buffering"] = "no"
    response["Cache-Control"] = "no-cache"
    return response
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/recipes/tests/test_generate_recipes_api.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/recipes/api.py backend/recipes/schemas.py backend/recipes/tests/test_generate_recipes_api.py
git commit -m "feat: add streaming recipe generation endpoint"
```

---

### Task 3: Bulk create recipes endpoint

**Files:**
- Modify: `backend/recipes/api.py`
- Modify: `backend/recipes/schemas.py`
- Test: `backend/recipes/tests/test_bulk_create.py`

**Context:**
- Existing `create_recipe` (line 146) handles single recipe creation with `_save_ingredients`, `_save_steps`, and tag setting
- Generated recipes use ingredient names (not IDs) since they may be new
- Need a schema that accepts ingredient names + unit abbreviations and resolves/creates them
- All generated recipes go to TO_TRY list

**Step 1: Write tests**

Create `backend/recipes/tests/test_bulk_create.py`:

```python
import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import Ingredient, Recipe, Tag, Unit
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="bulk@example.com")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = Client()
    client.force_login(user)
    return client, household


@pytest.fixture
def seed_data():
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")
    ing = Ingredient.objects.create(name_en="tomato", name_de="Tomate", category="PRODUCE")
    return unit, ing


@pytest.mark.django_db
def test_bulk_create_recipes(auth_client, seed_data):
    client, household = auth_client
    tag = Tag.objects.create(
        household=household, category="CUISINE", name_en="Italian", name_de="Italienisch"
    )

    recipes = [
        {
            "title": "Recipe One",
            "default_servings": 2,
            "prep_time_minutes": 10,
            "cook_time_minutes": 20,
            "leftover_days": 1,
            "ingredients": [
                {
                    "name_en": "tomato",
                    "name_de": "Tomate",
                    "category": "PRODUCE",
                    "quantity": "200",
                    "unit_abbreviation": "g",
                    "order": 0,
                }
            ],
            "manual_steps": [{"step_number": 1, "instruction": "Cook it"}],
            "machine_steps": [],
            "tag_ids": [str(tag.id)],
        },
        {
            "title": "Recipe Two",
            "default_servings": 4,
            "ingredients": [],
            "manual_steps": [],
            "machine_steps": [],
            "tag_ids": [],
        },
    ]

    response = client.post(
        "/api/v1/recipes/bulk-create/",
        data=json.dumps({"recipes": recipes}),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert len(data["created_ids"]) == 2

    assert Recipe.objects.filter(household=household).count() == 2
    r1 = Recipe.objects.get(title="Recipe One")
    assert r1.list_type == "TO_TRY"
    assert r1.ingredients.count() == 1
    assert r1.tags.count() == 1


@pytest.mark.django_db
def test_bulk_create_creates_new_ingredients(auth_client, seed_data):
    client, household = auth_client
    Unit.objects.create(name_en="piece", name_de="Stück", abbreviation="pcs")

    recipes = [
        {
            "title": "Novel Recipe",
            "default_servings": 2,
            "ingredients": [
                {
                    "name_en": "dragon fruit",
                    "name_de": "Drachenfrucht",
                    "category": "PRODUCE",
                    "quantity": "1",
                    "unit_abbreviation": "pcs",
                    "order": 0,
                }
            ],
            "manual_steps": [],
            "machine_steps": [],
            "tag_ids": [],
        }
    ]

    response = client.post(
        "/api/v1/recipes/bulk-create/",
        data=json.dumps({"recipes": recipes}),
        content_type="application/json",
    )
    assert response.status_code == 201
    assert Ingredient.objects.filter(name_en="dragon fruit").exists()


@pytest.mark.django_db
def test_bulk_create_with_image_base64(auth_client, seed_data):
    client, household = auth_client
    import base64
    from io import BytesIO

    from PIL import Image as PILImage

    img = PILImage.new("RGB", (64, 64), color="red")
    buf = BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()

    recipes = [
        {
            "title": "Photo Recipe",
            "default_servings": 2,
            "ingredients": [],
            "manual_steps": [],
            "machine_steps": [],
            "tag_ids": [],
            "image_base64": b64,
        }
    ]

    response = client.post(
        "/api/v1/recipes/bulk-create/",
        data=json.dumps({"recipes": recipes}),
        content_type="application/json",
    )
    assert response.status_code == 201
    recipe = Recipe.objects.get(title="Photo Recipe")
    assert recipe.image
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/recipes/tests/test_bulk_create.py -v`
Expected: FAIL (no endpoint)

**Step 3: Add bulk create schema and endpoint**

Add to `backend/recipes/schemas.py`:

```python
class GeneratedIngredientIn(Schema):
    name_en: str
    name_de: str
    category: str = "OTHER"
    quantity: str
    unit_abbreviation: str
    order: int = 0


class GeneratedRecipeIn(Schema):
    title: str
    default_servings: int = 2
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    leftover_days: int | None = None
    ingredients: list[GeneratedIngredientIn] = []
    manual_steps: list[CookingStepIn] = []
    machine_steps: list[CookingStepIn] = []
    tag_ids: list[UUID] = []
    image_base64: str | None = None


class BulkCreateRecipesIn(Schema):
    recipes: list[GeneratedRecipeIn]


class BulkCreateRecipesOut(Schema):
    created_ids: list[UUID]
```

Add endpoint to `backend/recipes/api.py` (after the `generate_recipes` endpoint, before Ingredients & Units):

```python
@router.post("/recipes/bulk-create/", response={201: BulkCreateRecipesOut}, tags=["recipes"])
def bulk_create_recipes(request, payload: BulkCreateRecipesIn):
    require_household_member(request)
    household = request.user.active_household
    created_ids = []

    # Pre-load lookups
    unit_map = {u.abbreviation.lower(): u for u in Unit.objects.all()}
    ingredient_map = {i.name_en.lower(): i for i in Ingredient.objects.all()}

    with transaction.atomic():
        for recipe_data in payload.recipes:
            recipe = Recipe.objects.create(
                household=household,
                title=recipe_data.title,
                list_type="TO_TRY",
                default_servings=recipe_data.default_servings,
                prep_time_minutes=recipe_data.prep_time_minutes,
                cook_time_minutes=recipe_data.cook_time_minutes,
                leftover_days=recipe_data.leftover_days,
            )

            # Resolve ingredients (create new ones if needed)
            ri_objects = []
            for ing_data in recipe_data.ingredients:
                ingredient = ingredient_map.get(ing_data.name_en.lower())
                if not ingredient:
                    ingredient = Ingredient.objects.create(
                        name_en=ing_data.name_en,
                        name_de=ing_data.name_de,
                        category=ing_data.category,
                    )
                    ingredient_map[ingredient.name_en.lower()] = ingredient

                unit = unit_map.get(ing_data.unit_abbreviation.lower())
                if not unit:
                    continue  # Skip ingredients with unknown units

                ri_objects.append(
                    RecipeIngredient(
                        recipe=recipe,
                        ingredient=ingredient,
                        quantity=ing_data.quantity,
                        unit=unit,
                        order=ing_data.order,
                    )
                )
            if ri_objects:
                RecipeIngredient.objects.bulk_create(ri_objects)

            # Save steps
            _save_steps(recipe, recipe_data.manual_steps, "MANUAL")
            _save_steps(recipe, recipe_data.machine_steps, "MACHINE")

            # Set tags
            if recipe_data.tag_ids:
                recipe.tags.set(
                    Tag.objects.filter(
                        id__in=recipe_data.tag_ids, household=household
                    )
                )

            # Handle base64 image
            if recipe_data.image_base64:
                try:
                    image_bytes = base64.b64decode(recipe_data.image_base64)
                    img = PILImage.open(BytesIO(image_bytes))
                    _save_image_as_webp(recipe, img)
                except Exception:
                    pass  # Skip invalid images

            created_ids.append(recipe.id)

    return 201, {"created_ids": created_ids}
```

Add `BulkCreateRecipesIn`, `BulkCreateRecipesOut`, and `GeneratedIngredientIn`, `GeneratedRecipeIn` to the import in `api.py`:

```python
from recipes.schemas import (
    BulkCreateRecipesIn,
    BulkCreateRecipesOut,
    # ... existing imports
)
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/recipes/tests/test_bulk_create.py -v`
Expected: PASS

**Step 5: Run all backend tests**

Run: `pytest`
Expected: All pass

**Step 6: Commit**

```bash
git add backend/recipes/api.py backend/recipes/schemas.py backend/recipes/tests/test_bulk_create.py
git commit -m "feat: add bulk recipe creation endpoint with ingredient resolution"
```

---

### Task 4: Frontend types and hooks

**Files:**
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/hooks/useGenerateRecipes.ts`

**Context:**
- Existing types in `frontend/src/api/types.ts`
- Existing hooks pattern in `frontend/src/hooks/useRecipes.ts` — uses `useMutation` from TanStack Query
- API client at `frontend/src/api/client.ts` — `api.post()` for JSON requests
- The generate endpoint returns NDJSON stream, so we need raw `fetch` (not `api.post`) for the streaming response
- The bulk-create endpoint is standard JSON, so `api.post()` works

**Step 1: Add types**

Add to `frontend/src/api/types.ts` before the `// ── Pagination` section:

```typescript
// ── AI Recipe Generation ────────────────────────────────────────

export interface GenerateRecipesPayload {
  count: number;
  tag_ids: string[];
  free_text: string;
  generate_images: boolean;
}

export interface GeneratedIngredient {
  name_en: string;
  name_de: string;
  category: string;
  quantity: string;
  unit_abbreviation: string;
  order: number;
}

export interface GeneratedRecipe {
  title: string;
  default_servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  leftover_days: number | null;
  ingredients: GeneratedIngredient[];
  manual_steps: CookingStepPayload[];
  machine_steps: CookingStepPayload[];
  tag_ids: string[];
  image_base64?: string;
}

export interface GenerateStreamEvent {
  type: "recipe" | "image" | "error" | "done";
  index?: number;
  data?: GeneratedRecipe | { image_base64: string } | undefined;
  message?: string;
}

export interface BulkCreatePayload {
  recipes: (GeneratedRecipe & { image_base64?: string })[];
}

export interface BulkCreateResponse {
  created_ids: string[];
}
```

**Step 2: Create the hook**

Create `frontend/src/hooks/useGenerateRecipes.ts`:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type {
  BulkCreatePayload,
  BulkCreateResponse,
  GenerateRecipesPayload,
  GenerateStreamEvent,
} from "../api/types";

function getCsrfToken(): string {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : "";
}

export async function streamGenerateRecipes(
  payload: GenerateRecipesPayload,
  onEvent: (event: GenerateStreamEvent) => void,
): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const response = await fetch(`${baseUrl}/api/v1/recipes/generate/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as GenerateStreamEvent;
        onEvent(event);
      } catch {
        // Skip malformed lines
      }
    }
  }

  // Process remaining buffer
  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer) as GenerateStreamEvent;
      onEvent(event);
    } catch {
      // Skip
    }
  }
}

export function useBulkCreateRecipes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkCreatePayload) =>
      api.post<BulkCreateResponse>("/api/v1/recipes/bulk-create/", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}
```

**Step 3: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/hooks/useGenerateRecipes.ts
git commit -m "feat: add frontend types and hooks for recipe generation"
```

---

### Task 5: i18n translations

**Files:**
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Context:**
- Existing i18n structure: top-level keys for feature areas
- Add new `"generateRecipes"` section

**Step 1: Add English translations**

Add new `"generateRecipes"` section to `en.json` after the `"recipeImage"` section:

```json
"generateRecipes": {
  "button": "Generate with AI",
  "title": "Generate Recipes",
  "count": "Number of recipes",
  "tags": "Tags",
  "freeText": "Additional instructions",
  "freeTextPlaceholder": "e.g. comfort food for cold weather",
  "generateImages": "Generate photos",
  "generate": "Generate",
  "preview": "Preview",
  "generating": "Generating recipes...",
  "generatingImages": "Generating photos...",
  "saveCount_one": "Save {{count}} recipe",
  "saveCount_other": "Save {{count}} recipes",
  "saved": "{{count}} recipes added to Want to try!",
  "noResults": "No recipes generated. Try adjusting your settings.",
  "configureAi": "Set up AI first",
  "selected": "{{count}} selected"
}
```

Also add to `"errors"` section:
```json
"recipeGenerate": "Couldn't generate recipes. Try again?"
```

**Step 2: Add German translations**

Add new `"generateRecipes"` section to `de.json` after the `"recipeImage"` section:

```json
"generateRecipes": {
  "button": "Mit KI erstellen",
  "title": "Rezepte generieren",
  "count": "Anzahl Rezepte",
  "tags": "Tags",
  "freeText": "Zusätzliche Anweisungen",
  "freeTextPlaceholder": "z.B. Wohlfühlessen für kalte Tage",
  "generateImages": "Fotos erstellen",
  "generate": "Generieren",
  "preview": "Vorschau",
  "generating": "Rezepte werden erstellt...",
  "generatingImages": "Fotos werden erstellt...",
  "saveCount_one": "{{count}} Rezept speichern",
  "saveCount_other": "{{count}} Rezepte speichern",
  "saved": "{{count}} Rezepte zu Ausprobieren hinzugefügt!",
  "noResults": "Keine Rezepte erstellt. Versuche andere Einstellungen.",
  "configureAi": "KI zuerst einrichten",
  "selected": "{{count}} ausgewählt"
}
```

Also add to `"errors"` section:
```json
"recipeGenerate": "Rezepte konnten nicht erstellt werden. Nochmal?"
```

**Step 3: Commit**

```bash
git add frontend/src/i18n/en.json frontend/src/i18n/de.json
git commit -m "feat: add i18n translations for AI recipe generation"
```

---

### Task 6: GenerateRecipesDrawer component

**Files:**
- Create: `frontend/src/components/GenerateRecipesDrawer.tsx`

**Context:**
- Existing `GenerateDrawer.tsx` uses `Drawer` component from `./ui/Drawer` -- reuse same pattern
- Tag dropdowns pattern: see `RecipeListPage.tsx` lines 220-271 for `<details>` based tag category dropdowns
- `useTags()` hook returns `GroupedTags` (Record<TagCategory, Tag[]>)
- `TAG_CATEGORIES` constant from `api/types.ts`: `["DIETARY", "PROTEIN", "CUISINE", "MEAL_TYPE"]`

**Step 1: Create the component**

Create `frontend/src/components/GenerateRecipesDrawer.tsx`:

```tsx
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TAG_CATEGORIES } from "../api/types";
import { useTags } from "../hooks/useTags";
import Drawer from "./ui/Drawer";

interface GenerateRecipesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: {
    count: number;
    tagIds: string[];
    freeText: string;
    generateImages: boolean;
  }) => void;
}

export default function GenerateRecipesDrawer({
  isOpen,
  onClose,
  onGenerate,
}: GenerateRecipesDrawerProps) {
  const { t, i18n } = useTranslation();
  const { data: groupedTags } = useTags();

  const [count, setCount] = useState(10);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [generateImages, setGenerateImages] = useState(true);

  function handleSubmit() {
    onGenerate({
      count,
      tagIds: selectedTags,
      freeText,
      generateImages,
    });
  }

  return (
    <Drawer open={isOpen} onClose={onClose} title={t("generateRecipes.title")}>
      <div className="space-y-4">
        {/* Count */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t("generateRecipes.count")}
          </label>
          <input
            type="range"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full accent-orange-500"
          />
          <div className="mt-1 text-center text-sm font-medium text-gray-700">
            {count}
          </div>
        </div>

        {/* Tags */}
        {groupedTags && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("generateRecipes.tags")}
            </label>
            <div className="flex flex-wrap gap-2">
              {TAG_CATEGORIES.map((category) => {
                const tags = groupedTags[category] || [];
                if (tags.length === 0) return null;
                const selectedInCategory = tags.filter((t) =>
                  selectedTags.includes(t.id),
                );
                return (
                  <details key={category} className="relative">
                    <summary className="flex cursor-pointer select-none items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm">
                      {t(`tags.${category}`)}
                      {selectedInCategory.length > 0 && (
                        <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-xs text-white">
                          {selectedInCategory.length}
                        </span>
                      )}
                    </summary>
                    <div className="absolute z-10 mt-1 max-h-60 min-w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                      {tags.map((tag) => (
                        <label
                          key={tag.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTags.includes(tag.id)}
                            onChange={(e) => {
                              setSelectedTags((prev) =>
                                e.target.checked
                                  ? [...prev, tag.id]
                                  : prev.filter((id) => id !== tag.id),
                              );
                            }}
                            className="rounded accent-orange-500"
                          />
                          <span className="text-sm">
                            {i18n.language === "de" ? tag.name_de : tag.name_en}
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        )}

        {/* Free text */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t("generateRecipes.freeText")}
          </label>
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder={t("generateRecipes.freeTextPlaceholder")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            rows={3}
          />
        </div>

        {/* Generate images */}
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={generateImages}
            onChange={(e) => setGenerateImages(e.target.checked)}
            className="rounded accent-orange-500"
          />
          <span className="text-sm font-medium text-gray-700">
            {t("generateRecipes.generateImages")}
          </span>
        </label>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Sparkles size={16} />
          {t("generateRecipes.generate")}
        </button>
      </div>
    </Drawer>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/GenerateRecipesDrawer.tsx
git commit -m "feat: add GenerateRecipesDrawer component"
```

---

### Task 7: GenerateRecipesPreview component

**Files:**
- Create: `frontend/src/components/GenerateRecipesPreview.tsx`

**Context:**
- Uses `streamGenerateRecipes` from `useGenerateRecipes.ts` for NDJSON streaming
- Uses `useBulkCreateRecipes` for saving
- `GeneratedRecipe` type has ingredients, steps, tag_ids
- Show recipes appearing one by one, images loading in after
- Checkbox per recipe (default checked), "Save X recipes" button
- `Spinner` component at `./ui/Spinner`
- `useToast()` for success/error toasts
- Tags can be displayed using the same color pattern as `RecipeCard` chips

**Step 1: Create the component**

Create `frontend/src/components/GenerateRecipesPreview.tsx`:

```tsx
import { Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { GeneratedRecipe, GenerateRecipesPayload, GenerateStreamEvent } from "../api/types";
import { streamGenerateRecipes, useBulkCreateRecipes } from "../hooks/useGenerateRecipes";
import { useToast } from "../hooks/useToast";
import { Spinner } from "./ui/Spinner";

interface GenerateRecipesPreviewProps {
  config: GenerateRecipesPayload;
  onClose: () => void;
}

interface PreviewRecipe extends GeneratedRecipe {
  selected: boolean;
  imageBase64?: string;
}

export default function GenerateRecipesPreview({
  config,
  onClose,
}: GenerateRecipesPreviewProps) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const bulkCreate = useBulkCreateRecipes();

  const [recipes, setRecipes] = useState<PreviewRecipe[]>([]);
  const [isGenerating, setIsGenerating] = useState(true);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const handleEvent = useCallback((event: GenerateStreamEvent) => {
    if (abortRef.current) return;

    switch (event.type) {
      case "recipe":
        if (event.data && "title" in event.data) {
          setRecipes((prev) => [
            ...prev,
            { ...event.data as GeneratedRecipe, selected: true },
          ]);
        }
        break;
      case "image":
        if (event.index !== undefined && event.data && "image_base64" in event.data) {
          setRecipes((prev) =>
            prev.map((r, i) =>
              i === event.index
                ? { ...r, imageBase64: (event.data as { image_base64: string }).image_base64 }
                : r,
            ),
          );
        }
        break;
      case "error":
        setError(event.message || t("errors.recipeGenerate"));
        setIsGenerating(false);
        break;
      case "done":
        setIsGenerating(false);
        setIsDone(true);
        break;
    }
  }, [t]);

  useEffect(() => {
    abortRef.current = false;
    streamGenerateRecipes(config, handleEvent).catch((err) => {
      if (!abortRef.current) {
        setError(err.message || t("errors.recipeGenerate"));
        setIsGenerating(false);
      }
    });
    return () => {
      abortRef.current = true;
    };
  }, [config, handleEvent, t]);

  function toggleRecipe(index: number) {
    setRecipes((prev) =>
      prev.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r)),
    );
  }

  const selectedRecipes = recipes.filter((r) => r.selected);
  const selectedCount = selectedRecipes.length;

  function handleSave() {
    const toSave = selectedRecipes.map((r) => ({
      title: r.title,
      default_servings: r.default_servings,
      prep_time_minutes: r.prep_time_minutes,
      cook_time_minutes: r.cook_time_minutes,
      leftover_days: r.leftover_days,
      ingredients: r.ingredients,
      manual_steps: r.manual_steps,
      machine_steps: r.machine_steps,
      tag_ids: r.tag_ids,
      image_base64: r.imageBase64,
    }));

    bulkCreate.mutate(
      { recipes: toSave },
      {
        onSuccess: () => {
          addToast(
            t("generateRecipes.saved", { count: selectedCount }),
            "success",
          );
          onClose();
          navigate("/recipes");
        },
        onError: () => {
          addToast(t("errors.recipeSave"), "error");
        },
      },
    );
  }

  function handleCancel() {
    abortRef.current = true;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-semibold">{t("generateRecipes.preview")}</h2>
        <button onClick={handleCancel} className="rounded-lg p-1 hover:bg-gray-100">
          <X size={20} />
        </button>
      </div>

      {/* Recipe list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {recipes.map((recipe, index) => (
          <div
            key={index}
            className={`rounded-lg border p-4 ${
              recipe.selected ? "border-orange-300 bg-orange-50/30" : "border-gray-200 opacity-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={recipe.selected}
                onChange={() => toggleRecipe(index)}
                className="mt-1 rounded accent-orange-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3">
                  {/* Image */}
                  {recipe.imageBase64 ? (
                    <img
                      src={`data:image/png;base64,${recipe.imageBase64}`}
                      alt={recipe.title}
                      className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
                    />
                  ) : config.generate_images && isGenerating ? (
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
                      <Spinner size={16} />
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <h3 className="font-medium text-gray-900">{recipe.title}</h3>
                    <p className="text-xs text-gray-500">
                      {recipe.ingredients.length} {t("ingredients.title").toLowerCase()}
                      {recipe.prep_time_minutes && ` · ${recipe.prep_time_minutes} ${t("recipes.minutes")} ${t("recipes.prepTime").toLowerCase()}`}
                      {recipe.cook_time_minutes && ` · ${recipe.cook_time_minutes} ${t("recipes.minutes")} ${t("recipes.cookTime").toLowerCase()}`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {isGenerating && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-500">
            <Spinner size={16} />
            {recipes.length === 0
              ? t("generateRecipes.generating")
              : isDone
                ? t("generateRecipes.generatingImages")
                : t("generateRecipes.generating")}
          </div>
        )}

        {!isGenerating && recipes.length === 0 && !error && (
          <div className="py-8 text-center text-sm text-gray-500">
            {t("generateRecipes.noResults")}
          </div>
        )}
      </div>

      {/* Footer */}
      {recipes.length > 0 && (
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-500">
              {t("generateRecipes.selected", { count: selectedCount })}
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={selectedCount === 0 || bulkCreate.isPending}
                className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {bulkCreate.isPending ? <Spinner /> : <Sparkles size={16} />}
                {t("generateRecipes.saveCount", { count: selectedCount })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/GenerateRecipesPreview.tsx
git commit -m "feat: add GenerateRecipesPreview component with streaming display"
```

---

### Task 8: RecipeListPage integration

**Files:**
- Modify: `frontend/src/pages/RecipeListPage.tsx`

**Context:**
- Current button row at lines 195-217: search input + SortSelect + "+" new recipe button
- `useAuth()` hook provides `user` with `active_household` containing `ai_enabled` and `gemini_api_key`
- `useAuth` is exported from `../hooks/useAuth`
- Need to import `useAuth`, `GenerateRecipesDrawer`, `GenerateRecipesPreview`, `Sparkles`
- `useNavigate` already imported (line 5)

**Step 1: Add the button and drawer integration**

Add imports at the top of `RecipeListPage.tsx`:

```typescript
import { useAuth } from "../hooks/useAuth";
import GenerateRecipesDrawer from "../components/GenerateRecipesDrawer";
import GenerateRecipesPreview from "../components/GenerateRecipesPreview";
import type { GenerateRecipesPayload } from "../api/types";
import { Sparkles } from "lucide-react";
```

Add state inside the component (after existing state declarations):

```typescript
const { user } = useAuth();
const aiEnabled = user?.active_household?.ai_enabled ?? false;
const aiConfigured = aiEnabled && (user?.active_household?.gemini_api_key ?? "") !== "";

const [showGenerateDrawer, setShowGenerateDrawer] = useState(false);
const [generateConfig, setGenerateConfig] = useState<GenerateRecipesPayload | null>(null);
```

Add handler:

```typescript
function handleGenerate(config: {
  count: number;
  tagIds: string[];
  freeText: string;
  generateImages: boolean;
}) {
  setShowGenerateDrawer(false);
  setGenerateConfig({
    count: config.count,
    tag_ids: config.tagIds,
    free_text: config.freeText,
    generate_images: config.generateImages,
  });
}

function handleGenerateClick() {
  if (!aiConfigured) {
    navigate("/settings");
    return;
  }
  setShowGenerateDrawer(true);
}
```

Add the button in the button row (after the "+" new recipe button, inside the `flex gap-2` div at line 195):

```tsx
{aiEnabled && (
  <button
    type="button"
    onClick={handleGenerateClick}
    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
  >
    <Sparkles size={16} />
    {t("generateRecipes.button")}
  </button>
)}
```

Add drawer and preview at the end of the component, before the closing `</div>`:

```tsx
<GenerateRecipesDrawer
  isOpen={showGenerateDrawer}
  onClose={() => setShowGenerateDrawer(false)}
  onGenerate={handleGenerate}
/>

{generateConfig && (
  <GenerateRecipesPreview
    config={generateConfig}
    onClose={() => setGenerateConfig(null)}
  />
)}
```

**Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/pages/RecipeListPage.tsx
git commit -m "feat: integrate AI recipe generation into RecipeListPage"
```

---

### Task 9: Final integration testing and cleanup

**Files:**
- All files from previous tasks

**Step 1: Run all backend tests**

Run: `pytest`
Expected: All pass

**Step 2: Run frontend tests**

Run: `cd frontend && npm test`
Expected: All pass

**Step 3: Run linting**

Run: `ruff check . --fix && ruff format .`
Run: `cd frontend && npm run lint`
Expected: Clean

**Step 4: Run type checking**

Run: `cd backend && mypy --config-file=../pyproject.toml .`
Run: `cd frontend && npm run build`
Expected: No errors

**Step 5: Verify pre-commit**

Run: `pre-commit run --all-files`
Expected: All pass

**Step 6: Commit any fixes**

If any linting/type fixes were needed:
```bash
git add -A
git commit -m "fix: lint and type fixes for recipe generation"
```
