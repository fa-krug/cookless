# Cookless

A meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization. Built with Django Ninja and React.

## Features

- **Recipe management** -- organize recipes into Known and To Try lists with bilingual ingredient support (English/German)
- **Meal plan generation** -- balances familiar and new recipes while optimizing ingredient overlap across meals
- **Shopping list generation** -- aggregates ingredients across planned meals with unit conversion
- **Cooking view** -- step-by-step cooking guide with screen wake lock
- **Multi-user households** -- owner/member roles with a code-based invite system
- **Onboarding wizard** -- guided setup for new users (set password, add passkey, create household)
- **PWA** -- installable with offline shopping list support via Workbox service worker
- **i18n** -- English and German

## Tech Stack

| Layer    | Technology                                                     |
|----------|----------------------------------------------------------------|
| Backend  | Python 3.13, Django 6.0, Django Ninja, Pydantic               |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query    |
| Auth     | WebAuthn passkeys + email/password, Django sessions            |
| Database | SQLite (dev), PostgreSQL (prod)                                |
| Deploy   | Docker single-container, WhiteNoise serves static + SPA        |

## Prerequisites

- Python 3.13+
- Node.js 20+
- Docker and Docker Compose (for containerized setup)

## Setup

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

cd backend
python manage.py migrate
python manage.py seed_units       # load unit definitions
python manage.py runserver 0.0.0.0:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev    # starts Vite on :5173, proxies /api to :8000
```

### Bootstrap (first deployment)

```bash
cd backend
python manage.py create_first_household "My Home"   # prints invite code
# First user to register with this invite becomes the household owner
```

### Environment Variables

Configure via `.env` in the project root or export directly. See `.env.example` for all available settings.

| Variable                | Default   | Description                                    |
|-------------------------|-----------|------------------------------------------------|
| `DEBUG`                 | `True`    | Django debug mode                              |
| `SECRET_KEY`            | generated | Django secret key (required in production)     |
| `ALLOWED_HOSTS`         | `*`       | Comma-separated allowed hosts                  |
| `DATABASE_URL`          | (empty)   | Database URL; empty uses SQLite                |
| `CORS_ALLOWED_ORIGINS`  | (empty)   | Comma-separated CORS origins                   |
| `WEBAUTHN_RP_ID`        | --        | WebAuthn relying party ID (comma-separated)    |
| `WEBAUTHN_RP_NAME`      | --        | WebAuthn relying party name                    |
| `WEBAUTHN_ORIGIN`       | --        | WebAuthn allowed origins (comma-separated)     |
| `EMAIL_HOST`            | (empty)   | SMTP host for outbound email                   |
| `ADMIN_EMAIL`           | (empty)   | Admin email(s) for error notifications         |
| `SUPERUSER_EMAIL`       | (empty)   | Auto-create superuser on container startup     |
| `SUPERUSER_PASSWORD`    | (empty)   | Superuser password (required with email above) |

## Development

### Running Tests

```bash
# Backend (pytest)
pytest
pytest backend/recipes/tests/test_api.py               # single file
pytest backend/recipes/tests/test_api.py::test_name     # single test

# Frontend (Vitest)
cd frontend && npm test
```

### Linting and Formatting

```bash
ruff check . --fix && ruff format .       # Python lint + format
cd backend && mypy --config-file=../pyproject.toml .   # type check
cd frontend && npm run lint               # ESLint
pre-commit run --all-files                # all hooks
```

## Deployment

### Docker (Development)

```bash
docker-compose up
```

Hot-reload enabled, serves on port 8000.

### Docker (Production)

```bash
docker-compose -f docker-compose.production.yml up
```

Uses PostgreSQL. Django serves the React SPA and static files via WhiteNoise.

## Architecture

```
backend/
  cookless/       # project config, API instance, auth classes
  users/          # User, Household, HouseholdMember, Invite, PasskeyCredential
  recipes/        # Recipe, RecipeIngredient, CookingStep, Ingredient, Unit
  planner/        # MealPlan, PlanIteration, MealPlanEntry
  shopping/       # ShoppingList, ShoppingListItem
frontend/
  src/
    api/          # API client, types, WebAuthn helpers
    components/   # app components + ui/ primitives
    contexts/     # AuthContext, ToastContext
    hooks/        # React Query hooks, utility hooks
    i18n/         # translations (en.json, de.json)
    pages/        # route page components
    sw.ts         # custom Workbox service worker
docs/plans/       # implementation plans and design docs
```

- API endpoints live at `/api/v1/`, with OpenAPI docs at `/api/v1/docs`
- Each Django app has `api.py` (views), `schemas.py` (Pydantic), and `models.py`
- All data is scoped to the user's active household (multi-tenant)
- Auth uses Django sessions with WebAuthn passkeys and/or email/password

## License

Private -- all rights reserved.
