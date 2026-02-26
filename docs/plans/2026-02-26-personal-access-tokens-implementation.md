# Personal Access Tokens Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add personal access tokens (PATs) with configurable scopes and expiration, managed via Settings UI, authenticated via `Authorization: Bearer <token>`.

**Architecture:** New `PersonalAccessToken` model in `users` app. Token generated with `secrets.token_urlsafe(32)`, prefixed `ckls_`, stored as SHA-256 hash. New `BearerTokenAuth` class added alongside `SessionAuth`. Scope enforcement via `require_scope()` helper. Frontend: new "API" section in SettingsPage with token CRUD and a link to Swagger docs.

**Tech Stack:** Django 6.0 + Django Ninja (backend), React 19 + TypeScript + Tailwind (frontend)

---

### Task 1: PersonalAccessToken Model

**Files:**
- Modify: `backend/users/models.py` (after line 148)

**Step 1: Add the model after `PasskeyCredential`**

```python
class PersonalAccessToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="access_tokens")
    name = models.CharField(max_length=100)
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    token_prefix = models.CharField(max_length=14, default="")
    scopes = models.CharField(max_length=255, default="")
    expires_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user.email} — {self.name}"

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return timezone.now() > self.expires_at

    @property
    def scope_list(self) -> list[str]:
        return [s for s in self.scopes.split(",") if s]
```

**Step 2: Create and run migration**

Run: `cd backend && python manage.py makemigrations users && python manage.py migrate`

**Step 3: Commit**

```bash
git add backend/users/models.py backend/users/migrations/
git commit -m "feat: add PersonalAccessToken model"
```

---

### Task 2: Token Hashing Utility

**Files:**
- Create: `backend/users/token_utils.py`

**Step 1: Create the utility module**

```python
import hashlib
import secrets


def generate_token() -> tuple[str, str]:
    """Generate a new PAT. Returns (raw_token, token_hash)."""
    raw = "ckls_" + secrets.token_urlsafe(32)
    token_hash = hash_token(raw)
    return raw, token_hash


def hash_token(raw: str) -> str:
    """SHA-256 hex digest of a raw token string."""
    return hashlib.sha256(raw.encode()).hexdigest()
```

**Step 2: Commit**

```bash
git add backend/users/token_utils.py
git commit -m "feat: add token generation and hashing utilities"
```

---

### Task 3: PAT Schemas

**Files:**
- Modify: `backend/users/schemas.py` (after line 135)

**Step 1: Add schemas at end of file**

```python
class TokenCreateIn(Schema):
    name: str
    scopes: list[str]
    expires_at: datetime | None = None
    duration_preset: str | None = None


class TokenOut(Schema):
    id: UUID
    name: str
    token_prefix: str
    scopes: list[str]
    expires_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime

    @staticmethod
    def resolve_scopes(obj):
        return [s for s in obj.scopes.split(",") if s]


class TokenCreatedOut(TokenOut):
    token: str
```

**Step 2: Commit**

```bash
git add backend/users/schemas.py
git commit -m "feat: add PAT request/response schemas"
```

---

### Task 4: PAT API Endpoints + Tests (TDD)

**Files:**
- Modify: `backend/users/api.py` (after passkey management block, ~line 407)
- Create: `backend/users/tests/test_access_tokens.py`

**Step 1: Write the tests**

```python
import json
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.utils import timezone

from users.models import PersonalAccessToken
from users.token_utils import hash_token

User = get_user_model()

VALID_SCOPES = ["recipes:read", "recipes:write"]


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(email="alice@example.com")
    client = Client()
    client.force_login(user)
    return client, user


@pytest.mark.django_db
def test_create_token(auth_client):
    client, user = auth_client
    resp = client.post(
        "/api/v1/users/me/tokens/",
        json.dumps({"name": "My Token", "scopes": VALID_SCOPES}),
        content_type="application/json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My Token"
    assert data["token"].startswith("ckls_")
    assert data["scopes"] == VALID_SCOPES
    assert data["expires_at"] is None
    assert PersonalAccessToken.objects.filter(user=user).count() == 1


@pytest.mark.django_db
def test_create_token_with_duration_preset(auth_client):
    client, user = auth_client
    resp = client.post(
        "/api/v1/users/me/tokens/",
        json.dumps({"name": "Short", "scopes": VALID_SCOPES, "duration_preset": "30d"}),
        content_type="application/json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["expires_at"] is not None


@pytest.mark.django_db
def test_create_token_invalid_scope(auth_client):
    client, _ = auth_client
    resp = client.post(
        "/api/v1/users/me/tokens/",
        json.dumps({"name": "Bad", "scopes": ["invalid:scope"]}),
        content_type="application/json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_token_empty_name(auth_client):
    client, _ = auth_client
    resp = client.post(
        "/api/v1/users/me/tokens/",
        json.dumps({"name": "", "scopes": VALID_SCOPES}),
        content_type="application/json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_list_tokens(auth_client):
    client, user = auth_client
    PersonalAccessToken.objects.create(
        user=user,
        name="Token 1",
        token_hash=hash_token("ckls_fake1"),
        token_prefix="ckls_fake1"[:14],
        scopes="recipes:read",
    )
    resp = client.get("/api/v1/users/me/tokens/")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Token 1"
    assert "token" not in data[0]
    assert "token_hash" not in data[0]


@pytest.mark.django_db
def test_list_tokens_excludes_other_users(auth_client):
    client, user = auth_client
    other = User.objects.create_user(email="bob@example.com")
    PersonalAccessToken.objects.create(
        user=other,
        name="Bob's Token",
        token_hash=hash_token("ckls_bobs"),
        token_prefix="ckls_bobs"[:14],
        scopes="recipes:read",
    )
    resp = client.get("/api/v1/users/me/tokens/")
    assert resp.status_code == 200
    assert len(resp.json()) == 0


@pytest.mark.django_db
def test_delete_token(auth_client):
    client, user = auth_client
    token = PersonalAccessToken.objects.create(
        user=user,
        name="To Delete",
        token_hash=hash_token("ckls_delete"),
        token_prefix="ckls_delete"[:14],
        scopes="recipes:read",
    )
    resp = client.delete(f"/api/v1/users/me/tokens/{token.id}/")
    assert resp.status_code == 204
    assert not PersonalAccessToken.objects.filter(id=token.id).exists()


@pytest.mark.django_db
def test_delete_other_users_token(auth_client):
    client, _ = auth_client
    other = User.objects.create_user(email="bob@example.com")
    token = PersonalAccessToken.objects.create(
        user=other,
        name="Bob's Token",
        token_hash=hash_token("ckls_other"),
        token_prefix="ckls_other"[:14],
        scopes="recipes:read",
    )
    resp = client.delete(f"/api/v1/users/me/tokens/{token.id}/")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_unauthenticated_access():
    client = Client()
    assert client.get("/api/v1/users/me/tokens/").status_code in (401, 403)
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/users/tests/test_access_tokens.py -v`
Expected: FAIL — endpoints don't exist yet

**Step 3: Add imports to `backend/users/api.py`**

Add to the imports at top of file (line 18):
```python
from users.models import Household, HouseholdMember, Invite, PasskeyCredential, PersonalAccessToken
```

Add to schema imports (around line 20-39):
```python
from users.schemas import (
    ...existing imports...,
    TokenCreateIn,
    TokenCreatedOut,
    TokenOut,
)
```

Add:
```python
from users.token_utils import generate_token
```

**Step 4: Add endpoints after passkey management block (~line 407)**

```python
# ── Personal Access Tokens ──────────────────────────────────────────

ALLOWED_SCOPES = {
    "recipes:read",
    "recipes:write",
    "planner:read",
    "planner:write",
    "shopping:read",
    "shopping:write",
    "households:read",
    "households:write",
}

DURATION_PRESETS = {
    "30d": timedelta(days=30),
    "90d": timedelta(days=90),
    "1y": timedelta(days=365),
}


@router.get("/users/me/tokens/", response=list[TokenOut], tags=["tokens"])
def list_tokens(request):
    return PersonalAccessToken.objects.filter(user=request.user)


@router.post("/users/me/tokens/", response={201: TokenCreatedOut}, tags=["tokens"])
def create_token(request, payload: TokenCreateIn):
    if not payload.name.strip():
        raise HttpError(400, "Token name is required.")

    invalid = set(payload.scopes) - ALLOWED_SCOPES
    if invalid:
        raise HttpError(400, f"Invalid scopes: {', '.join(sorted(invalid))}")

    if not payload.scopes:
        raise HttpError(400, "At least one scope is required.")

    expires_at = None
    if payload.duration_preset:
        delta = DURATION_PRESETS.get(payload.duration_preset)
        if not delta:
            raise HttpError(400, f"Invalid duration preset: {payload.duration_preset}")
        expires_at = timezone.now() + delta
    elif payload.expires_at:
        expires_at = payload.expires_at

    raw_token, token_hash = generate_token()

    token = PersonalAccessToken.objects.create(
        user=request.user,
        name=payload.name.strip(),
        token_hash=token_hash,
        token_prefix=raw_token[:14],
        scopes=",".join(payload.scopes),
        expires_at=expires_at,
    )

    # Return the object with the raw token attached for the response
    token.token = raw_token  # type: ignore[attr-defined]
    return 201, token


@router.delete("/users/me/tokens/{token_id}/", response={204: None}, tags=["tokens"])
def delete_token(request, token_id: UUID):
    token = get_object_or_404(PersonalAccessToken, id=token_id, user=request.user)
    token.delete()
    return None
```

**Step 5: Run tests to verify they pass**

Run: `pytest backend/users/tests/test_access_tokens.py -v`
Expected: All PASS

**Step 6: Run full backend tests**

Run: `pytest`
Expected: All PASS

**Step 7: Commit**

```bash
git add backend/users/api.py backend/users/tests/test_access_tokens.py
git commit -m "feat: add PAT CRUD endpoints with tests"
```

---

### Task 5: Bearer Token Auth + Scope Enforcement

**Files:**
- Modify: `backend/cookless/auth.py`
- Modify: `backend/users/permissions.py`
- Create: `backend/users/tests/test_bearer_auth.py`

**Step 1: Write the tests**

```python
import json

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.utils import timezone
from datetime import timedelta

from users.models import Household, HouseholdMember, PersonalAccessToken
from users.token_utils import generate_token, hash_token

User = get_user_model()


@pytest.fixture
def user_with_pat(db):
    user = User.objects.create_user(email="pat@example.com")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    raw_token, token_hash = generate_token()
    pat = PersonalAccessToken.objects.create(
        user=user,
        name="Test Token",
        token_hash=token_hash,
        token_prefix=raw_token[:14],
        scopes="recipes:read,recipes:write",
    )
    return user, raw_token, pat


@pytest.mark.django_db
def test_bearer_auth_valid(user_with_pat):
    _, raw_token, _ = user_with_pat
    client = Client()
    resp = client.get(
        "/api/v1/recipes/",
        HTTP_AUTHORIZATION=f"Bearer {raw_token}",
    )
    assert resp.status_code == 200


@pytest.mark.django_db
def test_bearer_auth_invalid_token():
    client = Client()
    resp = client.get(
        "/api/v1/recipes/",
        HTTP_AUTHORIZATION="Bearer ckls_invalid_token_here",
    )
    assert resp.status_code in (401, 403)


@pytest.mark.django_db
def test_bearer_auth_expired_token(user_with_pat):
    _, raw_token, pat = user_with_pat
    pat.expires_at = timezone.now() - timedelta(hours=1)
    pat.save()
    client = Client()
    resp = client.get(
        "/api/v1/recipes/",
        HTTP_AUTHORIZATION=f"Bearer {raw_token}",
    )
    assert resp.status_code in (401, 403)


@pytest.mark.django_db
def test_bearer_auth_updates_last_used(user_with_pat):
    _, raw_token, pat = user_with_pat
    assert pat.last_used_at is None
    client = Client()
    client.get(
        "/api/v1/recipes/",
        HTTP_AUTHORIZATION=f"Bearer {raw_token}",
    )
    pat.refresh_from_db()
    assert pat.last_used_at is not None
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/users/tests/test_bearer_auth.py -v`
Expected: FAIL

**Step 3: Update `backend/cookless/auth.py`**

```python
from django.utils import timezone
from ninja.security import HttpBearer, SessionAuth

from users.models import PersonalAccessToken
from users.token_utils import hash_token


class BearerTokenAuth(HttpBearer):
    def authenticate(self, request, token: str):
        token_hash = hash_token(token)
        try:
            pat = PersonalAccessToken.objects.select_related("user").get(token_hash=token_hash)
        except PersonalAccessToken.DoesNotExist:
            return None

        if pat.is_expired:
            return None

        if not pat.user.is_active:
            return None

        request.user = pat.user
        request.auth_scopes = pat.scope_list
        request.auth_token = pat

        # Update last_used_at (fire-and-forget, no need to block)
        pat.last_used_at = timezone.now()
        pat.save(update_fields=["last_used_at"])

        return pat.user


auth = [SessionAuth(), BearerTokenAuth()]
```

**Step 4: Add `require_scope` to `backend/users/permissions.py`**

```python
def require_scope(request, scope: str) -> None:
    """Raises HttpError if the request was made via PAT and lacks the required scope.

    Session-authenticated requests are always allowed (no scope restriction).
    """
    scopes = getattr(request, "auth_scopes", None)
    if scopes is None:
        return  # Session auth — no scope restriction
    if scope not in scopes:
        raise HttpError(403, f"Token missing required scope: {scope}")
```

**Step 5: Run tests to verify they pass**

Run: `pytest backend/users/tests/test_bearer_auth.py -v`
Expected: All PASS

**Step 6: Run full backend tests**

Run: `pytest`
Expected: All PASS

**Step 7: Commit**

```bash
git add backend/cookless/auth.py backend/users/permissions.py backend/users/tests/test_bearer_auth.py
git commit -m "feat: add Bearer token auth and require_scope helper"
```

---

### Task 6: Add Scope Checks to Existing Endpoints

**Files:**
- Modify: `backend/recipes/api.py`
- Modify: `backend/planner/api.py`
- Modify: `backend/shopping/api.py`
- Modify: `backend/users/api.py` (household endpoints)

**Step 1: Add `require_scope` calls to recipe endpoints**

At the top of each recipe endpoint function, after `require_household_member(request)`, add the appropriate scope check. Pattern:

```python
# GET endpoints:
require_scope(request, "recipes:read")

# POST/PUT/PATCH/DELETE endpoints:
require_scope(request, "recipes:write")
```

Import at top of `backend/recipes/api.py`:
```python
from users.permissions import require_household_member, require_scope
```

Apply to each endpoint:
- `list_recipes`: `require_scope(request, "recipes:read")`
- `create_recipe`: `require_scope(request, "recipes:write")`
- `get_recipe`: `require_scope(request, "recipes:read")`
- `update_recipe`: `require_scope(request, "recipes:write")`
- `partial_update_recipe`: `require_scope(request, "recipes:write")`
- `delete_recipe`: `require_scope(request, "recipes:write")`
- `move_recipe`: `require_scope(request, "recipes:write")`
- `upload_recipe_image`: `require_scope(request, "recipes:write")`
- `generate_recipe_image`: `require_scope(request, "recipes:write")`
- `delete_recipe_image`: `require_scope(request, "recipes:write")`
- `list_recipe_steps`: `require_scope(request, "recipes:read")`
- `list_ingredients`: `require_scope(request, "recipes:read")`
- `create_ingredient`: `require_scope(request, "recipes:write")`
- `list_units`: `require_scope(request, "recipes:read")`

**Step 2: Same for planner endpoints in `backend/planner/api.py`**

Import `require_scope` from `users.permissions`.

- `setup_plan`: `require_scope(request, "planner:write")`
- `list_meal_plans`: `require_scope(request, "planner:read")`
- `get_meal_plan`: `require_scope(request, "planner:read")`
- `renew_iteration`: `require_scope(request, "planner:write")`
- `next_iteration`: `require_scope(request, "planner:write")`

**Step 3: Same for shopping endpoints in `backend/shopping/api.py`**

- `list_shopping_lists`: `require_scope(request, "shopping:read")`
- `get_shopping_list`: `require_scope(request, "shopping:read")`
- `toggle_item`: `require_scope(request, "shopping:write")`
- `bulk_toggle`: `require_scope(request, "shopping:write")`

**Step 4: Same for household endpoints in `backend/users/api.py`**

- `list_households`: `require_scope(request, "households:read")`
- `create_household`: `require_scope(request, "households:write")`
- `update_household`: `require_scope(request, "households:write")`
- `delete_household`: `require_scope(request, "households:write")`
- `update_household_settings`: `require_scope(request, "households:write")`
- Other household endpoints: use appropriate read/write scope

User management endpoints (`/users/me/*`) and auth endpoints should NOT have scope checks — they're either session-only or auth-free.

**Step 5: Run full test suite**

Run: `pytest`
Expected: All PASS (session-auth requests have no `auth_scopes` attribute, so `require_scope` is a no-op)

**Step 6: Commit**

```bash
git add backend/recipes/api.py backend/planner/api.py backend/shopping/api.py backend/users/api.py
git commit -m "feat: add scope checks to all API endpoints"
```

---

### Task 7: Frontend Types and Hook

**Files:**
- Modify: `frontend/src/api/types.ts` (after Passkey interface, ~line 229)
- Create: `frontend/src/hooks/useTokens.ts`

**Step 1: Add types**

```typescript
export interface AccessToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface AccessTokenCreated extends AccessToken {
  token: string;
}
```

**Step 2: Create hook file**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AccessToken, AccessTokenCreated } from "../api/types";

export function useTokens() {
  return useQuery<AccessToken[]>({
    queryKey: ["tokens"],
    queryFn: () => api.get<AccessToken[]>("/api/v1/users/me/tokens/"),
  });
}

export function useCreateToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      name: string;
      scopes: string[];
      expires_at?: string | null;
      duration_preset?: string | null;
    }) => api.post<AccessTokenCreated>("/api/v1/users/me/tokens/", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
    },
  });
}

export function useDeleteToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/users/me/tokens/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
    },
  });
}
```

**Step 3: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/hooks/useTokens.ts
git commit -m "feat(frontend): add PAT types and React Query hooks"
```

---

### Task 8: i18n Strings

**Files:**
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Add English strings**

After the `"passkeys"` section (after line 62), add:

```json
"tokens": {
  "title": "API Access",
  "docsLink": "API Documentation",
  "createToken": "New Token",
  "deleteToken": "Remove",
  "confirmDelete": "Remove this token? Any apps using it will stop working.",
  "tokenName": "Name",
  "namePlaceholder": "e.g. My Script, Home Assistant",
  "scopes": "Permissions",
  "scopeGroups": {
    "recipes": "Recipes",
    "planner": "Meal Plans",
    "shopping": "Shopping",
    "households": "Households"
  },
  "scopeRead": "Read",
  "scopeWrite": "Write",
  "expiration": "Expires",
  "preset30d": "30 days",
  "preset90d": "90 days",
  "preset1y": "1 year",
  "presetNever": "Never",
  "presetCustom": "Custom",
  "created": "Created {{date}}",
  "lastUsed": "Last used {{date}}",
  "neverUsed": "Never used",
  "expired": "Expired",
  "noTokens": "No API tokens yet.",
  "tokenCreated": "Token created!",
  "copyToken": "Copy",
  "copied": "Copied!",
  "tokenWarning": "Save this token now — you won't see it again!",
  "tokenLabel": "Your new token"
}
```

Also add to `"errors"` section:
```json
"tokenCreate": "Couldn't create the token. Try again?",
"tokenDelete": "Couldn't delete the token."
```

**Step 2: Add German strings**

Same position in `de.json`:

```json
"tokens": {
  "title": "API-Zugang",
  "docsLink": "API-Dokumentation",
  "createToken": "Neuer Token",
  "deleteToken": "Entfernen",
  "confirmDelete": "Diesen Token entfernen? Apps, die ihn nutzen, funktionieren dann nicht mehr.",
  "tokenName": "Name",
  "namePlaceholder": "z.B. Mein Skript, Home Assistant",
  "scopes": "Berechtigungen",
  "scopeGroups": {
    "recipes": "Rezepte",
    "planner": "Essensplanung",
    "shopping": "Einkaufen",
    "households": "Haushalt"
  },
  "scopeRead": "Lesen",
  "scopeWrite": "Schreiben",
  "expiration": "Läuft ab",
  "preset30d": "30 Tage",
  "preset90d": "90 Tage",
  "preset1y": "1 Jahr",
  "presetNever": "Nie",
  "presetCustom": "Eigenes Datum",
  "created": "Erstellt {{date}}",
  "lastUsed": "Zuletzt verwendet {{date}}",
  "neverUsed": "Noch nie verwendet",
  "expired": "Abgelaufen",
  "noTokens": "Noch keine API-Token.",
  "tokenCreated": "Token erstellt!",
  "copyToken": "Kopieren",
  "copied": "Kopiert!",
  "tokenWarning": "Speichere diesen Token jetzt — du siehst ihn nicht nochmal!",
  "tokenLabel": "Dein neuer Token"
}
```

Also add to `"errors"`:
```json
"tokenCreate": "Token konnte nicht erstellt werden. Nochmal versuchen?",
"tokenDelete": "Token konnte nicht gelöscht werden."
```

**Step 3: Commit**

```bash
git add frontend/src/i18n/en.json frontend/src/i18n/de.json
git commit -m "feat(frontend): add PAT i18n strings (en + de)"
```

---

### Task 9: Settings Page — API Section UI

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

**Step 1: Add imports**

Add to lucide-react imports (line 1-10):
```typescript
import { Code, Copy, Check, ExternalLink } from "lucide-react";
```

Add:
```typescript
import type { AccessToken, AccessTokenCreated } from "../api/types";
import { useTokens, useCreateToken, useDeleteToken } from "../hooks/useTokens";
```

**Step 2: Add state and handlers inside `SettingsPage` component**

After the password state block (~line 50), add:

```typescript
// Token state
const { data: tokens = [], isLoading: tokensLoading } = useTokens();
const createToken = useCreateToken();
const deleteToken = useDeleteToken();
const [showTokenForm, setShowTokenForm] = useState(false);
const [newTokenName, setNewTokenName] = useState("");
const [newTokenScopes, setNewTokenScopes] = useState<string[]>([]);
const [newTokenPreset, setNewTokenPreset] = useState<string>("90d");
const [newTokenCustomDate, setNewTokenCustomDate] = useState("");
const [createdToken, setCreatedToken] = useState<AccessTokenCreated | null>(null);
const [copied, setCopied] = useState(false);
```

Add handler functions after `handleRemovePassword` (~line 180):

```typescript
const SCOPE_GROUPS = ["recipes", "planner", "shopping", "households"] as const;

function toggleScope(scope: string) {
  setNewTokenScopes((prev) =>
    prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
  );
}

async function handleCreateToken() {
  const payload: {
    name: string;
    scopes: string[];
    duration_preset?: string;
    expires_at?: string;
  } = {
    name: newTokenName.trim(),
    scopes: newTokenScopes,
  };

  if (newTokenPreset === "custom" && newTokenCustomDate) {
    payload.expires_at = new Date(newTokenCustomDate).toISOString();
  } else if (newTokenPreset && newTokenPreset !== "never") {
    payload.duration_preset = newTokenPreset;
  }

  try {
    const result = await createToken.mutateAsync(payload);
    setCreatedToken(result);
    setShowTokenForm(false);
    setNewTokenName("");
    setNewTokenScopes([]);
    setNewTokenPreset("90d");
    setNewTokenCustomDate("");
    addToast(t("tokens.tokenCreated"), "success");
  } catch {
    addToast(t("errors.tokenCreate"), "error");
  }
}

async function handleDeleteToken(id: string) {
  const confirmed = await confirm({
    title: t("tokens.deleteToken"),
    message: t("tokens.confirmDelete"),
    confirmLabel: t("common.remove"),
    confirmVariant: "danger",
    cancelLabel: t("common.cancel"),
  });
  if (!confirmed) return;
  try {
    await deleteToken.mutateAsync(id);
  } catch {
    addToast(t("errors.tokenDelete"), "error");
  }
}

async function copyToken(token: string) {
  await navigator.clipboard.writeText(token);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
}
```

**Step 3: Add the API section JSX**

Insert between the Password section (line 391) and Admin section (line 393):

```tsx
{/* API Tokens */}
<div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
  <div className="mb-3 flex items-center justify-between">
    <h2 className="text-lg font-semibold text-gray-900">{t("tokens.title")}</h2>
    <a
      href="/api/v1/docs"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-700"
    >
      {t("tokens.docsLink")}
      <ExternalLink size={12} />
    </a>
  </div>

  {/* Created token display */}
  {createdToken && (
    <div className="mb-4 rounded-md border border-orange-300 bg-orange-50 p-3">
      <p className="mb-1 text-xs font-medium text-orange-800">{t("tokens.tokenLabel")}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 font-mono text-xs text-gray-900">
          {createdToken.token}
        </code>
        <button
          type="button"
          onClick={() => copyToken(createdToken.token)}
          className="shrink-0 rounded-md p-1.5 text-orange-600 hover:bg-orange-100"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
      <p className="mt-2 text-xs text-orange-700">{t("tokens.tokenWarning")}</p>
      <button
        type="button"
        onClick={() => setCreatedToken(null)}
        className="mt-2 text-xs text-orange-600 hover:text-orange-800"
      >
        {t("common.close")}
      </button>
    </div>
  )}

  {/* Token list */}
  {tokensLoading ? (
    <SettingsSkeleton />
  ) : tokens.length === 0 && !showTokenForm ? (
    <p className="text-sm text-gray-500">{t("tokens.noTokens")}</p>
  ) : (
    <div className="space-y-3">
      {tokens.map((token) => (
        <div
          key={token.id}
          className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-900">{token.name}</p>
              {token.expires_at && new Date(token.expires_at) < new Date() && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                  {t("tokens.expired")}
                </span>
              )}
            </div>
            <p className="font-mono text-xs text-gray-400">{token.token_prefix}...</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {token.scopes.map((scope) => (
                <span
                  key={scope}
                  className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                >
                  {scope}
                </span>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {token.last_used_at
                ? t("tokens.lastUsed", {
                    date: new Date(token.last_used_at).toLocaleDateString(),
                  })
                : t("tokens.neverUsed")}
            </p>
          </div>
          <button
            onClick={() => handleDeleteToken(token.id)}
            className="shrink-0 rounded-md p-1.5 text-red-500 hover:bg-red-50"
            aria-label={t("tokens.deleteToken")}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  )}

  {/* Create form */}
  {showTokenForm ? (
    <div className="mt-3 space-y-3 rounded-md border border-gray-200 p-3">
      <input
        type="text"
        value={newTokenName}
        onChange={(e) => setNewTokenName(e.target.value)}
        placeholder={t("tokens.namePlaceholder")}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">{t("tokens.scopes")}</p>
        <div className="space-y-2">
          {SCOPE_GROUPS.map((group) => (
            <div key={group} className="flex items-center gap-3">
              <span className="w-24 text-sm text-gray-600">
                {t(`tokens.scopeGroups.${group}`)}
              </span>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={newTokenScopes.includes(`${group}:read`)}
                  onChange={() => toggleScope(`${group}:read`)}
                  className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                {t("tokens.scopeRead")}
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={newTokenScopes.includes(`${group}:write`)}
                  onChange={() => toggleScope(`${group}:write`)}
                  className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                {t("tokens.scopeWrite")}
              </label>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">{t("tokens.expiration")}</p>
        <div className="flex flex-wrap gap-2">
          {(["30d", "90d", "1y", "never", "custom"] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setNewTokenPreset(preset)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                newTokenPreset === preset
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t(`tokens.preset${preset.charAt(0).toUpperCase() + preset.slice(1)}`)}
            </button>
          ))}
        </div>
        {newTokenPreset === "custom" && (
          <input
            type="date"
            value={newTokenCustomDate}
            onChange={(e) => setNewTokenCustomDate(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            className="mt-2 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCreateToken}
          disabled={
            !newTokenName.trim() ||
            newTokenScopes.length === 0 ||
            createToken.isPending
          }
          className="flex flex-1 items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {createToken.isPending ? <Spinner /> : <Code size={16} />}
          {t("tokens.createToken")}
        </button>
        <button
          type="button"
          onClick={() => setShowTokenForm(false)}
          className="rounded-md px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  ) : (
    <button
      onClick={() => setShowTokenForm(true)}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-orange-500 px-4 py-2 text-sm font-medium text-orange-500 hover:bg-orange-50"
    >
      <Plus size={16} />
      {t("tokens.createToken")}
    </button>
  )}
</div>
```

**Step 4: Build and verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add frontend/src/pages/SettingsPage.tsx
git commit -m "feat(frontend): add API tokens section to settings page"
```

---

### Task 10: Lint, Type Check, Full Test Suite

**Files:** None (verification only)

**Step 1: Backend lint + format**

Run: `ruff check . --fix && ruff format .`

**Step 2: Backend type check**

Run: `cd backend && mypy --config-file=../pyproject.toml .`

**Step 3: Frontend lint**

Run: `cd frontend && npm run lint`

**Step 4: Frontend build**

Run: `cd frontend && npm run build`

**Step 5: Full backend tests**

Run: `pytest`

**Step 6: Full frontend tests**

Run: `cd frontend && npm test`

**Step 7: Fix any issues, then final commit**

```bash
git add -A
git commit -m "chore: fix lint and type issues for PAT feature"
```
