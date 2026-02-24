# CookLess - Design Document

## Overview

CookLess is a mobile-first PWA for meal planning that minimizes cooking effort. Users manage recipes in two lists (known and to-try), generate optimized weekly meal plans, and get auto-aggregated shopping lists grouped by store aisle.

## Architecture

Single-container Django monolith serving a React PWA as static files.

```
cookless/
├── backend/
│   ├── cookless/              # Django project (settings, urls, wsgi)
│   ├── recipes/               # Recipes app
│   ├── planner/               # Meal plan generation
│   ├── shopping/              # Shopping list
│   ├── users/                 # User model, Apple OAuth, households
│   └── manage.py
├── frontend/                  # React PWA (Vite + TypeScript)
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── i18n/             # de.json, en.json
│   │   └── service-worker.ts
│   └── package.json
├── docs/plans/
├── Dockerfile                 # Multi-stage: build React, then Django + static
├── docker-compose.yml
├── docker-compose.production.yml
├── pyproject.toml
├── requirements.txt
├── .github/workflows/ci.yml
└── .pre-commit-config.yaml
```

- Django serves the built React app via WhiteNoise (single container)
- Django Ninja provides the REST API at `/api/v1/` (with auto-generated OpenAPI schema)
- React communicates exclusively via the API
- i18n via react-i18next (frontend); backend API responses are language-neutral (structured data)

## Data Models

### User

| Field              | Type                        |
|--------------------|-----------------------------|
| id                 | UUID                        |
| email              | string                      |
| apple_id           | string                      |
| preferred_language | enum (de, en)               |
| active_household   | FK → Household (nullable)   |
| settings           | JSON (default_servings, known_new_ratio, plan_days) |

### Household

| Field      | Type   |
|------------|--------|
| id         | UUID   |
| name       | string |
| created_at | datetime |

### HouseholdMember

| Field     | Type                  |
|-----------|-----------------------|
| id        | int                   |
| household | FK → Household        |
| user      | FK → User             |
| role      | enum (OWNER, MEMBER)  |
| joined_at | datetime              |

### Invite

| Field      | Type                       |
|------------|----------------------------|
| id         | UUID                       |
| household  | FK → Household             |
| created_by | FK → User                  |
| code       | string (unique, short-lived) |
| expires_at | datetime                   |
| used_by    | FK → User (nullable)       |

### Recipe

| Field            | Type                    |
|------------------|-------------------------|
| id               | UUID                    |
| household        | FK → Household          |
| title            | string                  |
| list_type        | enum (KNOWN, TO_TRY)    |
| default_servings | int                     |
| prep_time_minutes| int (nullable)          |
| cook_time_minutes| int (nullable)          |
| image            | ImageField (optional)   |
| created_at       | datetime                |
| updated_at       | datetime                |

### RecipeIngredient

| Field      | Type              |
|------------|-------------------|
| id         | int               |
| recipe     | FK → Recipe       |
| ingredient | FK → Ingredient   |
| quantity   | Decimal           |
| unit       | FK → Unit         |
| order      | int               |

### Ingredient

| Field    | Type                                                  |
|----------|-------------------------------------------------------|
| id       | int                                                   |
| name_de  | string                                                |
| name_en  | string                                                |
| category | enum (PRODUCE, DAIRY, MEAT, PANTRY, FROZEN, OTHER)    |

### Unit

| Field             | Type              |
|-------------------|-------------------|
| id                | int               |
| name_de           | string            |
| name_en           | string            |
| abbreviation      | string (g, ml, pcs) |
| base_unit         | FK → self (nullable) |
| conversion_factor | Decimal           |

### CookingStep

| Field       | Type                   |
|-------------|------------------------|
| id          | int                    |
| recipe      | FK → Recipe            |
| method      | enum (MANUAL, MACHINE) |
| step_number | int                    |
| instruction | text                   |

### MealPlan

| Field      | Type           |
|------------|----------------|
| id         | UUID           |
| household  | FK → Household |
| start_date | date           |
| end_date   | date           |

### MealPlanEntry

| Field        | Type                       |
|--------------|----------------------------|
| id           | int                        |
| meal_plan    | FK → MealPlan              |
| date         | date                       |
| meal_type    | enum (LUNCH, DINNER)       |
| recipe       | FK → Recipe                |
| servings     | int                        |
| is_leftover  | bool                       |
| source_entry | FK → self (nullable)       |

### ShoppingList

| Field      | Type           |
|------------|----------------|
| id         | UUID           |
| household  | FK → Household |
| meal_plan  | FK → MealPlan  |

### ShoppingListItem

| Field         | Type               |
|---------------|--------------------|
| id            | int                |
| shopping_list | FK → ShoppingList  |
| ingredient    | FK → Ingredient    |
| quantity      | Decimal            |
| unit          | FK → Unit          |
| checked       | bool               |

## Authentication & Permissions

- **Frontend (React PWA):** Session-based cookie auth (httponly, samesite=lax, CSRF protected)
- **Programmatic API:** Token auth (header: `Authorization: Bearer xxx`)
- Sign in with Apple provides identity → Django creates session (frontend) or returns token (API)

### Permission rules

- `require_household_member()` helper called in all data endpoints
- Every queryset filtered by `request.user.active_household`
- OWNER can invite/remove members; MEMBER can read/write all shared data
- Unauthenticated → 401; wrong household → 403
- Invite flow: Owner generates invite code, new member joins via code

## API Endpoints

### Auth
```
POST   /api/v1/auth/apple/            # Sign in with Apple
POST   /api/v1/auth/token/refresh/     # Refresh token (API auth)
DELETE /api/v1/auth/logout/            # Logout
```

### Households
```
POST   /api/v1/households/                     # Create
GET    /api/v1/households/                     # List mine
PATCH  /api/v1/households/{id}/                # Update name
POST   /api/v1/households/{id}/switch/         # Set as active
POST   /api/v1/households/{id}/invites/        # Create invite code
POST   /api/v1/invites/{code}/accept/          # Join via invite
DELETE /api/v1/households/{id}/members/{id}/   # Remove member (OWNER)
```

### Recipes
```
GET    /api/v1/recipes/                # List (filter by list_type)
POST   /api/v1/recipes/                # Create
GET    /api/v1/recipes/{id}/           # Detail
PUT    /api/v1/recipes/{id}/           # Update
DELETE /api/v1/recipes/{id}/           # Delete
POST   /api/v1/recipes/{id}/move/      # Move KNOWN ↔ TO_TRY
```

### Ingredients & Units
```
GET    /api/v1/ingredients/            # List/search (autocomplete)
POST   /api/v1/ingredients/            # Create
GET    /api/v1/units/                  # List all
```

### Meal Plan
```
GET    /api/v1/meal-plans/                          # List
POST   /api/v1/meal-plans/generate/                 # Generate new plan
GET    /api/v1/meal-plans/{id}/                     # Detail with entries
PUT    /api/v1/meal-plans/{id}/entries/{id}/        # Swap recipe
POST   /api/v1/meal-plans/{id}/regenerate/          # Re-generate (keep locked)
POST   /api/v1/meal-plans/{id}/shopping-list/       # Generate shopping list
```

### Shopping List
```
GET    /api/v1/shopping-lists/{id}/                 # Items grouped by category
PATCH  /api/v1/shopping-lists/{id}/items/{id}/      # Toggle checked
PATCH  /api/v1/shopping-lists/{id}/items/bulk/      # Bulk toggle
```

### Cooking View
```
GET    /api/v1/recipes/{id}/steps/?method=MANUAL|MACHINE
```

### User
```
GET    /api/v1/users/me/               # Profile + settings
PATCH  /api/v1/users/me/               # Update settings
```

## Meal Plan Generation Algorithm

### Input
- recipes[] (household's recipes)
- days (default 7)
- meals_per_day (default 2: lunch + dinner)
- servings (household size)
- known_ratio (e.g., 0.7 = 70% known, 30% to-try)

### Step 1: Recipe Selection
Calculate total cooking sessions needed. If average recipe yields 2 meals of leftovers, 14 meal slots ≈ 5-7 cooking sessions. Split by ratio (e.g., 5 known + 2 to-try). Randomly pick from each list.

### Step 2: Ingredient Overlap Scoring
Generate N random candidate sets (e.g., 50). Score each by shared ingredient count (ingredients appearing in 2+ recipes). Pick highest scoring set.

### Step 3: Leftover Assignment
For each recipe, calculate meals produced: `ceil(recipe_servings × multiplier / servings)`. Assign cooking day, fill subsequent days with leftovers. Avoid same-recipe leftovers on consecutive days.

### Step 4: Schedule Optimization
Spread cooking sessions evenly across the week. Fill remaining slots with leftovers. Ensure no day is empty.

### Shopping List Generation
For each non-leftover MealPlanEntry: multiply ingredients by servings ratio, convert to base units, sum by ingredient, convert back to human-friendly units (1500g → 1.5kg), group by category.

## Frontend Views

1. **Login** — Sign in with Apple button
2. **Household** — Switch/create household, manage invites
3. **Recipe Lists** — Two tabs (Known | To Try), quick-add form, search/filter
4. **Recipe Detail** — Edit structured ingredients, edit steps (Manual/Machine), move between lists
5. **Meal Plan** — Weekly calendar grid (days × lunch/dinner), Generate button with settings drawer, tap to swap, lock entries before regenerate, Create Shopping List button
6. **Shopping List** — Grouped by ingredient category, tap to check, checked items sink to bottom
7. **Cooking View** — Select method (Manual/Machine), scrollable step list, current step highlighted, screen wake lock
8. **Settings** — Language (de/en), default servings, default known/new ratio

### Tech Stack
- Vite + React + TypeScript
- React Router
- react-i18next
- Workbox (service worker, PWA caching)
- TanStack Query (API fetching + caching)
- Tailwind CSS (responsive, mobile-first)

### PWA Features
- Service worker caches current meal plan + active shopping list
- Installable on home screen
- Offline: view cached plan, check off shopping items (sync on reconnect)
- Wake lock during cooking view

## Infrastructure

### Dockerfile (multi-stage)
1. Node stage: build React PWA (`vite build`)
2. Python builder: install pip dependencies
3. Python runtime (Alpine 3.13): copy React assets → Django staticfiles, copy venv, WhiteNoise serves static, Gunicorn runs Django

### Docker Compose
- **Dev:** Single service, SQLite, bind mounts for live reload
- **Production:** App service + PostgreSQL, persistent volumes

### CI/CD (GitHub Actions, mirrors Yana)
1. Lint & Test: Ruff, Mypy, Pytest, ESLint, tsc, Vitest
2. Build AMD64
3. Build ARM64
4. Publish multi-arch manifest
5. Deploy to Portainer

### Pre-commit
- ruff (lint + format)
- mypy
- eslint
