# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. See also `backend/CLAUDE.md` and `frontend/CLAUDE.md` for detailed per-layer guidance.

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

## Architecture Overview

**Meal planning PWA** -- Django Ninja API backend + React/TypeScript frontend.

### Backend (Django 6.0 + Django Ninja)

Five Django apps: `users`, `recipes`, `planner`, `shopping`, `cookless` (project config). All endpoints under `/api/v1/` via 4 routers. Session auth with passkey + password support. Multi-tenant -- all data scoped to `request.user.active_household`.

### Frontend (React 19 + TypeScript + Vite + Tailwind CSS 4)

TanStack React Query for server state. React Router DOM v7 with lazy-loaded pages. PWA with custom Workbox service worker (offline shopping list toggles). i18n in English and German.

### Lint/Format Config

- **Ruff:** line-length 100, Python 3.13, rules: E/F/W/I/B/SIM/C4/DJ
- **isort sections:** future -> stdlib -> django -> third-party -> first-party -> local
- **First-party packages:** cookless, planner, recipes, shopping, users
- **MyPy:** django-stubs plugin, check_untyped_defs enabled

### Environment Variables (via django-environ)

`DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS`, `DATABASE_URL` (empty = SQLite), `CORS_ALLOWED_ORIGINS`, WebAuthn settings (`WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN` -- support comma-separated lists for multiple origins), Email settings (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_USE_SSL`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`, `SERVER_EMAIL`, `ADMIN_EMAIL`), `SUPERUSER_EMAIL`/`SUPERUSER_PASSWORD` (auto-created on container startup via docker-entrypoint.sh)
