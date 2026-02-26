# Personal Access Tokens (PATs) Design

## Overview

Add personal access tokens so users can authenticate against the Cookless API programmatically via `Authorization: Bearer <token>`. Tokens have configurable scopes and expiration. Management UI lives in the settings page alongside a link to the Swagger docs.

## Data Model

New `PersonalAccessToken` model in the `users` app:

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | primary key |
| `user` | FK to User | CASCADE delete |
| `name` | CharField(100) | user-chosen label |
| `token_hash` | CharField(64) | SHA-256 hex digest, unique, indexed |
| `token_prefix` | CharField(10) | first 8 chars of token for display |
| `scopes` | CharField(255) | comma-separated, e.g. `recipes:read,shopping:write` |
| `expires_at` | DateTimeField | nullable = no expiration |
| `last_used_at` | DateTimeField | nullable, updated on use |
| `created_at` | DateTimeField | auto_now_add |

Token format: `ckls_<secrets.token_urlsafe(32)>`. Only the SHA-256 hash is stored; the raw token is shown once at creation.

## Available Scopes

- `recipes:read`, `recipes:write`
- `planner:read`, `planner:write`
- `shopping:read`, `shopping:write`
- `households:read`, `households:write`

## Auth

- New `BearerTokenAuth` class in `cookless/auth.py` alongside existing `SessionAuth`
- Django Ninja `auth=[SessionAuth(), BearerTokenAuth()]` — first match wins
- On request: strip `Bearer `, hash, look up `token_hash`, check expiry, attach `request.user` and `request.auth_scopes`
- Scope enforcement: `require_scope(request, "recipes:read")` helper called at the top of view functions (same pattern as `require_household_member`)

## API Endpoints

All under existing users router, session-auth only (no PAT auth for managing PATs):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/me/tokens/` | List PATs (no token_hash exposed) |
| POST | `/users/me/tokens/` | Create PAT — returns raw token once |
| DELETE | `/users/me/tokens/{id}/` | Revoke PAT |

### Schemas

**CreateTokenIn:** `name: str`, `scopes: list[str]`, `expires_at: datetime | None = None`, `duration_preset: str | None = None` (one of `30d`, `90d`, `1y`)

**TokenOut:** `id`, `name`, `token_prefix`, `scopes` (as list), `expires_at`, `last_used_at`, `created_at`

**TokenCreatedOut:** extends TokenOut with `token: str` (the raw token, shown only at creation)

## Settings UI

New "API" section in SettingsPage:

- External link to `/api/v1/docs` (Swagger UI)
- List of existing tokens: name, `ckls_XXXXXXXX...`, scope badges, relative expiry, last used
- "+ New token" button → form with:
  - Name input
  - Scope checkboxes grouped by app (recipes/planner/shopping/households) each with read/write toggles
  - Duration: preset buttons (30d, 90d, 1y, no expiration) + custom date picker
- After creation: modal with raw token, copy button, warning "Won't be shown again"
- Delete with confirmation via existing `useConfirm` hook

## Patterns Followed

- UUID primary key (like all models)
- `secrets.token_urlsafe()` for generation (like invite codes)
- Function-based views with `@router` (like all endpoints)
- Pydantic schemas with `*In`/`*Out` naming
- `require_household_member` / `require_household_owner` permission pattern
- React Query hooks in `useTokens.ts` with cache key `["tokens"]`
- `useConfirm` for delete confirmation
- i18n keys under `settings.api.*` namespace
- Tailwind utility classes, orange accent, cozy tone
