# Backend — CLAUDE.md

Django 6.0 + Django Ninja API backend. Five apps: `users`, `recipes`, `planner`, `shopping`, `cookless`.

## App Structure

Each app follows the pattern:
- `models.py` -- Django models
- `api.py` -- function-based views with `@router` decorators
- `schemas.py` -- Pydantic schemas (`*In` for request, `*Out` for response)
- `tests/` -- pytest tests

The `cookless` app is project config: `api.py` (NinjaAPI instance), `auth.py` (SessionAuth), `settings.py`, `urls.py`.

## API Endpoints

Base path: `/api/v1/`. OpenAPI docs at `/api/v1/docs`.

Four routers registered in `cookless/api.py` (all mounted at empty prefix):

### Auth (in `users/api.py`, `auth=None`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register/` | Begin WebAuthn registration (email + invite_code) |
| POST | `/auth/passkey/register/complete/` | Complete WebAuthn registration, create user |
| POST | `/auth/register/password/` | Register with email + password + invite_code |
| POST | `/auth/login/begin/` | Begin WebAuthn login |
| POST | `/auth/login/complete/` | Complete WebAuthn login |
| POST | `/auth/login/password/` | Login with email + password |
| POST | `/auth/logout/` | Logout (authenticated) |

### Users (in `users/api.py`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/me/` | Current user |
| PATCH | `/users/me/` | Update language, settings, active_household |
| POST | `/users/me/password/` | Set or change password |
| DELETE | `/users/me/password/` | Remove password (requires passkey) |
| POST | `/users/me/skip-passkey/` | Skip passkey step during onboarding |
| GET | `/users/me/passkeys/` | List passkeys |
| DELETE | `/users/me/passkeys/{id}/` | Delete passkey |
| POST | `/users/me/passkeys/add/begin/` | Begin adding passkey to existing account |
| POST | `/users/me/passkeys/add/complete/` | Complete adding passkey |

### Households (in `users/api.py`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/households/` | List user's households |
| POST | `/households/` | Create household |
| PATCH | `/households/{id}/` | Rename (OWNER) |
| DELETE | `/households/{id}/` | Delete (OWNER, must be sole member) |
| POST | `/households/{id}/switch/` | Switch active household |
| POST | `/households/{id}/leave/` | Leave household |
| POST | `/households/{id}/members/{pk}/transfer-ownership/` | Transfer OWNER role |
| DELETE | `/households/{id}/members/{pk}/` | Remove member (OWNER) |
| POST | `/households/{id}/invites/` | Create 7-day invite (OWNER) |
| GET | `/invites/{code}/` | Validate invite code (no auth) |
| POST | `/invites/{code}/accept/` | Join household via invite |

### Recipes (in `recipes/api.py`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/recipes/` | List recipes (`?list_type=KNOWN\|TO_TRY`). Returns lean `RecipeListOut` |
| POST | `/recipes/` | Create recipe with ingredients + steps |
| GET | `/recipes/{id}/` | Get recipe (full `RecipeOut` with ingredients + steps) |
| PUT | `/recipes/{id}/` | Full replace recipe |
| PATCH | `/recipes/{id}/` | Update recipe (same as PUT -- replaces all ingredients + steps) |
| DELETE | `/recipes/{id}/` | Delete recipe |
| POST | `/recipes/{id}/move/` | Toggle list_type (KNOWN <-> TO_TRY) |
| GET | `/recipes/{id}/steps/` | List steps (`?method=MANUAL\|MACHINE`) |
| GET | `/ingredients/` | List all ingredients (global) |
| POST | `/ingredients/` | Create ingredient |
| GET | `/units/` | List all units |

### Meal Plans (in `planner/api.py`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/meal-plans/setup/` | Create/replace plan config + generate first iteration |
| GET | `/meal-plans/` | List meal plans (with iterations + entries) |
| GET | `/meal-plans/{id}/` | Get single meal plan |
| POST | `/meal-plans/iterations/{id}/renew/` | Re-roll entries + shopping lists |
| POST | `/meal-plans/iterations/next/` | Archive current, generate next iteration |

### Shopping (in `shopping/api.py`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/shopping-lists/` | List shopping lists |
| GET | `/shopping-lists/{id}/` | Get shopping list with items |
| PATCH | `/shopping-lists/items/{id}/toggle/` | Toggle item checked state |
| PATCH | `/shopping-lists/items/bulk-toggle/` | Bulk toggle items |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health/` | Returns `{"status": "ok"}` (no auth) |

## Models

### users app

**User** (`AbstractBaseUser + PermissionsMixin`, UUID pk)
- `email` (unique, USERNAME_FIELD), `preferred_language` (en/de), `active_household` (FK, SET_NULL)
- `settings` (JSONField), `onboarding_step` (CHANGE_PASSWORD / ADD_PASSKEY / CREATE_HOUSEHOLD / COMPLETED)
- `has_passkey` property, custom `UserManager` (create_user sets unusable password)

**Household** -- `name`, `created_at`

**HouseholdMember** -- `household` + `user` (unique together), `role` (OWNER/MEMBER)

**Invite** -- `household`, `created_by`, `code` (auto-generated via `secrets.token_urlsafe(16)`), `expires_at`, `used_by`, `is_expired` property

**PasskeyCredential** -- `user`, `credential_id` (BinaryField, unique), `public_key`, `sign_count`, `device_name`

### recipes app

**Ingredient** (global, not household-scoped) -- `name_de`, `name_en`, `category` (PRODUCE/DAIRY/MEAT/PANTRY/FROZEN/OTHER). Ordered by `name_en`.

**Unit** (global) -- `name_de`, `name_en`, `abbreviation`, `base_unit` (self-FK for conversion hierarchy), `conversion_factor`. Method `to_base(quantity)`.

**Recipe** -- `household` (FK), `title`, `list_type` (KNOWN/TO_TRY), `default_servings`, `prep_time_minutes`, `cook_time_minutes`, `leftover_days`, `image`

**RecipeIngredient** -- `recipe`, `ingredient`, `quantity`, `unit`, `order`. Ordered by `order`.

**CookingStep** -- `recipe`, `method` (MANUAL/MACHINE), `step_number`, `instruction`. Ordered by `method, step_number`.

### planner app

**MealPlan** (OneToOne to Household) -- `iteration_weeks`, `shopping_days` (JSONField, list of weekday ints 0-6), `servings`, `known_ratio`, `default_leftover_days`

**PlanIteration** -- `meal_plan` (FK), `start_date`, `end_date`, `status` (ACTIVE/ARCHIVED). Ordered by `-start_date`.

**MealPlanEntry** -- `iteration` (FK), `date`, `meal_type` (BREAKFAST/LUNCH/DINNER/SNACK), `recipe` (FK), `servings`, `is_leftover`, `source_entry` (self-FK), `is_locked`

### shopping app

**ShoppingList** -- `iteration` (FK), `shopping_date`, `created_at`

**ShoppingListItem** -- `shopping_list` (FK), `ingredient` (FK), `quantity`, `unit` (FK), `is_checked`. Ordered by `ingredient__category, ingredient__name_en`.

## Key Schemas

### Request schemas

- `RecipeCreateIn` -- `title`, `list_type`, `default_servings`, `prep_time_minutes`, `cook_time_minutes`, `leftover_days`, `ingredients: list[RecipeIngredientIn]`, `manual_steps: list[CookingStepIn]`, `machine_steps: list[CookingStepIn]`
- `SetupPlanIn` -- `iteration_weeks` (1-3), `shopping_days` (list of ints), `servings` (1-12), `known_ratio` (0.0-1.0), `default_leftover_days` (0-3)
- `BulkToggleIn` -- `item_ids: list[UUID]`, `is_checked: bool`
- `SetPasswordIn` -- `current_password` (optional), `new_password`
- `RegisterPasswordIn` -- `email`, `password`, `invite_code`
- `LoginPasswordIn` -- `email`, `password`

### Response schemas

- `RecipeListOut` -- lean (no ingredients/steps), used for list endpoint
- `RecipeOut` -- full with `ingredients`, `manual_steps`, `machine_steps` (resolved via `Prefetch` with `to_attr`)
- `UserOut` -- includes computed `has_password` and `has_passkey` fields
- `ShoppingListItemOut` -- flattens ingredient/unit into scalars (`ingredient_name`, `unit_abbreviation`)

## Auth & Permissions

**Session auth** (`SessionAuth` from Django Ninja). Endpoints opt out with `auth=None`.

**Two auth flows:**
- **Passkeys (WebAuthn):** 2-step registration/login via `py_webauthn`. Helpers in `users/webauthn.py`.
- **Password:** standard email+password. Supports set/change/remove.

**Onboarding:** `User.onboarding_step` field drives a 3-step wizard: CHANGE_PASSWORD -> ADD_PASSKEY (skippable) -> CREATE_HOUSEHOLD -> COMPLETED.

**Permission helpers** in `users/permissions.py`:
- `require_household_member(request)` -- raises `HttpError(401)` if not authenticated, `HttpError(403)` if no active household
- `require_household_owner(request, household)` -- raises `HttpError(403)` if not OWNER

Called explicitly at the top of view functions (not decorators).

**Multi-tenancy:** All queries filter by `household=request.user.active_household`.

## Services & Utilities

### planner/services.py -- Meal plan generation
- Calculates cooking sessions: `days // (1 + default_leftover_days)`
- Splits into known/to_try by `known_ratio`
- Excludes recipes from previous iteration (falls back to full pool if insufficient)
- Runs 50 random samples, picks set with best ingredient overlap score
- Schedules LUNCH meals; leftover entries placed 2+ days after cooking, 2+ days apart

### shopping/services.py -- Shopping list generation
- Deletes existing lists, splits iteration into shopping segments
- Scales quantities by `servings / default_servings`, converts to base units via `Unit.to_base()`
- Aggregates by `(ingredient_id, base_unit_id)`, bulk creates items

### planner/iteration_utils.py -- Pure functions
- `validate_shopping_days(days)` -- 1-2 days, 0-6 range, >=3 apart if 2
- `compute_iteration_dates(start, shopping_days, weeks)` -- returns (start, end) tuple
- `compute_shopping_segments(start, end, shopping_days)` -- returns list of (seg_start, shopping_date, seg_end)

## Database Patterns

- **Delete-and-bulk_create:** Recipe ingredients and steps are fully replaced on every update (`_save_ingredients`, `_save_steps`)
- **Prefetch with to_attr:** Recipe detail uses `Prefetch` to split steps into `manual_steps_list` and `machine_steps_list`
- **Targeted updates:** `save(update_fields=["is_checked"])` for shopping item toggles
- **Deep chain filtering:** `iteration__meal_plan__household=...` for shopping list multi-tenancy

## Management Commands

- `seed_units` -- seeds 8 standard cooking units with conversion hierarchy (idempotent)
- `seed_recipes <household_name>` -- seeds ingredients and sample recipes for a household
- `create_first_household <name>` -- creates household with inactive placeholder owner + 30-day invite

## URL Routing

`cookless/urls.py`:
```python
path("admin/", admin.site.urls)
path("api/v1/health/", health_check)
path("api/v1/", api.urls)                    # all Ninja endpoints
re_path(r"^(?!api/).*$", TemplateView(...))   # SPA catch-all
```

## Settings Highlights

- SQLite by default, Postgres via `DATABASE_URL`
- WhiteNoise serves frontend from `backend/frontend_dist/` (Vite build output)
- SPA catch-all serves `index.html` for all non-API routes
- Proxy headers enabled: `SECURE_PROXY_SSL_HEADER`, `USE_X_FORWARDED_HOST/PORT`
- Production: CSRF/session cookies secure, HSTS 1 year, optional `SECURE_SSL_REDIRECT`
- Email: SMTP backend, `AdminEmailHandler` for errors in production (non-DEBUG)
- `ADMINS` parsed from `ADMIN_EMAIL` env (supports `Name <email>` format)
- `AUTH_USER_MODEL = "users.User"`

## Testing

Uses **Django `Client`** (not DRF APIClient). No shared `conftest.py` -- fixtures defined per test file.

Standard fixture pattern:
```python
@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="test@example.com")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = Client()
    client.force_login(user)
    return client, household  # always a tuple
```

API calls use `json.dumps({...})` with `content_type="application/json"`.

N+1 query guard (via `pytest-django`):
```python
with django_assert_max_num_queries(5):
    response = client.get("/api/v1/recipes/")
```

Config in `pyproject.toml`: `DJANGO_SETTINGS_MODULE = "cookless.settings"`, `pythonpath = ["backend"]`, `addopts = "--reuse-db"`.
