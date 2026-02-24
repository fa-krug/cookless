# Design: Migrate from Django REST Framework to Django Ninja

**Date:** 2026-02-24
**Status:** Completed
**Motivation:** Better developer experience, auto-generated TypeScript types for the frontend via Orval

## Decision Summary

Big-bang replacement of DRF with Django Ninja using flat function-based views and Pydantic schemas. No incremental migration — the API surface is small enough (~17 endpoints) to swap in one pass.

## 1. Project Structure & Routing

Single `NinjaAPI` instance in `cookless/api.py`, two routers:

```
cookless/api.py          # NinjaAPI(title="Cook Less", version="1.0.0")
cookless/auth.py         # TokenAuth, session auth config
users/api.py             # Router for users, households, auth, invites
users/schemas.py         # Pydantic In/Out schemas
recipes/api.py           # Router for recipes, ingredients, units
recipes/schemas.py       # Pydantic In/Out schemas
```

URL wiring consolidates to a single entry point:

```python
# cookless/urls.py
from cookless.api import api

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health_check),
    path("api/v1/", api.urls),
]
```

All existing URL paths stay the same (`/api/v1/recipes/`, `/api/v1/users/me/`, etc.).

**Removed files:**
- `users/urls.py`
- `recipes/urls.py`
- `users/views.py`
- `recipes/views.py`
- `users/serializers.py`
- `recipes/serializers.py`

## 2. Pydantic Schemas

Separate `In` (request) and `Out` (response) schemas replace DRF serializers. This gives Orval clean, distinct TypeScript types for requests and responses.

### users/schemas.py

```python
# Read schemas
HouseholdSummaryOut     # id (UUID), name (str)
HouseholdMemberOut      # id (int), email (str), role (str), joined_at (datetime)
HouseholdOut            # id (UUID), name (str), members (list[HouseholdMemberOut])
UserOut                 # id (UUID), email (str), preferred_language (str),
                        # settings (dict), active_household (HouseholdSummaryOut | None)
InviteOut               # code (str), expires_at (datetime), household (UUID)

# Write schemas
UserUpdateIn            # preferred_language (str | None), settings (dict | None),
                        # active_household (UUID | None)
HouseholdCreateIn       # name (str)
HouseholdUpdateIn       # name (str)
```

### recipes/schemas.py

```python
# Read schemas
UnitOut                 # id (int), name_de (str), name_en (str), abbreviation (str)
IngredientOut           # id (int), name_de (str), name_en (str), category (str)
RecipeIngredientOut     # id (int), ingredient (IngredientOut), quantity (Decimal),
                        # unit (UnitOut), order (int)
CookingStepOut          # id (int), step_number (int), instruction (str)
RecipeOut               # id (UUID), title (str), list_type (str), default_servings (int),
                        # prep_time_minutes (int | None), cook_time_minutes (int | None),
                        # ingredients (list[RecipeIngredientOut]),
                        # manual_steps (list[CookingStepOut]),
                        # machine_steps (list[CookingStepOut]),
                        # created_at (datetime), updated_at (datetime)

# Write schemas
CookingStepIn           # step_number (int), instruction (str)
RecipeIngredientIn      # ingredient (int), quantity (Decimal), unit (int), order (int)
RecipeCreateIn          # title (str), list_type (str), default_servings (int),
                        # prep_time_minutes (int | None), cook_time_minutes (int | None),
                        # ingredients (list[RecipeIngredientIn]),
                        # manual_steps (list[CookingStepIn]),
                        # machine_steps (list[CookingStepIn])
IngredientCreateIn      # name_de (str), name_en (str), category (str)
```

## 3. Authentication & Permissions

### Authentication

Session + Token auth, configured globally on the NinjaAPI instance:

```python
# cookless/auth.py
from ninja.security import SessionAuth, HttpBearer
from rest_framework.authtoken.models import Token

class TokenAuth(HttpBearer):
    def authenticate(self, request, token):
        try:
            token_obj = Token.objects.select_related("user").get(key=token)
            return token_obj.user
        except Token.DoesNotExist:
            return None

auth = [SessionAuth(), TokenAuth()]
```

Applied globally:

```python
api = NinjaAPI(auth=auth)
```

### Permissions

Simple helper functions replace DRF's `BasePermission` classes:

```python
# users/permissions.py
from ninja.errors import HttpError

def require_household_member(request):
    if not request.user.is_authenticated:
        raise HttpError(401, "Authentication required")
    if not request.user.active_household_id:
        raise HttpError(403, "No active household")
    if not request.user.household_memberships.filter(
        household=request.user.active_household
    ).exists():
        raise HttpError(403, "Not a member of active household")

def require_household_owner(request, household):
    membership = request.user.household_memberships.filter(
        household=household, role="OWNER"
    ).first()
    if not membership:
        raise HttpError(403, "Owner access required")
```

Called explicitly at the top of view functions.

## 4. View Functions

Each endpoint is a plain function with typed parameters. Routers group endpoints by app.

### Pattern: Simple CRUD

```python
@router.get("/recipes/", response=list[RecipeOut])
def list_recipes(request, list_type: str = None):
    require_household_member(request)
    qs = Recipe.objects.filter(household=request.user.active_household)\
        .prefetch_related("ingredients", "steps")
    if list_type:
        qs = qs.filter(list_type=list_type)
    return qs
```

### Pattern: Nested writes

```python
@router.post("/recipes/", response={201: RecipeOut})
def create_recipe(request, payload: RecipeCreateIn):
    require_household_member(request)
    with transaction.atomic():
        recipe = Recipe.objects.create(
            household=request.user.active_household,
            title=payload.title, ...
        )
        _save_ingredients(recipe, payload.ingredients)
        _save_steps(recipe, payload.manual_steps, "MANUAL")
        _save_steps(recipe, payload.machine_steps, "MACHINE")
    return recipe
```

### Pattern: Custom actions

```python
@router.post("/recipes/{recipe_id}/move/", response=RecipeOut)
def move_recipe(request, recipe_id: UUID):
    require_household_member(request)
    recipe = get_object_or_404(Recipe, id=recipe_id,
                                household=request.user.active_household)
    recipe.list_type = "TO_TRY" if recipe.list_type == "KNOWN" else "KNOWN"
    recipe.save()
    return recipe
```

Key conventions:
- Path params typed in function signature (`recipe_id: UUID`)
- Query params as function args with defaults
- `get_object_or_404` for lookups
- `response={201: Schema}` for non-200 status codes
- Helper functions for nested write logic (`_save_ingredients`, `_save_steps`)

## 5. Error Handling & OpenAPI

### Error handling

Ninja handles automatically:
- 422 for Pydantic validation errors
- 404 from `get_object_or_404`
- 401/403 from `HttpError` in permission helpers

Optional custom handler for consistent error shape:

```python
@api.exception_handler(HttpError)
def custom_http_error(request, exc):
    return api.create_response(request, {"detail": exc.message}, status=exc.status_code)
```

### OpenAPI for Orval

Ninja auto-generates the schema at `/api/v1/openapi.json`. Frontend Orval config:

```typescript
// orval.config.ts
export default {
  cookless: {
    input: "http://localhost:8000/api/v1/openapi.json",
    output: { target: "./src/api/generated.ts" },
  },
};
```

## 6. Test Migration

Tests stay in pytest. Swap DRF's `APIClient` for Django's built-in `Client`:

| DRF | Django Ninja |
|---|---|
| `APIClient()` | `Client()` |
| `client.force_authenticate(user=user)` | `client.force_login(user)` |
| `format="json"` | `content_type="application/json"` + `json.dumps()` |
| `response.data` | `response.json()` |
| Validation errors: 400 | Validation errors: 422 |

Fixtures:

```python
@pytest.fixture
def auth_client(user):
    client = Client()
    client.force_login(user)
    return client
```

Everything else stays the same: test file locations, `@pytest.mark.django_db`, model fixtures, test logic and assertions.

## 7. Dependency Changes

### Remove
- `djangorestframework` from `requirements.txt`
- `rest_framework` and `rest_framework.authtoken` from `INSTALLED_APPS`
- `REST_FRAMEWORK` settings dict

### Add
- `django-ninja` to `requirements.txt`

### Keep
- `django-allauth` (unchanged, still handles Apple OAuth)
- `django-cors-headers` (unchanged)
- All other dependencies unchanged

## 8. Endpoint Mapping

| Method | Path | DRF View | Ninja Function |
|---|---|---|---|
| GET/PATCH | /users/me/ | UserMeView | `get_me`, `update_me` |
| GET/POST | /households/ | HouseholdListCreateView | `list_households`, `create_household` |
| PATCH | /households/{id}/ | HouseholdUpdateView | `update_household` |
| POST | /households/{id}/switch/ | HouseholdSwitchView | `switch_household` |
| POST | /households/{id}/invites/ | InviteCreateView | `create_invite` |
| DELETE | /households/{id}/members/{mid}/ | HouseholdMemberDeleteView | `delete_member` |
| POST | /invites/{code}/accept/ | InviteAcceptView | `accept_invite` |
| POST | /auth/apple/ | AppleLoginView | `apple_login` |
| POST | /auth/logout/ | LogoutView | `logout` |
| GET | /recipes/ | RecipeViewSet.list | `list_recipes` |
| POST | /recipes/ | RecipeViewSet.create | `create_recipe` |
| GET | /recipes/{id}/ | RecipeViewSet.retrieve | `get_recipe` |
| PUT/PATCH | /recipes/{id}/ | RecipeViewSet.update | `update_recipe` |
| DELETE | /recipes/{id}/ | RecipeViewSet.destroy | `delete_recipe` |
| POST | /recipes/{id}/move/ | RecipeMoveView | `move_recipe` |
| GET | /recipes/{id}/steps/ | RecipeStepsView | `list_steps` |
| GET/POST | /ingredients/ | IngredientListCreateView | `list_ingredients`, `create_ingredient` |
| GET | /units/ | UnitListView | `list_units` |
