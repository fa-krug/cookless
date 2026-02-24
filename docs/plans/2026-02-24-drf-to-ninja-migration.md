# DRF to Django Ninja Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Django REST Framework with Django Ninja across the entire API, enabling Pydantic schemas and OpenAPI-driven frontend type generation via Orval.

**Architecture:** Single `NinjaAPI` instance with two routers (`users`, `recipes`). Function-based views replace DRF class-based views. Pydantic `In`/`Out` schemas replace DRF serializers. Permission helpers replace DRF permission classes.

**Tech Stack:** Django 5.1, django-ninja, Pydantic v2, pytest, Django `Client`

**Design doc:** `docs/plans/2026-02-24-drf-to-ninja-migration-design.md`

---

### Task 1: Swap dependencies

**Files:**
- Modify: `requirements.txt`
- Modify: `backend/cookless/settings.py:89-108` (INSTALLED_APPS)
- Modify: `backend/cookless/settings.py:226-237` (REST_FRAMEWORK)

**Step 1: Update requirements.txt**

Replace `djangorestframework>=3.15,<4.0` with `django-ninja>=1.0,<2.0`. Keep all other deps.

```
django>=5.1,<5.2
django-ninja>=1.0,<2.0
django-cors-headers>=4.4,<5.0
django-environ>=0.11,<1.0
whitenoise>=6.7,<7.0
gunicorn>=22.0,<23.0
Pillow>=10.4,<11.0
django-allauth[socialaccount]>=65.0,<66.0
psycopg2-binary>=2.9,<3.0
```

**Step 2: Install new deps**

Run: `pip install -r requirements.txt`
Expected: django-ninja installs successfully

**Step 3: Update settings.py — INSTALLED_APPS**

Remove `"rest_framework"` and `"rest_framework.authtoken"` from INSTALLED_APPS:

```python
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.sites",
    # First-party
    "users",
    "recipes",
    # Third-party
    "corsheaders",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.apple",
]
```

**Step 4: Remove REST_FRAMEWORK settings dict**

Delete lines 226-237 (the entire `REST_FRAMEWORK = { ... }` block and its comment).

**Step 5: Commit**

```bash
git add requirements.txt backend/cookless/settings.py
git commit -m "chore: swap djangorestframework for django-ninja"
```

> **Note:** The app will NOT work after this commit — that's expected. We're doing a big-bang migration and will restore functionality task by task.

---

### Task 2: Auth and permissions layer

**Files:**
- Create: `backend/cookless/auth.py`
- Modify: `backend/users/permissions.py`

**Step 1: Create `backend/cookless/auth.py`**

```python
from django.contrib.auth import get_user_model
from django.http import HttpRequest

from ninja.security import HttpBearer, SessionAuth

User = get_user_model()


class TokenAuth(HttpBearer):
    def authenticate(self, request: HttpRequest, token: str) -> User | None:
        from rest_framework.authtoken.models import Token

        try:
            token_obj = Token.objects.select_related("user").get(key=token)
            return token_obj.user
        except Token.DoesNotExist:
            return None
```

> **IMPORTANT:** We keep `rest_framework.authtoken` as an import-only dependency (the Token model lives in the DB). We removed it from INSTALLED_APPS in Task 1 — we need to **add it back** to INSTALLED_APPS so the Token model's DB table is still managed by Django. Update settings.py to re-add just `"rest_framework.authtoken"` under third-party. Actually — since we removed DRF entirely, the authtoken app won't work without `rest_framework` installed. **Instead**, we'll use Django's built-in session auth only for now, and handle token auth via a simple DB lookup on a custom model later. For this migration, use session auth + a simple bearer token lookup against the existing `authtoken_token` table via raw SQL or a lightweight custom model.
>
> **Simplest approach:** Keep `djangorestframework` installed but only use `rest_framework.authtoken` in INSTALLED_APPS. This avoids a token model migration.

**REVISED Step 1: Update requirements.txt**

Actually keep DRF installed so the `authtoken` app still works:

```
django>=5.1,<5.2
django-ninja>=1.0,<2.0
djangorestframework>=3.15,<4.0
django-cors-headers>=4.4,<5.0
django-environ>=0.11,<1.0
whitenoise>=6.7,<7.0
gunicorn>=22.0,<23.0
Pillow>=10.4,<11.0
django-allauth[socialaccount]>=65.0,<66.0
psycopg2-binary>=2.9,<3.0
```

**REVISED Step 3 from Task 1: INSTALLED_APPS keeps authtoken**

```python
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.sites",
    # First-party
    "users",
    "recipes",
    # Third-party
    "rest_framework.authtoken",
    "corsheaders",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.apple",
]
```

**Step 2: Create `backend/cookless/auth.py`**

```python
from django.contrib.auth import get_user_model
from django.http import HttpRequest

from ninja.security import HttpBearer, SessionAuth

User = get_user_model()


class TokenAuth(HttpBearer):
    def authenticate(self, request: HttpRequest, token: str) -> User | None:
        from rest_framework.authtoken.models import Token

        try:
            token_obj = Token.objects.select_related("user").get(key=token)
            return token_obj.user
        except Token.DoesNotExist:
            return None


# Both auth methods — either one grants access
auth = [SessionAuth(), TokenAuth()]
```

**Step 3: Rewrite `backend/users/permissions.py`**

Replace the entire file:

```python
from ninja.errors import HttpError

from users.models import HouseholdMember


def require_household_member(request):
    """Raises HttpError if user is not an authenticated member of their active household."""
    if not request.user.is_authenticated:
        raise HttpError(401, "Authentication required")
    if not request.user.active_household_id:
        raise HttpError(403, "No active household")
    if not request.user.household_memberships.filter(
        household=request.user.active_household
    ).exists():
        raise HttpError(403, "Not a member of active household")


def require_household_owner(request, household):
    """Raises HttpError if user is not an OWNER of the given household."""
    if not HouseholdMember.objects.filter(
        household=household, user=request.user, role=HouseholdMember.Role.OWNER
    ).exists():
        raise HttpError(403, "Owner access required")
```

**Step 4: Commit**

```bash
git add backend/cookless/auth.py backend/users/permissions.py requirements.txt backend/cookless/settings.py
git commit -m "feat: add Ninja auth classes and permission helpers"
```

---

### Task 3: NinjaAPI instance and URL wiring

**Files:**
- Create: `backend/cookless/api.py`
- Modify: `backend/cookless/urls.py`

**Step 1: Create `backend/cookless/api.py`**

```python
from ninja import NinjaAPI

from cookless.auth import auth

api = NinjaAPI(
    title="Cook Less",
    version="1.0.0",
    auth=auth,
    urls_namespace="api-v1",
)
```

> Routers will be registered here once created in Tasks 4 and 5.

**Step 2: Update `backend/cookless/urls.py`**

```python
"""
URL configuration for cookless project.
"""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import path

from cookless.api import api


def health_check(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health_check, name="health-check"),
    path("api/v1/", api.urls),
]
```

**Step 3: Verify the server starts**

Run: `python backend/manage.py check`
Expected: System check identified no issues

**Step 4: Commit**

```bash
git add backend/cookless/api.py backend/cookless/urls.py
git commit -m "feat: add NinjaAPI instance and wire URLs"
```

---

### Task 4: Users app — schemas and endpoints

**Files:**
- Create: `backend/users/schemas.py`
- Create: `backend/users/api.py`
- Modify: `backend/cookless/api.py` (register router)
- Delete: `backend/users/views.py`
- Delete: `backend/users/serializers.py`
- Delete: `backend/users/urls.py`
- Modify: `backend/users/auth.py`

**Step 1: Create `backend/users/schemas.py`**

```python
from datetime import datetime
from uuid import UUID

from ninja import Schema


class HouseholdSummaryOut(Schema):
    id: UUID
    name: str


class HouseholdMemberOut(Schema):
    id: int
    email: str
    role: str
    joined_at: datetime

    @staticmethod
    def resolve_email(obj):
        return obj.user.email


class HouseholdOut(Schema):
    id: UUID
    name: str
    members: list[HouseholdMemberOut]


class HouseholdCreateIn(Schema):
    name: str


class HouseholdUpdateIn(Schema):
    name: str


class UserOut(Schema):
    id: UUID
    email: str
    preferred_language: str
    settings: dict
    active_household: HouseholdSummaryOut | None


class UserUpdateIn(Schema):
    preferred_language: str | None = None
    settings: dict | None = None
    active_household: UUID | None = None


class InviteOut(Schema):
    code: str
    expires_at: datetime
    household: UUID

    @staticmethod
    def resolve_household(obj):
        return obj.household_id


class MessageOut(Schema):
    detail: str
```

**Step 2: Create `backend/users/api.py`**

```python
from datetime import timedelta
from uuid import UUID

from django.shortcuts import get_object_or_404
from django.utils import timezone

from ninja import Router
from ninja.errors import HttpError

from users.models import Household, HouseholdMember, Invite
from users.permissions import require_household_member, require_household_owner
from users.schemas import (
    HouseholdCreateIn,
    HouseholdOut,
    HouseholdUpdateIn,
    InviteOut,
    MessageOut,
    UserOut,
    UserUpdateIn,
)

router = Router()

# ── User Me ──────────────────────────────────────────────────────────


@router.get("/users/me/", response=UserOut, tags=["users"])
def get_me(request):
    return request.user


@router.patch("/users/me/", response=UserOut, tags=["users"])
def update_me(request, payload: UserUpdateIn):
    user = request.user
    if payload.preferred_language is not None:
        user.preferred_language = payload.preferred_language
    if payload.settings is not None:
        user.settings = payload.settings
    if payload.active_household is not None:
        household = Household.objects.filter(pk=payload.active_household).first()
        if not household:
            raise HttpError(400, "Household not found.")
        if not HouseholdMember.objects.filter(household=household, user=user).exists():
            raise HttpError(400, "You are not a member of this household.")
        user.active_household = household
    elif "active_household" in request.body.decode():
        # Explicit null was sent
        import json

        body = json.loads(request.body)
        if "active_household" in body and body["active_household"] is None:
            user.active_household = None
    user.save()
    return user


# ── Households ───────────────────────────────────────────────────────


@router.get("/households/", response=list[HouseholdOut], tags=["households"])
def list_households(request):
    return (
        Household.objects.filter(members__user=request.user)
        .prefetch_related("members__user")
        .distinct()
    )


@router.post("/households/", response={201: HouseholdOut}, tags=["households"])
def create_household(request, payload: HouseholdCreateIn):
    household = Household.objects.create(name=payload.name)
    HouseholdMember.objects.create(
        household=household,
        user=request.user,
        role=HouseholdMember.Role.OWNER,
    )
    if not request.user.active_household:
        request.user.active_household = household
        request.user.save()
    return household


@router.patch("/households/{household_id}/", response=HouseholdOut, tags=["households"])
def update_household(request, household_id: UUID, payload: HouseholdUpdateIn):
    household = get_object_or_404(
        Household.objects.filter(members__user=request.user), pk=household_id
    )
    require_household_owner(request, household)
    household.name = payload.name
    household.save()
    return household


@router.post("/households/{household_id}/switch/", response=MessageOut, tags=["households"])
def switch_household(request, household_id: UUID):
    household = get_object_or_404(Household, pk=household_id)
    if not HouseholdMember.objects.filter(household=household, user=request.user).exists():
        raise HttpError(403, "You are not a member of this household.")
    request.user.active_household = household
    request.user.save()
    return {"detail": "Switched active household."}


# ── Invites ──────────────────────────────────────────────────────────


@router.post(
    "/households/{household_id}/invites/", response={201: InviteOut}, tags=["invites"]
)
def create_invite(request, household_id: UUID):
    household = get_object_or_404(
        Household.objects.filter(members__user=request.user), pk=household_id
    )
    require_household_owner(request, household)
    invite = Invite.objects.create(
        household=household,
        created_by=request.user,
        expires_at=timezone.now() + timedelta(days=7),
    )
    return invite


@router.post("/invites/{code}/accept/", response=MessageOut, tags=["invites"])
def accept_invite(request, code: str):
    invite = get_object_or_404(Invite, code=code)
    if invite.is_expired:
        raise HttpError(400, "This invite has expired.")
    if invite.used_by is not None:
        raise HttpError(400, "This invite has already been used.")
    if HouseholdMember.objects.filter(household=invite.household, user=request.user).exists():
        raise HttpError(400, "You are already a member of this household.")
    HouseholdMember.objects.create(
        household=invite.household,
        user=request.user,
        role=HouseholdMember.Role.MEMBER,
    )
    invite.used_by = request.user
    invite.save()
    if request.user.active_household is None:
        request.user.active_household = invite.household
        request.user.save()
    return {"detail": "Joined household."}


# ── Member removal ───────────────────────────────────────────────────


@router.delete(
    "/households/{household_id}/members/{member_pk}/",
    response={204: None},
    tags=["households"],
)
def delete_member(request, household_id: UUID, member_pk: int):
    household = get_object_or_404(
        Household.objects.filter(members__user=request.user), pk=household_id
    )
    require_household_owner(request, household)
    member = get_object_or_404(HouseholdMember, pk=member_pk, household=household)
    if member.user == request.user:
        raise HttpError(400, "Cannot remove yourself from the household.")
    member.delete()
    return None


# ── Auth ─────────────────────────────────────────────────────────────


@router.post("/auth/apple/", auth=None, response=MessageOut, tags=["auth"])
def apple_login(request):
    raise HttpError(
        501, "Apple Sign-In not yet configured. Set APPLE_CLIENT_ID env var."
    )


@router.post("/auth/logout/", response=MessageOut, tags=["auth"])
def logout_view(request):
    from django.contrib.auth import logout

    logout(request)
    return {"detail": "Successfully logged out."}
```

**Step 3: Register the router in `backend/cookless/api.py`**

```python
from ninja import NinjaAPI

from cookless.auth import auth

api = NinjaAPI(
    title="Cook Less",
    version="1.0.0",
    auth=auth,
    urls_namespace="api-v1",
)

from users.api import router as users_router

api.add_router("", users_router)
```

**Step 4: Delete old DRF files**

```bash
rm backend/users/views.py backend/users/serializers.py backend/users/urls.py
```

**Step 5: Rewrite `backend/users/auth.py`**

The old `auth.py` had DRF-based `AppleLoginView` and `LogoutView`. These are now in `users/api.py`. Replace `auth.py` with an empty file or delete it (the auth views live in `api.py` now).

```bash
rm backend/users/auth.py
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: migrate users app from DRF to Django Ninja"
```

---

### Task 5: Recipes app — schemas and endpoints

**Files:**
- Create: `backend/recipes/schemas.py`
- Create: `backend/recipes/api.py`
- Modify: `backend/cookless/api.py` (register router)
- Delete: `backend/recipes/views.py`
- Delete: `backend/recipes/serializers.py`
- Delete: `backend/recipes/urls.py`

**Step 1: Create `backend/recipes/schemas.py`**

```python
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from ninja import Schema


class UnitOut(Schema):
    id: int
    name_de: str
    name_en: str
    abbreviation: str


class IngredientOut(Schema):
    id: int
    name_de: str
    name_en: str
    category: str


class IngredientCreateIn(Schema):
    name_de: str
    name_en: str
    category: str = "OTHER"


class RecipeIngredientOut(Schema):
    id: int
    ingredient: int
    quantity: Decimal
    unit: int
    order: int

    @staticmethod
    def resolve_ingredient(obj):
        return obj.ingredient_id

    @staticmethod
    def resolve_unit(obj):
        return obj.unit_id


class CookingStepOut(Schema):
    id: int
    step_number: int
    instruction: str


class RecipeOut(Schema):
    id: UUID
    title: str
    list_type: str
    default_servings: int
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    ingredients: list[RecipeIngredientOut]
    manual_steps: list[CookingStepOut]
    machine_steps: list[CookingStepOut]
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_manual_steps(obj):
        return obj.steps.filter(method="MANUAL")

    @staticmethod
    def resolve_machine_steps(obj):
        return obj.steps.filter(method="MACHINE")


class CookingStepIn(Schema):
    step_number: int
    instruction: str


class RecipeIngredientIn(Schema):
    ingredient: int
    quantity: Decimal
    unit: int
    order: int = 0


class RecipeCreateIn(Schema):
    title: str
    list_type: str
    default_servings: int = 2
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    ingredients: list[RecipeIngredientIn] = []
    manual_steps: list[CookingStepIn] = []
    machine_steps: list[CookingStepIn] = []
```

**Step 2: Create `backend/recipes/api.py`**

```python
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
def list_recipes(request, list_type: str = None):
    require_household_member(request)
    qs = Recipe.objects.filter(
        household=request.user.active_household
    ).prefetch_related("ingredients", "steps")
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
    recipe = get_object_or_404(
        Recipe, pk=recipe_id, household=request.user.active_household
    )
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
    recipe = get_object_or_404(
        Recipe, pk=recipe_id, household=request.user.active_household
    )
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
    recipe = get_object_or_404(
        Recipe, pk=recipe_id, household=request.user.active_household
    )
    recipe.delete()
    return None


@router.post("/recipes/{recipe_id}/move/", response=RecipeOut, tags=["recipes"])
def move_recipe(request, recipe_id: UUID):
    require_household_member(request)
    recipe = get_object_or_404(
        Recipe, pk=recipe_id, household=request.user.active_household
    )
    recipe.list_type = "TO_TRY" if recipe.list_type == "KNOWN" else "KNOWN"
    recipe.save()
    return recipe


@router.get("/recipes/{recipe_id}/steps/", response=list[CookingStepOut], tags=["recipes"])
def list_steps(request, recipe_id: UUID, method: str = None):
    require_household_member(request)
    recipe = get_object_or_404(
        Recipe, pk=recipe_id, household=request.user.active_household
    )
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
```

**Step 3: Register the router in `backend/cookless/api.py`**

```python
from ninja import NinjaAPI

from cookless.auth import auth

api = NinjaAPI(
    title="Cook Less",
    version="1.0.0",
    auth=auth,
    urls_namespace="api-v1",
)

from recipes.api import router as recipes_router
from users.api import router as users_router

api.add_router("", users_router)
api.add_router("", recipes_router)
```

**Step 4: Delete old DRF files**

```bash
rm backend/recipes/views.py backend/recipes/serializers.py backend/recipes/urls.py
```

**Step 5: Verify the server starts**

Run: `python backend/manage.py check`
Expected: System check identified no issues

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: migrate recipes app from DRF to Django Ninja"
```

---

### Task 6: Migrate test fixtures and helpers

**Files:**
- Modify: `backend/users/tests/test_api.py` (fixtures only)
- Modify: `backend/users/tests/test_auth.py`
- Modify: `backend/users/tests/test_permissions.py`
- Modify: `backend/recipes/tests/test_api.py` (fixtures only)
- Modify: `backend/recipes/tests/test_steps_api.py` (fixtures only)

This task updates ALL test files to use Django's `Client` instead of DRF's `APIClient`. The key changes across all files:

1. Replace `from rest_framework.test import APIClient` → `from django.test import Client`
2. Replace `APIClient()` → `Client()`
3. Replace `client.force_authenticate(user=user)` → `client.force_login(user)`
4. Replace `response.data` → `response.json()`
5. Replace `format="json"` → `content_type="application/json"` and wrap data with `json.dumps()`
6. Replace `from rest_framework import status` → use raw int status codes or `from http import HTTPStatus`
7. Replace `client.credentials(HTTP_AUTHORIZATION=...)` → `client.defaults["HTTP_AUTHORIZATION"] = ...`

**Step 1: Rewrite `backend/users/tests/test_api.py`**

Full file — replace imports and all `APIClient` usage:

```python
import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client
from django.utils import timezone

import pytest

from users.models import Household, HouseholdMember, Invite

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(email="alice@example.com", apple_id="apple_a")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(email="bob@example.com", apple_id="apple_b")


@pytest.fixture
def api_client():
    return Client()


@pytest.fixture
def household(db, user):
    h = Household.objects.create(name="Alice's Kitchen")
    HouseholdMember.objects.create(household=h, user=user, role=HouseholdMember.Role.OWNER)
    user.active_household = h
    user.save()
    return h


# ── GET /api/v1/users/me/ ──────────────────────────────────────────


@pytest.mark.django_db
class TestUserMe:
    def test_get_me_unauthenticated(self, api_client):
        resp = api_client.get("/api/v1/users/me/")
        assert resp.status_code in (401, 403)

    def test_get_me(self, api_client, user):
        api_client.force_login(user)
        resp = api_client.get("/api/v1/users/me/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "alice@example.com"
        assert data["preferred_language"] == "en"
        assert data["settings"] == {"default_servings": 2, "known_new_ratio": 0.7, "plan_days": 7}
        assert data["active_household"] is None

    def test_get_me_with_active_household(self, api_client, user, household):
        api_client.force_login(user)
        resp = api_client.get("/api/v1/users/me/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["active_household"]["name"] == "Alice's Kitchen"

    def test_patch_me_language(self, api_client, user):
        api_client.force_login(user)
        resp = api_client.patch(
            "/api/v1/users/me/",
            json.dumps({"preferred_language": "de"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        user.refresh_from_db()
        assert user.preferred_language == "de"

    def test_patch_me_settings(self, api_client, user):
        api_client.force_login(user)
        new_settings = {"default_servings": 4, "known_new_ratio": 0.5, "plan_days": 5}
        resp = api_client.patch(
            "/api/v1/users/me/",
            json.dumps({"settings": new_settings}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        user.refresh_from_db()
        assert user.settings == new_settings

    def test_patch_me_active_household_by_uuid(self, api_client, user, household):
        api_client.force_login(user)
        user.active_household = None
        user.save()
        resp = api_client.patch(
            "/api/v1/users/me/",
            json.dumps({"active_household": str(household.pk)}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        user.refresh_from_db()
        assert user.active_household == household

    def test_patch_me_active_household_non_member_rejected(self, api_client, user, other_user):
        """Users cannot set active_household to a household they are not a member of."""
        h = Household.objects.create(name="Not Mine")
        HouseholdMember.objects.create(
            household=h, user=other_user, role=HouseholdMember.Role.OWNER
        )
        api_client.force_login(user)
        resp = api_client.patch(
            "/api/v1/users/me/",
            json.dumps({"active_household": str(h.pk)}),
            content_type="application/json",
        )
        assert resp.status_code == 400


# ── Household CRUD ──────────────────────────────────────────────────


@pytest.mark.django_db
class TestHouseholdListCreate:
    def test_create_household(self, api_client, user):
        api_client.force_login(user)
        resp = api_client.post(
            "/api/v1/households/",
            json.dumps({"name": "New Home"}),
            content_type="application/json",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Home"
        h = Household.objects.get(pk=data["id"])
        membership = HouseholdMember.objects.get(household=h, user=user)
        assert membership.role == HouseholdMember.Role.OWNER
        user.refresh_from_db()
        assert user.active_household == h

    def test_create_household_does_not_overwrite_active(self, api_client, user, household):
        """Creating a second household should not overwrite existing active_household."""
        api_client.force_login(user)
        resp = api_client.post(
            "/api/v1/households/",
            json.dumps({"name": "Second Home"}),
            content_type="application/json",
        )
        assert resp.status_code == 201
        user.refresh_from_db()
        assert user.active_household == household

    def test_list_households(self, api_client, user, household):
        api_client.force_login(user)
        resp = api_client.get("/api/v1/households/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Alice's Kitchen"

    def test_list_households_only_own(self, api_client, user, other_user):
        """Users should only see households they are a member of."""
        h1 = Household.objects.create(name="H1")
        HouseholdMember.objects.create(household=h1, user=user, role=HouseholdMember.Role.OWNER)
        h2 = Household.objects.create(name="H2")
        HouseholdMember.objects.create(
            household=h2, user=other_user, role=HouseholdMember.Role.OWNER
        )
        api_client.force_login(user)
        resp = api_client.get("/api/v1/households/")
        names = [h["name"] for h in resp.json()]
        assert "H1" in names
        assert "H2" not in names


@pytest.mark.django_db
class TestHouseholdUpdate:
    def test_update_household_name_owner(self, api_client, user, household):
        api_client.force_login(user)
        resp = api_client.patch(
            f"/api/v1/households/{household.pk}/",
            json.dumps({"name": "Renamed Kitchen"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        household.refresh_from_db()
        assert household.name == "Renamed Kitchen"

    def test_update_household_name_member_forbidden(self, api_client, other_user, household):
        HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        api_client.force_login(other_user)
        resp = api_client.patch(
            f"/api/v1/households/{household.pk}/",
            json.dumps({"name": "Nope"}),
            content_type="application/json",
        )
        assert resp.status_code == 403

    def test_update_household_name_non_member_not_found(self, api_client, other_user, household):
        """Non-members get 404 (scoped queryset prevents info disclosure)."""
        api_client.force_login(other_user)
        resp = api_client.patch(
            f"/api/v1/households/{household.pk}/",
            json.dumps({"name": "Nope"}),
            content_type="application/json",
        )
        assert resp.status_code == 404


# ── Switch active household ─────────────────────────────────────────


@pytest.mark.django_db
class TestHouseholdSwitch:
    def test_switch_active_household(self, api_client, user, household):
        h2 = Household.objects.create(name="Second Home")
        HouseholdMember.objects.create(household=h2, user=user, role=HouseholdMember.Role.MEMBER)
        api_client.force_login(user)
        resp = api_client.post(f"/api/v1/households/{h2.pk}/switch/")
        assert resp.status_code == 200
        user.refresh_from_db()
        assert user.active_household == h2

    def test_switch_to_non_member_household_forbidden(self, api_client, user, household):
        h2 = Household.objects.create(name="Not Mine")
        api_client.force_login(user)
        resp = api_client.post(f"/api/v1/households/{h2.pk}/switch/")
        assert resp.status_code == 403


# ── Invite CRUD ─────────────────────────────────────────────────────


@pytest.mark.django_db
class TestInviteCreate:
    def test_create_invite_owner(self, api_client, user, household):
        api_client.force_login(user)
        resp = api_client.post(f"/api/v1/households/{household.pk}/invites/")
        assert resp.status_code == 201
        data = resp.json()
        assert "code" in data
        assert "expires_at" in data
        invite = Invite.objects.get(code=data["code"])
        assert invite.household == household
        assert invite.created_by == user
        assert invite.expires_at > timezone.now() + timedelta(days=6)

    def test_create_invite_member_forbidden(self, api_client, other_user, household):
        HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/households/{household.pk}/invites/")
        assert resp.status_code == 403

    def test_create_invite_non_member_not_found(self, api_client, other_user, household):
        """Non-members get 404 (scoped queryset prevents info disclosure)."""
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/households/{household.pk}/invites/")
        assert resp.status_code == 404


# ── Accept Invite ────────────────────────────────────────────────────


@pytest.mark.django_db
class TestInviteAccept:
    def test_accept_invite(self, api_client, user, household, other_user):
        invite = Invite.objects.create(
            household=household,
            created_by=user,
            expires_at=timezone.now() + timedelta(days=7),
        )
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/invites/{invite.code}/accept/")
        assert resp.status_code == 200
        assert HouseholdMember.objects.filter(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        ).exists()
        invite.refresh_from_db()
        assert invite.used_by == other_user
        other_user.refresh_from_db()
        assert other_user.active_household == household

    def test_accept_invite_does_not_overwrite_active_household(
        self, api_client, user, household, other_user
    ):
        other_h = Household.objects.create(name="Other")
        HouseholdMember.objects.create(
            household=other_h, user=other_user, role=HouseholdMember.Role.OWNER
        )
        other_user.active_household = other_h
        other_user.save()

        invite = Invite.objects.create(
            household=household,
            created_by=user,
            expires_at=timezone.now() + timedelta(days=7),
        )
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/invites/{invite.code}/accept/")
        assert resp.status_code == 200
        other_user.refresh_from_db()
        assert other_user.active_household == other_h

    def test_accept_expired_invite(self, api_client, user, household, other_user):
        invite = Invite.objects.create(
            household=household,
            created_by=user,
            expires_at=timezone.now() - timedelta(days=1),
        )
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/invites/{invite.code}/accept/")
        assert resp.status_code == 400

    def test_accept_used_invite(self, api_client, user, household, other_user):
        third = User.objects.create_user(email="carol@example.com", apple_id="apple_c")
        invite = Invite.objects.create(
            household=household,
            created_by=user,
            expires_at=timezone.now() + timedelta(days=7),
            used_by=third,
        )
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/invites/{invite.code}/accept/")
        assert resp.status_code == 400

    def test_accept_invite_already_member(self, api_client, user, household):
        """Owner tries to accept invite to own household."""
        invite = Invite.objects.create(
            household=household,
            created_by=user,
            expires_at=timezone.now() + timedelta(days=7),
        )
        api_client.force_login(user)
        resp = api_client.post(f"/api/v1/invites/{invite.code}/accept/")
        assert resp.status_code == 400

    def test_accept_invite_not_found(self, api_client, user):
        api_client.force_login(user)
        resp = api_client.post("/api/v1/invites/nonexistent/accept/")
        assert resp.status_code == 404


# ── Remove member ────────────────────────────────────────────────────


@pytest.mark.django_db
class TestHouseholdMemberDelete:
    def test_owner_removes_member(self, api_client, user, household, other_user):
        membership = HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        api_client.force_login(user)
        resp = api_client.delete(f"/api/v1/households/{household.pk}/members/{membership.pk}/")
        assert resp.status_code == 204
        assert not HouseholdMember.objects.filter(pk=membership.pk).exists()

    def test_owner_cannot_remove_self(self, api_client, user, household):
        owner_membership = HouseholdMember.objects.get(household=household, user=user)
        api_client.force_login(user)
        resp = api_client.delete(
            f"/api/v1/households/{household.pk}/members/{owner_membership.pk}/"
        )
        assert resp.status_code == 400

    def test_member_cannot_remove_others(self, api_client, user, household, other_user):
        HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        third = User.objects.create_user(email="carol@example.com", apple_id="apple_c")
        third_membership = HouseholdMember.objects.create(
            household=household, user=third, role=HouseholdMember.Role.MEMBER
        )
        api_client.force_login(other_user)
        resp = api_client.delete(
            f"/api/v1/households/{household.pk}/members/{third_membership.pk}/"
        )
        assert resp.status_code == 403

    def test_non_member_cannot_remove(self, api_client, household, other_user):
        """Non-members get 404 (scoped queryset prevents info disclosure)."""
        owner_membership = HouseholdMember.objects.get(household=household)
        api_client.force_login(other_user)
        resp = api_client.delete(
            f"/api/v1/households/{household.pk}/members/{owner_membership.pk}/"
        )
        assert resp.status_code == 404
```

**Step 2: Rewrite `backend/users/tests/test_auth.py`**

```python
from django.contrib.auth import get_user_model
from django.test import Client

import pytest
from rest_framework.authtoken.models import Token

User = get_user_model()


@pytest.mark.django_db
def test_logout_clears_session():
    client = Client()
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    client.force_login(user)
    response = client.post("/api/v1/auth/logout/")
    assert response.status_code == 200
    assert response.json()["detail"] == "Successfully logged out."


@pytest.mark.django_db
def test_logout_requires_authentication():
    client = Client()
    response = client.post("/api/v1/auth/logout/")
    assert response.status_code in (401, 403)


@pytest.mark.django_db
def test_token_auth():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    token = Token.objects.create(user=user)
    client = Client()
    response = client.get("/api/v1/users/me/", HTTP_AUTHORIZATION=f"Bearer {token.key}")
    assert response.status_code == 200
    assert response.json()["email"] == "test@example.com"


@pytest.mark.django_db
def test_apple_login_endpoint_exists():
    client = Client()
    response = client.post("/api/v1/auth/apple/", content_type="application/json")
    assert response.status_code != 404
    assert response.status_code == 501
```

> **Note:** Token auth header changes from `Token xxx` to `Bearer xxx` (Ninja's `HttpBearer` convention).

**Step 3: Rewrite `backend/users/tests/test_permissions.py`**

```python
from django.contrib.auth import get_user_model
from django.test import RequestFactory

import pytest
from ninja.errors import HttpError

from users.models import Household, HouseholdMember
from users.permissions import require_household_member

User = get_user_model()


@pytest.mark.django_db
def test_permission_denied_no_household():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    factory = RequestFactory()
    request = factory.get("/")
    request.user = user
    with pytest.raises(HttpError) as exc_info:
        require_household_member(request)
    assert exc_info.value.status_code == 403


@pytest.mark.django_db
def test_permission_granted_with_household():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    factory = RequestFactory()
    request = factory.get("/")
    request.user = user
    # Should not raise
    require_household_member(request)
```

**Step 4: Rewrite `backend/recipes/tests/test_api.py`**

```python
import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import Ingredient, Recipe, Unit
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = Client()
    client.force_login(user)
    return client, household


@pytest.mark.django_db
def test_create_recipe(auth_client):
    client, household = auth_client
    response = client.post(
        "/api/v1/recipes/",
        json.dumps(
            {
                "title": "Pancakes",
                "list_type": "KNOWN",
                "default_servings": 2,
                "ingredients": [],
                "manual_steps": [],
                "machine_steps": [],
            }
        ),
        content_type="application/json",
    )
    assert response.status_code == 201
    assert Recipe.objects.filter(household=household).count() == 1


@pytest.mark.django_db
def test_list_recipes_filtered(auth_client):
    client, household = auth_client
    Recipe.objects.create(
        household=household, title="Known1", list_type="KNOWN", default_servings=2
    )
    Recipe.objects.create(household=household, title="Try1", list_type="TO_TRY", default_servings=2)
    response = client.get("/api/v1/recipes/?list_type=KNOWN")
    assert response.status_code == 200
    assert len(response.json()) == 1


@pytest.mark.django_db
def test_other_household_recipes_not_visible(auth_client):
    client, household = auth_client
    other_household = Household.objects.create(name="Other")
    Recipe.objects.create(
        household=other_household, title="Secret", list_type="KNOWN", default_servings=2
    )
    response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    assert len(response.json()) == 0


@pytest.mark.django_db
def test_move_recipe(auth_client):
    client, household = auth_client
    recipe = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    response = client.post(f"/api/v1/recipes/{recipe.id}/move/")
    assert response.status_code == 200
    recipe.refresh_from_db()
    assert recipe.list_type == "TO_TRY"


@pytest.mark.django_db
def test_create_and_read_recipe_with_nested_data(auth_client):
    client, household = auth_client
    ingredient = Ingredient.objects.create(name_en="Flour", name_de="Mehl", category="PANTRY")
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")

    create_response = client.post(
        "/api/v1/recipes/",
        json.dumps(
            {
                "title": "Pancakes",
                "list_type": "KNOWN",
                "default_servings": 4,
                "ingredients": [
                    {"ingredient": ingredient.pk, "quantity": "200.00", "unit": unit.pk, "order": 1},
                ],
                "manual_steps": [
                    {"step_number": 1, "instruction": "Mix ingredients"},
                ],
                "machine_steps": [
                    {"step_number": 1, "instruction": "Blend for 30 seconds"},
                ],
            }
        ),
        content_type="application/json",
    )
    assert create_response.status_code == 201
    recipe_id = create_response.json()["id"]

    get_response = client.get(f"/api/v1/recipes/{recipe_id}/")
    assert get_response.status_code == 200
    data = get_response.json()

    assert data["title"] == "Pancakes"
    assert len(data["ingredients"]) == 1
    assert data["ingredients"][0]["ingredient"] == ingredient.pk
    assert len(data["manual_steps"]) == 1
    assert data["manual_steps"][0]["instruction"] == "Mix ingredients"
    assert len(data["machine_steps"]) == 1
    assert data["machine_steps"][0]["instruction"] == "Blend for 30 seconds"
```

**Step 5: Rewrite `backend/recipes/tests/test_steps_api.py`**

```python
from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import CookingStep, Recipe
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client_fixture():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = Client()
    client.force_login(user)
    return client, household


@pytest.mark.django_db
def test_get_manual_steps(auth_client_fixture):
    client, household = auth_client_fixture
    recipe = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=1, instruction="Mix")
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=2, instruction="Cook")
    CookingStep.objects.create(
        recipe=recipe, method="MACHINE", step_number=1, instruction="Add to MC"
    )

    response = client.get(f"/api/v1/recipes/{recipe.id}/steps/?method=MANUAL")
    assert response.status_code == 200
    assert len(response.json()) == 2


@pytest.mark.django_db
def test_get_machine_steps(auth_client_fixture):
    client, household = auth_client_fixture
    recipe = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=1, instruction="Mix")
    CookingStep.objects.create(
        recipe=recipe, method="MACHINE", step_number=1, instruction="Add to MC"
    )

    response = client.get(f"/api/v1/recipes/{recipe.id}/steps/?method=MACHINE")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["instruction"] == "Add to MC"


@pytest.mark.django_db
def test_get_all_steps_no_filter(auth_client_fixture):
    client, household = auth_client_fixture
    recipe = Recipe.objects.create(
        household=household, title="Pancakes", list_type="KNOWN", default_servings=2
    )
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=1, instruction="Mix")
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=2, instruction="Cook")
    CookingStep.objects.create(
        recipe=recipe, method="MACHINE", step_number=1, instruction="Add to MC"
    )

    response = client.get(f"/api/v1/recipes/{recipe.id}/steps/")
    assert response.status_code == 200
    assert len(response.json()) == 3


@pytest.mark.django_db
def test_steps_recipe_not_in_household(auth_client_fixture):
    client, household = auth_client_fixture
    other_household = Household.objects.create(name="Other")
    recipe = Recipe.objects.create(
        household=other_household, title="Secret", list_type="KNOWN", default_servings=2
    )
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=1, instruction="Mix")

    response = client.get(f"/api/v1/recipes/{recipe.id}/steps/?method=MANUAL")
    assert response.status_code == 404
```

**Step 6: Commit**

```bash
git add -A
git commit -m "test: migrate all tests from DRF APIClient to Django Client"
```

---

### Task 7: Run tests and fix issues

**Step 1: Run the full test suite**

Run: `pytest backend/ -v`
Expected: All tests pass

**Step 2: Fix any failures**

Common issues to watch for:
- **CSRF errors on POST/PATCH/DELETE**: Django's `Client` enforces CSRF by default for session auth. Ninja should handle this, but if tests fail with 403, the `Client` may need `enforce_csrf_checks=False` (which is the default for test client, so this should be fine).
- **Response status codes**: Ninja returns 422 for validation errors (not 400). Check any tests that assert 400 for validation.
- **JSON response shape**: Ninja wraps errors differently than DRF. Error responses use `{"detail": "..."}` which matches our design.
- **Auth header format**: `Bearer` instead of `Token` for HTTP bearer auth.

**Step 3: Verify OpenAPI schema generates**

Run: `python backend/manage.py runserver` and visit `http://localhost:8000/api/v1/docs`
Expected: Swagger UI loads with all endpoints documented

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test failures from Ninja migration"
```

---

### Task 8: Clean up and final verification

**Files:**
- Verify no remaining DRF imports anywhere

**Step 1: Search for remaining DRF imports**

Run: `grep -r "rest_framework" backend/ --include="*.py" | grep -v __pycache__ | grep -v migrations | grep -v authtoken`

Expected: Only `rest_framework.authtoken` imports in `cookless/auth.py` and `test_auth.py`. No other DRF references should remain.

**Step 2: Verify all URL patterns work**

Run: `python backend/manage.py show_urls` (if django-extensions is installed) or just verify via tests.

**Step 3: Run full test suite one more time**

Run: `pytest backend/ -v --tb=short`
Expected: All tests pass

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: clean up remaining DRF references after Ninja migration"
```

---

## Summary of all files changed

### Created
- `backend/cookless/api.py` — NinjaAPI instance
- `backend/cookless/auth.py` — Session + Token auth
- `backend/users/schemas.py` — Pydantic schemas
- `backend/users/api.py` — User/Household/Invite endpoints
- `backend/recipes/schemas.py` — Pydantic schemas
- `backend/recipes/api.py` — Recipe/Ingredient/Unit endpoints

### Deleted
- `backend/users/views.py`
- `backend/users/serializers.py`
- `backend/users/urls.py`
- `backend/users/auth.py`
- `backend/recipes/views.py`
- `backend/recipes/serializers.py`
- `backend/recipes/urls.py`

### Modified
- `requirements.txt` — add django-ninja, keep DRF for authtoken only
- `backend/cookless/settings.py` — update INSTALLED_APPS, remove REST_FRAMEWORK
- `backend/cookless/urls.py` — single api.urls entry point
- `backend/users/permissions.py` — helper functions instead of DRF classes
- `backend/users/tests/test_api.py` — Django Client
- `backend/users/tests/test_auth.py` — Django Client + Bearer token
- `backend/users/tests/test_permissions.py` — pytest.raises(HttpError)
- `backend/recipes/tests/test_api.py` — Django Client
- `backend/recipes/tests/test_steps_api.py` — Django Client

### Unchanged
- All model files
- All migration files
- All admin files
- `pyproject.toml`
- `requirements-dev.txt`
