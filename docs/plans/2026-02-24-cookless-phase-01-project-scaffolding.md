# Cookless Phase 1: Project Scaffolding

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization.

**Architecture:** Django + DRF backend serving a React PWA via WhiteNoise in a single container. Cookie auth for frontend, token auth for programmatic API. Multi-user with households and Sign in with Apple.

**Tech Stack:** Python 3.13, Django 5.x, DRF, React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, react-i18next, Workbox

---

## Phase 1: Project Scaffolding

### Task 1: Initialize Django project

**Files:**
- Create: `backend/manage.py`
- Create: `backend/cookless/__init__.py`
- Create: `backend/cookless/settings.py`
- Create: `backend/cookless/urls.py`
- Create: `backend/cookless/wsgi.py`
- Create: `backend/cookless/asgi.py`
- Create: `requirements.txt`
- Create: `pyproject.toml`

**Step 1: Create Django project structure**

```bash
mkdir -p backend
cd backend
python -m django startproject cookless .
```

**Step 2: Create requirements.txt**

```
django>=5.1,<5.2
djangorestframework>=3.15,<4.0
django-cors-headers>=4.4,<5.0
whitenoise>=6.7,<7.0
gunicorn>=22.0,<23.0
Pillow>=10.4,<11.0
django-allauth[socialaccount]>=65.0,<66.0
psycopg2-binary>=2.9,<3.0
```

**Step 3: Create pyproject.toml**

Mirror Yana's config with `known-first-party = ["cookless", "recipes", "planner", "shopping", "users"]`.

**Step 4: Configure settings.py**

- Add REST_FRAMEWORK config (session auth + token auth)
- Add WhiteNoise middleware
- Add CORS headers middleware
- Database: SQLite default, PostgreSQL via env var
- Static files config for serving React build
- Environment variable support for SECRET_KEY, DEBUG, ALLOWED_HOSTS, DATABASE_URL

**Step 5: Verify Django starts**

Run: `cd backend && python manage.py runserver`
Expected: Django welcome page at localhost:8000

**Step 6: Commit**

```bash
git add backend/ requirements.txt pyproject.toml
git commit -m "feat: initialize Django project with Cookless settings"
```

---

### Task 2: Initialize React PWA frontend

**Files:**
- Create: `frontend/` (Vite scaffold)
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`

**Step 1: Scaffold Vite React TypeScript project**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

**Step 2: Install core dependencies**

```bash
cd frontend
npm install react-router-dom @tanstack/react-query react-i18next i18next tailwindcss @tailwindcss/vite
npm install -D workbox-build vite-plugin-pwa
```

**Step 3: Configure Tailwind CSS**

Add Tailwind v4 plugin to `vite.config.ts`. Create `src/index.css` with `@import "tailwindcss"`.

**Step 4: Configure Vite proxy**

In `vite.config.ts`, add proxy for `/api` to `http://localhost:8000` for dev.

**Step 5: Configure PWA manifest**

Add `vite-plugin-pwa` to vite config with app name "Cookless", theme color, icons placeholder.

**Step 6: Verify frontend starts**

Run: `cd frontend && npm run dev`
Expected: Vite dev server at localhost:5173

**Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: initialize React PWA frontend with Vite + TypeScript"
```

---

### Task 3: Set up pre-commit, linting, and type checking

**Files:**
- Create: `.pre-commit-config.yaml`
- Create: `frontend/.eslintrc.cjs`
- Modify: `pyproject.toml` (ruff, mypy, pytest config)

**Step 1: Create .pre-commit-config.yaml**

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.8.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.13.0
    hooks:
      - id: mypy
        additional_dependencies: [django-stubs]
        args: [--config-file=pyproject.toml]
```

**Step 2: Add ruff, mypy, pytest config to pyproject.toml**

Mirror Yana's config, update `known-first-party`.

**Step 3: Install pre-commit**

```bash
pip install pre-commit ruff mypy django-stubs
pre-commit install
```

**Step 4: Add ESLint config for frontend**

```bash
cd frontend && npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

**Step 5: Verify linting passes**

```bash
ruff check backend/
ruff format --check backend/
cd frontend && npx eslint src/
```
Expected: No errors

**Step 6: Commit**

```bash
git add .pre-commit-config.yaml pyproject.toml frontend/.eslintrc.cjs frontend/package.json frontend/package-lock.json
git commit -m "feat: add pre-commit hooks, ruff, mypy, eslint config"
```

---

### Task 4: Dockerfile and docker-compose

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `docker-compose.production.yml`
- Create: `docker-entrypoint.sh`
- Create: `.dockerignore`
- Create: `.env.example`

**Step 1: Create multi-stage Dockerfile**

```dockerfile
# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Python dependencies
FROM python:3.13-alpine AS python-builder
WORKDIR /build
RUN apk add --no-cache gcc g++ musl-dev postgresql-dev python3-dev jpeg-dev zlib-dev
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Stage 3: Runtime
FROM python:3.13-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini bash libpq libjpeg-turbo curl
COPY --from=python-builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" DJANGO_SETTINGS_MODULE=cookless.settings
COPY backend/ .
COPY --from=frontend-builder /build/dist /app/frontend_dist
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
RUN python manage.py collectstatic --noinput || true
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/api/v1/health/ || exit 1
ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["gunicorn", "cookless.wsgi:application", "--bind", "0.0.0.0:8000"]
```

**Step 2: Create docker-entrypoint.sh**

```bash
#!/bin/bash
set -e
python manage.py migrate --noinput
exec "$@"
```

**Step 3: Create docker-compose.yml (dev)**

SQLite, bind mounts, ports 8000.

**Step 4: Create docker-compose.production.yml**

PostgreSQL service, persistent volumes, no bind mounts.

**Step 5: Create .dockerignore and .env.example**

**Step 6: Verify Docker build**

Run: `docker compose build`
Expected: Successful build

**Step 7: Commit**

```bash
git add Dockerfile docker-compose.yml docker-compose.production.yml docker-entrypoint.sh .dockerignore .env.example
git commit -m "feat: add Docker multi-stage build and compose files"
```

---

### Task 5: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create CI workflow**

Mirror Yana's structure:
- Job 1: Lint & Test (ruff, mypy, pytest, eslint, tsc, vitest)
- Job 2: Build AMD64
- Job 3: Build ARM64
- Job 4: Publish multi-arch manifest
- Job 5: Deploy to Portainer

Use same secrets pattern as Yana (DOCKERHUB_USERNAME, DOCKERHUB_TOKEN, PORTAINER_*).

**Step 2: Commit**

```bash
git add .github/
git commit -m "feat: add CI/CD pipeline mirroring Yana"
```
