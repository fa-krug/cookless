# Cook Less

A meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization. Built with Django Ninja and React.

## Features

- **Recipe management** -- organize recipes into Known and To Try lists with bilingual ingredient support (English/German)
- **Meal plan generation** -- balances familiar and new recipes while optimizing ingredient overlap across meals
- **Shopping list generation** -- aggregates ingredients across planned meals with unit conversion
- **Multi-user households** -- owner/member roles with a code-based invite system
- **PWA** -- installable with offline support via service worker
- **i18n** -- English and German

## Tech Stack

| Layer    | Technology                                                  |
|----------|-------------------------------------------------------------|
| Backend  | Python 3.13, Django 5.1, Django Ninja, Pydantic            |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query   |
| Auth     | Session (browser) + Bearer token (API), Sign in with Apple  |
| Database | SQLite (dev), PostgreSQL (prod)                             |
| Deploy   | Docker single-container, WhiteNoise serves static + SPA     |

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

### Environment Variables

Configure via `.env` in the project root or export directly:

| Variable                | Default   | Description                              |
|-------------------------|-----------|------------------------------------------|
| `DEBUG`                 | `True`    | Django debug mode                        |
| `SECRET_KEY`            | generated | Django secret key                        |
| `ALLOWED_HOSTS`         | `*`       | Comma-separated allowed hosts            |
| `DATABASE_URL`          | (empty)   | Database URL; empty uses SQLite          |
| `CORS_ALLOWED_ORIGINS`  | (empty)   | Comma-separated CORS origins             |
| `APPLE_CLIENT_ID`       | --        | Apple Sign In client ID                  |
| `APPLE_SECRET_KEY`      | --        | Apple Sign In secret key                 |
| `APPLE_KEY_ID`          | --        | Apple Sign In key ID                     |
| `APPLE_CERTIFICATE_KEY` | --        | Apple Sign In certificate key            |

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
  users/          # User, Household, HouseholdMember, Invite
  recipes/        # Recipe, RecipeIngredient, CookingStep, Ingredient, Unit
  planner/        # MealPlan, MealPlanEntry, plan generator
  shopping/       # ShoppingList, ShoppingListItem, list generator
frontend/
  src/            # React app (pages, components, hooks, i18n)
```

- API endpoints live at `/api/v1/`, with OpenAPI docs at `/api/v1/docs`
- Each Django app has `api.py` (views), `schemas.py` (Pydantic), and `models.py`
- All recipe data is scoped to the user's active household (multi-tenant)
- Auth supports both session cookies (browser) and Bearer tokens (API clients)

## License

Private -- all rights reserved.
