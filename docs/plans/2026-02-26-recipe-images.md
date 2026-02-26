# Recipe Image Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add image support for recipes with manual upload and AI generation via Gemini.

**Architecture:** Separate image endpoints keep recipe CRUD JSON-only. Upload resizes to WebP via Pillow. AI generate calls Gemini imagen-3.0-generate-002 via urllib. Frontend adds `uploadFile()` helper for FormData. Images appear as thumbnails on recipe cards and hero images on the detail page.

**Tech Stack:** Django Ninja, Pillow, urllib (Gemini HTTP), React, TanStack Query, lucide-react

---

### Task 1: Media serving setup

**Files:**
- Modify: `backend/cookless/urls.py:17-26`
- Modify: `backend/cookless/settings.py:200-202` (verify MEDIA_URL/MEDIA_ROOT already set)

**Step 1: Update SPA catch-all to exclude `/media/`**

In `backend/cookless/urls.py`, add media serving for DEBUG and fix the catch-all regex:

```python
"""
URL configuration for cookless project.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, re_path
from django.views.generic import TemplateView

from cookless.api import api


def health_check(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", health_check, name="health-check"),
    path("api/v1/", api.urls),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Catch-all for SPA routing - must be last
# Excludes /api/ and /media/ paths
urlpatterns += [
    re_path(r"^(?!api/|media/).*$", TemplateView.as_view(template_name="index.html")),
]
```

**Step 2: Verify media settings exist**

Check `backend/cookless/settings.py:200-202` has:
```python
MEDIA_URL = "/media/"
MEDIA_ROOT = DATA_DIR / "media"
```

Already present — no changes needed.

**Step 3: Run tests to verify nothing breaks**

Run: `pytest backend/recipes/tests/test_api.py -v`
Expected: All existing tests PASS

**Step 4: Commit**

```bash
git add backend/cookless/urls.py
git commit -m "feat(images): add media serving and fix SPA catch-all for /media/"
```

---

### Task 2: Add image field to schemas

**Files:**
- Modify: `backend/recipes/schemas.py:44-53` (RecipeListOut)
- Modify: `backend/recipes/schemas.py:67-79` (RecipeOut)

**Step 1: Write the failing test**

Create `backend/recipes/tests/test_image_api.py`:

```python
import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import Recipe
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="img@example.com")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = Client()
    client.force_login(user)
    return client, household, user


@pytest.fixture
def recipe(auth_client):
    _, household, _ = auth_client
    return Recipe.objects.create(
        household=household,
        title="Pasta",
        list_type="KNOWN",
        default_servings=2,
    )


@pytest.mark.django_db
def test_recipe_list_includes_image_field(auth_client, recipe):
    client, _, _ = auth_client
    response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert "image" in item
    assert item["image"] is None


@pytest.mark.django_db
def test_recipe_detail_includes_image_field(auth_client, recipe):
    client, _, _ = auth_client
    response = client.get(f"/api/v1/recipes/{recipe.id}/")
    assert response.status_code == 200
    data = response.json()
    assert "image" in data
    assert data["image"] is None
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/recipes/tests/test_image_api.py::test_recipe_list_includes_image_field -v`
Expected: FAIL with `KeyError: 'image'`

**Step 3: Add image field to schemas**

In `backend/recipes/schemas.py`, add `image` to both `RecipeListOut` and `RecipeOut`:

```python
class RecipeListOut(Schema):
    id: UUID
    title: str
    list_type: str
    default_servings: int
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    leftover_days: int | None = None
    image: str | None = None
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_image(obj, context):
        if obj.image:
            request = context["request"]
            return request.build_absolute_uri(obj.image.url)
        return None
```

Add the same `image` field and `resolve_image` to `RecipeOut` (after `leftover_days`, before `ingredients`):

```python
class RecipeOut(Schema):
    id: UUID
    title: str
    list_type: str
    default_servings: int
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    leftover_days: int | None = None
    image: str | None = None
    ingredients: list[RecipeIngredientOut]
    manual_steps: list[CookingStepOut]
    machine_steps: list[CookingStepOut]
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_image(obj, context):
        if obj.image:
            request = context["request"]
            return request.build_absolute_uri(obj.image.url)
        return None

    @staticmethod
    def resolve_manual_steps(obj):
        if hasattr(obj, "manual_steps_list"):
            return obj.manual_steps_list
        return obj.steps.filter(method="MANUAL")

    @staticmethod
    def resolve_machine_steps(obj):
        if hasattr(obj, "machine_steps_list"):
            return obj.machine_steps_list
        return obj.steps.filter(method="MACHINE")
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/recipes/tests/test_image_api.py -v`
Expected: PASS

**Step 5: Run all existing recipe tests**

Run: `pytest backend/recipes/tests/test_api.py -v`
Expected: All PASS (no regressions)

**Step 6: Commit**

```bash
git add backend/recipes/schemas.py backend/recipes/tests/test_image_api.py
git commit -m "feat(images): add image field to RecipeListOut and RecipeOut schemas"
```

---

### Task 3: Image upload endpoint

**Files:**
- Modify: `backend/recipes/api.py`
- Modify: `backend/recipes/tests/test_image_api.py`

**Step 1: Write the failing tests**

Append to `backend/recipes/tests/test_image_api.py`:

```python
from io import BytesIO

from PIL import Image as PILImage


def _create_test_image(width=200, height=200, format="JPEG"):
    img = PILImage.new("RGB", (width, height), color="red")
    buf = BytesIO()
    img.save(buf, format=format)
    buf.seek(0)
    buf.name = f"test.{format.lower()}"
    return buf


@pytest.mark.django_db
def test_upload_image(auth_client, recipe):
    client, _, _ = auth_client
    img = _create_test_image()
    response = client.post(
        f"/api/v1/recipes/{recipe.id}/image/upload/",
        {"image": img},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["image"] is not None
    assert data["image"].endswith(".webp")


@pytest.mark.django_db
def test_upload_image_replaces_old(auth_client, recipe):
    client, _, _ = auth_client
    img1 = _create_test_image()
    client.post(f"/api/v1/recipes/{recipe.id}/image/upload/", {"image": img1})
    img2 = _create_test_image()
    response = client.post(
        f"/api/v1/recipes/{recipe.id}/image/upload/",
        {"image": img2},
    )
    assert response.status_code == 200
    # Only one image file should exist for this recipe
    recipe.refresh_from_db()
    assert recipe.image


@pytest.mark.django_db
def test_upload_rejects_large_file(auth_client, recipe):
    client, _, _ = auth_client
    # Create a >5MB image
    img = _create_test_image(width=4000, height=4000, format="PNG")
    # Pad to exceed 5MB
    data = img.read()
    padded = data + b"\x00" * (5 * 1024 * 1024 - len(data) + 1)
    buf = BytesIO(padded)
    buf.name = "big.png"
    response = client.post(
        f"/api/v1/recipes/{recipe.id}/image/upload/",
        {"image": buf},
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_upload_rejects_invalid_type(auth_client, recipe):
    client, _, _ = auth_client
    buf = BytesIO(b"not an image")
    buf.name = "test.txt"
    response = client.post(
        f"/api/v1/recipes/{recipe.id}/image/upload/",
        {"image": buf},
    )
    assert response.status_code == 400
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/recipes/tests/test_image_api.py::test_upload_image -v`
Expected: FAIL (endpoint doesn't exist)

**Step 3: Implement the upload endpoint**

Add to `backend/recipes/api.py` (after the existing recipe endpoints, before ingredients section):

```python
import time
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile

from ninja import File, UploadedFile
from PIL import Image as PILImage


MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _process_and_save_image(recipe, uploaded_file):
    """Resize to max 1024px, convert to WebP, save."""
    img = PILImage.open(uploaded_file)
    img.verify()
    uploaded_file.seek(0)
    img = PILImage.open(uploaded_file)

    # Resize if needed
    max_size = 1024
    if max(img.size) > max_size:
        img.thumbnail((max_size, max_size), PILImage.LANCZOS)

    # Convert to RGB if necessary (e.g. RGBA PNGs)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # Save as WebP
    buf = BytesIO()
    img.save(buf, format="WEBP", quality=85)
    buf.seek(0)

    # Delete old image file if it exists
    if recipe.image:
        old_path = Path(settings.MEDIA_ROOT) / recipe.image.name
        if old_path.exists():
            old_path.unlink()

    filename = f"recipes/{recipe.id}_{int(time.time())}.webp"
    recipe.image.save(filename, ContentFile(buf.read()), save=True)


@router.post("/recipes/{recipe_id}/image/upload/", response=RecipeOut, tags=["recipes"])
def upload_recipe_image(request, recipe_id: UUID, image: UploadedFile = File(...)):
    require_household_member(request)
    recipe = get_object_or_404(Recipe, pk=recipe_id, household=request.user.active_household)

    if image.content_type not in ALLOWED_IMAGE_TYPES:
        return api.create_response(request, {"detail": "Invalid file type"}, status=400)

    if image.size > MAX_IMAGE_SIZE:
        return api.create_response(request, {"detail": "File too large (max 5MB)"}, status=400)

    try:
        _process_and_save_image(recipe, image)
    except Exception:
        return api.create_response(request, {"detail": "Invalid image file"}, status=400)

    return recipe
```

Also add the needed imports at the top of `backend/recipes/api.py`:

```python
import time
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile

from ninja import File, UploadedFile
from PIL import Image as PILImage
```

Note: The `upload_recipe_image` endpoint uses `api.create_response()` for error responses. To access `api`, import it:

```python
from cookless.api import api as ninja_api
```

Then use `ninja_api.create_response(...)`. Alternatively, use Django Ninja's `HttpError`:

```python
from ninja.errors import HttpError
raise HttpError(400, "Invalid file type")
```

Use `HttpError` — it matches the existing codebase pattern.

**Step 4: Run tests to verify they pass**

Run: `pytest backend/recipes/tests/test_image_api.py -v`
Expected: All PASS

**Step 5: Run all tests**

Run: `pytest`
Expected: All PASS

**Step 6: Commit**

```bash
git add backend/recipes/api.py backend/recipes/tests/test_image_api.py
git commit -m "feat(images): add POST /recipes/{id}/image/upload/ endpoint"
```

---

### Task 4: Image delete endpoint

**Files:**
- Modify: `backend/recipes/api.py`
- Modify: `backend/recipes/tests/test_image_api.py`

**Step 1: Write the failing test**

Append to `backend/recipes/tests/test_image_api.py`:

```python
@pytest.mark.django_db
def test_delete_image(auth_client, recipe):
    client, _, _ = auth_client
    # Upload first
    img = _create_test_image()
    client.post(f"/api/v1/recipes/{recipe.id}/image/upload/", {"image": img})
    recipe.refresh_from_db()
    assert recipe.image

    # Delete
    response = client.delete(f"/api/v1/recipes/{recipe.id}/image/")
    assert response.status_code == 200
    data = response.json()
    assert data["image"] is None

    recipe.refresh_from_db()
    assert not recipe.image


@pytest.mark.django_db
def test_delete_image_when_none(auth_client, recipe):
    client, _, _ = auth_client
    response = client.delete(f"/api/v1/recipes/{recipe.id}/image/")
    assert response.status_code == 200
    data = response.json()
    assert data["image"] is None
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/recipes/tests/test_image_api.py::test_delete_image -v`
Expected: FAIL (endpoint doesn't exist)

**Step 3: Implement the delete endpoint**

Add to `backend/recipes/api.py`:

```python
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
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/recipes/tests/test_image_api.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add backend/recipes/api.py backend/recipes/tests/test_image_api.py
git commit -m "feat(images): add DELETE /recipes/{id}/image/ endpoint"
```

---

### Task 5: AI image generate endpoint

**Files:**
- Modify: `backend/recipes/api.py`
- Modify: `backend/recipes/tests/test_image_api.py`

**Step 1: Write the failing tests**

Append to `backend/recipes/tests/test_image_api.py`:

```python
import base64
from unittest.mock import patch, MagicMock


def _mock_gemini_response():
    """Create a fake Gemini imagen response with a small red image."""
    img = PILImage.new("RGB", (64, 64), color="green")
    buf = BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return json.dumps({
        "predictions": [{"bytesBase64Encoded": b64}]
    }).encode()


@pytest.mark.django_db
def test_generate_image_success(auth_client, recipe):
    client, household, _ = auth_client
    household.ai_enabled = True
    household.gemini_api_key = "test-key-123"
    household.save()

    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.read.return_value = _mock_gemini_response()
    mock_response.__enter__ = MagicMock(return_value=mock_response)
    mock_response.__exit__ = MagicMock(return_value=False)

    with patch("recipes.api.urllib.request.urlopen", return_value=mock_response):
        response = client.post(f"/api/v1/recipes/{recipe.id}/image/generate/")

    assert response.status_code == 200
    data = response.json()
    assert data["image"] is not None
    assert data["image"].endswith(".webp")


@pytest.mark.django_db
def test_generate_image_ai_disabled(auth_client, recipe):
    client, household, _ = auth_client
    household.ai_enabled = False
    household.save()

    response = client.post(f"/api/v1/recipes/{recipe.id}/image/generate/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_generate_image_no_api_key(auth_client, recipe):
    client, household, _ = auth_client
    household.ai_enabled = True
    household.gemini_api_key = ""
    household.save()

    response = client.post(f"/api/v1/recipes/{recipe.id}/image/generate/")
    assert response.status_code == 400
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/recipes/tests/test_image_api.py::test_generate_image_success -v`
Expected: FAIL (endpoint doesn't exist)

**Step 3: Implement the generate endpoint**

Add to `backend/recipes/api.py`:

```python
import base64
import json as json_lib
import urllib.request
import urllib.error

from ninja.errors import HttpError

GEMINI_IMAGEN_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "imagen-3.0-generate-002:predict"
)

IMAGE_PROMPT_TEMPLATE = """You are a professional food photographer. Generate a photorealistic, \
appetizing overhead shot of the following dish on a clean, modern table setting with natural lighting.

Dish: {title}
Key ingredients: {ingredients}

Style: Top-down food photography, shallow depth of field, warm natural light, minimalist plating \
on a white or neutral ceramic plate. No text, no watermarks, no people."""


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
    ingredient_names = [
        ri.ingredient.name_en for ri in recipe.ingredients.all()[:10]
    ]
    prompt = IMAGE_PROMPT_TEMPLATE.format(
        title=recipe.title,
        ingredients=", ".join(ingredient_names) if ingredient_names else "various",
    )

    # Call Gemini
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

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp_data = json_lib.loads(resp.read())
    except urllib.error.URLError:
        raise HttpError(502, "Image generation failed")
    except TimeoutError:
        raise HttpError(504, "Image generation timed out")

    # Decode the base64 image
    try:
        b64_image = resp_data["predictions"][0]["bytesBase64Encoded"]
        image_bytes = base64.b64decode(b64_image)
    except (KeyError, IndexError):
        raise HttpError(502, "Image generation failed")

    # Process and save
    img = PILImage.open(BytesIO(image_bytes))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    max_size = 1024
    if max(img.size) > max_size:
        img.thumbnail((max_size, max_size), PILImage.LANCZOS)

    buf = BytesIO()
    img.save(buf, format="WEBP", quality=85)
    buf.seek(0)

    # Delete old image
    if recipe.image:
        old_path = Path(settings.MEDIA_ROOT) / recipe.image.name
        if old_path.exists():
            old_path.unlink()

    filename = f"recipes/{recipe.id}_{int(time.time())}.webp"
    recipe.image.save(filename, ContentFile(buf.read()), save=True)

    return recipe
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/recipes/tests/test_image_api.py -v`
Expected: All PASS

**Step 5: Run all tests**

Run: `pytest`
Expected: All PASS

**Step 6: Lint and format**

Run: `ruff check backend/ --fix && ruff format backend/`

**Step 7: Commit**

```bash
git add backend/recipes/api.py backend/recipes/tests/test_image_api.py
git commit -m "feat(images): add POST /recipes/{id}/image/generate/ AI endpoint"
```

---

### Task 6: Frontend API client — uploadFile helper

**Files:**
- Modify: `frontend/src/api/client.ts:72-92`

**Step 1: Add `uploadFile` to the api object**

Add a new method to the `api` object in `frontend/src/api/client.ts`:

```typescript
export const api = {
  // ... existing methods ...

  uploadFile<T>(url: string, file: File, fieldName = "image") {
    const formData = new FormData();
    formData.append(fieldName, file);

    return request<T>(url, {
      method: "POST",
      body: formData,
    });
  },
};
```

But the current `request()` function hardcodes `Content-Type: application/json` and `JSON.stringify(body)`. We need to handle FormData differently.

Update the `request` function in `frontend/src/api/client.ts`:

Change lines 39-40 and 52:

```typescript
async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...(extraHeaders as Record<string, string>),
  };

  const isFormData = body instanceof FormData;

  if (body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const method = (rest.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    headers["X-CSRFToken"] = getCsrfToken();
  }

  const response = await fetch(`${BASE_URL}${url}`, {
    credentials: "include",
    ...rest,
    headers,
    body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  // ... rest unchanged ...
}
```

Then add the `uploadFile` method to the `api` object:

```typescript
export const api = {
  // ... existing methods ...

  uploadFile<T>(url: string, file: File, fieldName = "image") {
    const formData = new FormData();
    formData.append(fieldName, file);
    return request<T>(url, { method: "POST", body: formData as unknown });
  },
};
```

**Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(images): add FormData support and uploadFile to API client"
```

---

### Task 7: Frontend types update

**Files:**
- Modify: `frontend/src/api/types.ts:79-104`

**Step 1: Add `image` to RecipeSummary and Recipe**

In `frontend/src/api/types.ts`, add `image: string | null` to both interfaces:

```typescript
export interface RecipeSummary {
  id: string;
  title: string;
  list_type: ListType;
  default_servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  leftover_days: number | null;
  image: string | null;
  created_at: string;
  updated_at: string;
}

export interface Recipe {
  id: string;
  title: string;
  list_type: ListType;
  default_servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  leftover_days: number | null;
  image: string | null;
  ingredients: RecipeIngredient[];
  manual_steps: CookingStep[];
  machine_steps: CookingStep[];
  created_at: string;
  updated_at: string;
}
```

**Step 2: Run lint and type check**

Run: `cd frontend && npm run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat(images): add image field to RecipeSummary and Recipe types"
```

---

### Task 8: Frontend — useRecipeImage hook

**Files:**
- Create: `frontend/src/hooks/useRecipeImage.ts`

**Step 1: Create the hook**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Recipe } from "../api/types";

export function useUploadRecipeImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      api.uploadFile<Recipe>(`/api/v1/recipes/${id}/image/upload/`, file),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipes", variables.id] });
    },
  });
}

export function useGenerateRecipeImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.post<Recipe>(`/api/v1/recipes/${id}/image/generate/`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipes", id] });
    },
  });
}

export function useDeleteRecipeImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<Recipe>(`/api/v1/recipes/${id}/image/`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipes", id] });
    },
  });
}
```

**Step 2: Run lint**

Run: `cd frontend && npm run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/hooks/useRecipeImage.ts
git commit -m "feat(images): add useRecipeImage hooks for upload/generate/delete"
```

---

### Task 9: Frontend i18n keys

**Files:**
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Add recipeImage namespace to en.json**

Add after the `"ai"` section:

```json
"recipeImage": {
  "upload": "Upload Photo",
  "generate": "Generate with AI",
  "remove": "Remove Photo",
  "generating": "Generating...",
  "uploadFailed": "Couldn't upload the photo.",
  "generateFailed": "Couldn't generate the photo.",
  "noImage": "No photo yet"
}
```

**Step 2: Add recipeImage namespace to de.json**

```json
"recipeImage": {
  "upload": "Foto hochladen",
  "generate": "Mit KI erstellen",
  "remove": "Foto entfernen",
  "generating": "Wird erstellt...",
  "uploadFailed": "Foto konnte nicht hochgeladen werden.",
  "generateFailed": "Foto konnte nicht erstellt werden.",
  "noImage": "Noch kein Foto"
}
```

**Step 3: Commit**

```bash
git add frontend/src/i18n/en.json frontend/src/i18n/de.json
git commit -m "feat(images): add recipeImage i18n keys (en + de)"
```

---

### Task 10: RecipeCard — thumbnail image

**Files:**
- Modify: `frontend/src/components/RecipeCard.tsx`

**Step 1: Add image thumbnail to RecipeCard**

Update `frontend/src/components/RecipeCard.tsx` to show a thumbnail when image exists, or a placeholder icon when it doesn't:

```tsx
import { Trash2, UtensilsCrossed } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { RecipeSummary } from "../api/types";

interface RecipeCardProps {
  recipe: RecipeSummary;
  onDelete: (id: string) => void;
  highlight?: boolean;
}

export default function RecipeCard({ recipe, onDelete, highlight }: RecipeCardProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlight && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight]);

  return (
    <div
      ref={highlight ? ref : undefined}
      className={`flex min-w-0 items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${
        highlight ? "animate-highlight" : ""
      }`}
    >
      <Link to={`/recipes/${recipe.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        {recipe.image ? (
          <img
            src={recipe.image}
            alt={recipe.title}
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gray-100">
            <UtensilsCrossed size={24} className="text-gray-400" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-lg font-medium text-gray-900">{recipe.title}</h3>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gray-500">
            {recipe.prep_time_minutes != null && (
              <span>
                {t("recipes.prepTime")}: {recipe.prep_time_minutes} {t("recipes.minutes")}
              </span>
            )}
            {recipe.cook_time_minutes != null && (
              <span>
                {t("recipes.cookTime")}: {recipe.cook_time_minutes} {t("recipes.minutes")}
              </span>
            )}
            <span>
              {t("recipes.servings")}: {recipe.default_servings}
            </span>
          </div>
        </div>
      </Link>
      <button
        onClick={() => onDelete(recipe.id)}
        className="ml-3 shrink-0 rounded-md p-2 text-red-600 hover:bg-red-50"
        aria-label={`${t("common.delete")} ${recipe.title}`}
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}
```

**Step 2: Run lint**

Run: `cd frontend && npm run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/components/RecipeCard.tsx
git commit -m "feat(images): add thumbnail to RecipeCard with placeholder"
```

---

### Task 11: RecipeDetailPage — image section with upload/generate/remove

**Files:**
- Modify: `frontend/src/pages/RecipeDetailPage.tsx`

**Step 1: Add image section to RecipeForm**

In `frontend/src/pages/RecipeDetailPage.tsx`, update the `RecipeForm` component:

1. Add imports at the top:

```typescript
import { ArrowLeftRight, ArrowLeft, Camera, Save, Sparkles, Trash2, Upload, UtensilsCrossed } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useDeleteRecipeImage, useGenerateRecipeImage, useUploadRecipeImage } from "../hooks/useRecipeImage";
```

2. Inside `RecipeForm`, add the image mutation hooks and file input ref:

```typescript
const uploadImage = useUploadRecipeImage();
const generateImage = useGenerateRecipeImage();
const deleteImage = useDeleteRecipeImage();
const fileInputRef = useRef<HTMLInputElement>(null);
const { user } = useAuth();
const household = user?.active_household;
const imageInProgress = uploadImage.isPending || generateImage.isPending;
```

3. Add handlers:

```typescript
function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  uploadImage.mutate(
    { id: recipeId, file },
    {
      onError: () => addToast(t("recipeImage.uploadFailed"), "error"),
    },
  );
  // Reset input so same file can be re-selected
  e.target.value = "";
}

function handleGenerateImage() {
  if (!household?.ai_enabled) return;
  if (!household?.gemini_api_key) {
    navigate("/settings");
    return;
  }
  generateImage.mutate(recipeId, {
    onError: () => addToast(t("recipeImage.generateFailed"), "error"),
  });
}

function handleDeleteImage() {
  deleteImage.mutate(recipeId, {
    onError: () => addToast(t("recipeImage.uploadFailed"), "error"),
  });
}
```

4. Add the image section in the JSX, between the header and the form:

```tsx
{/* Image section */}
<div className="mt-4">
  {recipe.image ? (
    <img
      src={recipe.image}
      alt={recipe.title}
      className="h-48 w-full rounded-lg object-cover"
    />
  ) : (
    <div className="flex h-48 w-full items-center justify-center rounded-lg bg-gray-100">
      <UtensilsCrossed size={48} className={`text-gray-400 ${generateImage.isPending ? "animate-pulse" : ""}`} />
    </div>
  )}

  {/* Image action buttons */}
  <div className="mt-2 flex gap-2">
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      onChange={handleUploadImage}
      className="hidden"
    />
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      disabled={imageInProgress}
      className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {uploadImage.isPending ? <Spinner /> : <Upload size={14} />}
      {t("recipeImage.upload")}
    </button>

    {household?.ai_enabled && (
      <button
        type="button"
        onClick={handleGenerateImage}
        disabled={imageInProgress}
        className="flex items-center gap-1 rounded-md border border-orange-300 px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50 disabled:opacity-50"
      >
        {generateImage.isPending ? <Spinner /> : <Sparkles size={14} />}
        {generateImage.isPending ? t("recipeImage.generating") : t("recipeImage.generate")}
      </button>
    )}

    {recipe.image && (
      <button
        type="button"
        onClick={handleDeleteImage}
        disabled={imageInProgress}
        className="flex items-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        <Trash2 size={14} />
        {t("recipeImage.remove")}
      </button>
    )}
  </div>
</div>
```

**Step 2: Run lint and build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS

**Step 3: Run frontend tests**

Run: `cd frontend && npm test`
Expected: PASS (existing tests should not break)

**Step 4: Commit**

```bash
git add frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat(images): add image section to RecipeDetailPage with upload/generate/remove"
```

---

### Task 12: Update documentation

**Files:**
- Modify: `backend/CLAUDE.md`
- Modify: `frontend/CLAUDE.md`

**Step 1: Update backend CLAUDE.md**

Add the three new endpoints to the Recipes table in `backend/CLAUDE.md`:

```markdown
| POST | `/recipes/{id}/image/upload/` | Upload recipe image (multipart) |
| POST | `/recipes/{id}/image/generate/` | AI-generate recipe image |
| DELETE | `/recipes/{id}/image/` | Remove recipe image |
```

**Step 2: Update frontend CLAUDE.md**

Add `useRecipeImage.ts` to the hooks section:

```markdown
    useRecipeImage.ts    # useUploadRecipeImage, useGenerateRecipeImage, useDeleteRecipeImage
```

Add `recipeImage` to the i18n top-level keys list.

**Step 3: Run lint**

Run: `ruff check backend/ --fix && ruff format backend/`
Expected: Clean

**Step 4: Commit**

```bash
git add backend/CLAUDE.md frontend/CLAUDE.md
git commit -m "docs: add recipe image endpoints and hooks to CLAUDE.md"
```

---

### Task 13: Final integration test

**Step 1: Run all backend tests**

Run: `pytest -v`
Expected: All PASS

**Step 2: Run all frontend tests**

Run: `cd frontend && npm test`
Expected: All PASS

**Step 3: Run linters**

Run: `ruff check backend/ --fix && ruff format backend/ && cd frontend && npm run lint`
Expected: Clean

**Step 4: Build frontend**

Run: `cd frontend && npm run build`
Expected: PASS

**Step 5: Final commit if any lint fixes**

```bash
git add -A
git commit -m "chore: lint fixes"
```
