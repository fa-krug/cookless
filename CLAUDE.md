# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Backend
```bash
pytest                                                  # all backend tests
pytest backend/recipes/tests/test_api.py                # one test file
pytest backend/recipes/tests/test_api.py::test_create_recipe  # one test
ruff check . --fix && ruff format .                     # lint + format
cd backend && mypy --config-file=../pyproject.toml .    # type check
pre-commit run --all-files                              # all pre-commit hooks
cd backend && python manage.py runserver 0.0.0.0:8000   # dev server
```

### Frontend
```bash
cd frontend && npm run dev      # Vite dev server on :5173, proxies /api to :8000
cd frontend && npm run build    # production build
cd frontend && npm run lint     # ESLint
cd frontend && npm test         # Vitest
```

### Docker
```bash
docker-compose up               # dev (hot-reload, port 8000)
docker-compose -f docker-compose.production.yml up  # production (Postgres)
```

## Architecture

**Meal planning PWA** — Django Ninja API backend + React/TypeScript frontend.

### Backend (Django 5.1 + Django Ninja)

Three Django apps:
- **`users`** — User model (UUID pk, email + apple_id auth), Household, HouseholdMember (OWNER/MEMBER roles), Invite (7-day expiry, auto-generated code)
- **`recipes`** — Recipe (scoped to household, KNOWN/TO_TRY list types), RecipeIngredient, CookingStep (MANUAL/MACHINE), Ingredient (bilingual en/de), Unit (with conversion support)
- **`cookless`** — Project config, API instance, auth classes

**API structure:**
- `backend/cookless/api.py` — NinjaAPI instance, registers routers from each app
- `backend/{app}/api.py` — Function-based views with `@router` decorators
- `backend/{app}/schemas.py` — Pydantic schemas (`*In` for request, `*Out` for response)
- All endpoints under `/api/v1/`, OpenAPI docs at `/api/v1/docs`

**Auth:** Dual auth — `SessionAuth` (browser) + `TokenAuth` (Bearer token via `Authorization: Bearer xxx`). Token model reused from `rest_framework.authtoken`. `TokenAuth.authenticate()` explicitly sets `request.user` since Ninja only sets `request.auth`.

**Permissions:** Helper functions in `backend/users/permissions.py` — `require_household_member(request)` and `require_household_owner(request, household)` raise `HttpError(401/403)`. Called at the top of view functions.

**Multi-tenancy:** All recipe data scoped to `request.user.active_household`.

### Frontend (React 19 + TypeScript + Vite + Tailwind CSS)

- TanStack React Query for server state
- React Router DOM v7 for routing
- react-i18next for i18n (en/de)
- PWA via vite-plugin-pwa (theme: #f97316 orange)
- Vite dev server proxies `/api/*` → `http://localhost:8000`

### Testing Patterns

Backend tests use **Django `Client`** (not DRF APIClient):
```python
@pytest.mark.django_db
def test_example(auth_client):
    client, household = auth_client
    response = client.post("/api/v1/recipes/", json.dumps({...}), content_type="application/json")
    assert response.status_code == 201
```

### Lint/Format Config

- **Ruff:** line-length 100, Python 3.13, rules: E/F/W/I/B/SIM/C4/DJ
- **isort sections:** future → stdlib → django → third-party → first-party → local
- **First-party packages:** cookless, recipes, planner, shopping, users
- **MyPy:** django-stubs plugin, check_untyped_defs enabled

### Environment Variables (via django-environ)

`DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS`, `DATABASE_URL` (empty = SQLite), `CORS_ALLOWED_ORIGINS`, Apple auth keys (`APPLE_CLIENT_ID`, `APPLE_SECRET_KEY`, `APPLE_KEY_ID`, `APPLE_CERTIFICATE_KEY`)
