# Passkey-Only Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Apple Sign-In with passkey-only WebAuthn authentication, using invite-based registration.

**Architecture:** Backend uses `py-webauthn` for WebAuthn ceremonies with Django Ninja endpoints. Session auth only (no tokens). Frontend uses browser `navigator.credentials` API. Registration requires a valid invite code.

**Tech Stack:** Django 5.1, Django Ninja, py-webauthn, React 19, TypeScript, TanStack Query

**Design doc:** `docs/plans/2026-02-24-passkey-auth-design.md`

---

### Task 1: Remove Apple Sign-In and allauth dependencies

**Files:**
- Modify: `requirements.txt` (lines 3, 9)
- Modify: `backend/cookless/settings.py` (lines 89-109, 115-126, 237-254)
- Modify: `backend/cookless/auth.py` (full file, 26 lines)
- Modify: `backend/cookless/api.py` (line 3, 8)
- Modify: `backend/users/api.py` (lines 169-171)
- Modify: `backend/users/models.py` (lines 15, 17, 27, 43)
- Modify: `backend/users/admin.py` (lines 9, 11, 16, 23)
- Modify: `backend/users/tests/test_auth.py` (lines 5, 28-34, 37-42)
- Modify: `backend/users/tests/test_models.py` (all `apple_id` references)
- Modify: `backend/users/tests/test_api.py` (lines 17, 22 — `apple_id` in fixtures)
- Modify: `.env` and `.env.example` (remove Apple vars)

**Step 1: Update requirements.txt**

Remove `djangorestframework` (line 3) and `django-allauth[socialaccount]` (line 9). Add `py-webauthn`:

```
django>=5.1,<5.2
django-ninja>=1.0,<2.0
django-cors-headers>=4.4,<5.0
django-environ>=0.11,<1.0
whitenoise>=6.7,<7.0
gunicorn>=22.0,<23.0
Pillow>=10.4,<11.0
psycopg2-binary>=2.9,<3.0
py-webauthn>=2.0,<3.0
```

**Step 2: Update settings.py**

Remove from `INSTALLED_APPS` (lines 103, 105-108):
- `"rest_framework.authtoken"`
- `"allauth"`
- `"allauth.account"`
- `"allauth.socialaccount"`
- `"allauth.socialaccount.providers.apple"`

Also remove `"django.contrib.sites"` (line 96) — only needed by allauth.

Remove from `MIDDLEWARE` (line 125):
- `"allauth.account.middleware.AccountMiddleware"`

Remove `SITE_ID = 1` (line 113).

Remove the entire `SOCIALACCOUNT_PROVIDERS` block (lines 240-249).

Remove the entire `AUTHENTICATION_BACKENDS` block (lines 251-254). Django's default `ModelBackend` will be used automatically.

Remove `AUTH_PASSWORD_VALIDATORS` block (lines 171-184) — no passwords.

Add WebAuthn settings at the end of the file (before LOGGING):

```python
# WebAuthn / Passkey configuration
WEBAUTHN_RP_ID = env("WEBAUTHN_RP_ID", default="localhost")
WEBAUTHN_RP_NAME = env("WEBAUTHN_RP_NAME", default="Cook Less")
WEBAUTHN_ORIGIN = env("WEBAUTHN_ORIGIN", default="http://localhost:5173")
```

**Step 3: Simplify auth.py**

Replace the entire file `backend/cookless/auth.py` with:

```python
from ninja.security import SessionAuth

auth = [SessionAuth()]
```

**Step 4: Update api.py import**

In `backend/cookless/api.py` line 3, change:
```python
from cookless.auth import auth
```
No change needed — this import still works.

**Step 5: Remove apple_id from User model**

In `backend/users/models.py`:
- Line 15: Change `create_user(self, email: str, apple_id: str, **extra_fields)` to `create_user(self, email: str, **extra_fields)`
- Line 17: Change `self.model(email=email, apple_id=apple_id, **extra_fields)` to `self.model(email=email, **extra_fields)`
- Line 27: Remove `extra_fields.setdefault("apple_id", "")`
- Line 43: Remove `apple_id = models.CharField(max_length=255, blank=True, default="")`

**Step 6: Remove apple_login endpoint**

In `backend/users/api.py`, delete lines 169-171 (the `apple_login` view).

**Step 7: Update admin.py**

In `backend/users/admin.py`:
- Line 9: Remove `"apple_id"` from `list_display`
- Line 11: Remove `"apple_id"` from `search_fields`
- Line 16: Remove `"apple_id"` from fieldsets Profile section
- Line 23: Remove `"apple_id"` from `add_fieldsets`

**Step 8: Update .env and .env.example**

Remove all `APPLE_*` lines. Add:
```
# WebAuthn
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_NAME=Cook Less
WEBAUTHN_ORIGIN=http://localhost:5173
```

**Step 9: Update tests**

In `backend/users/tests/test_auth.py`:
- Remove `from rest_framework.authtoken.models import Token` (line 5)
- Remove `test_token_auth` (lines 27-34) — no more Bearer token auth
- Remove `test_apple_login_endpoint_exists` (lines 37-42)
- Update `test_logout_clears_session` line 13: change `apple_id="a1"` to just `email="test@example.com"` (remove apple_id kwarg)

In `backend/users/tests/test_models.py`:
- Rename `test_create_user_with_apple_id` to `test_create_user`
- Remove all `apple_id=` kwargs from `create_user()` calls
- Remove `assert user.apple_id == "apple_123"` (line 15)

In `backend/users/tests/test_api.py`:
- Line 17: Change `create_user(email="alice@example.com", apple_id="apple_a")` to `create_user(email="alice@example.com")`
- Line 22: Change `create_user(email="bob@example.com", apple_id="apple_b")` to `create_user(email="bob@example.com")`

**Step 10: Install deps and create migration**

Run:
```bash
pip install -r requirements.txt
cd backend && python manage.py makemigrations users
```

Expected: Migration removing `apple_id` field from User.

**Step 11: Run tests to verify nothing is broken**

Run: `pytest`
Expected: All tests pass (minus the removed tests).

**Step 12: Commit**

```bash
git add -A && git commit -m "refactor: remove Apple Sign-In, allauth, and DRF token auth"
```

---

### Task 2: Add PasskeyCredential model

**Files:**
- Modify: `backend/users/models.py`
- Modify: `backend/users/admin.py`
- Create: `backend/users/tests/test_passkeys.py`

**Step 1: Write failing test**

Create `backend/users/tests/test_passkeys.py`:

```python
import uuid

from django.contrib.auth import get_user_model

import pytest

from users.models import PasskeyCredential

User = get_user_model()


@pytest.mark.django_db
def test_create_passkey_credential():
    user = User.objects.create_user(email="test@example.com")
    credential = PasskeyCredential.objects.create(
        user=user,
        credential_id=b"\x01\x02\x03",
        public_key=b"\x04\x05\x06",
        sign_count=0,
        device_name="MacBook Pro",
    )
    assert credential.user == user
    assert credential.credential_id == b"\x01\x02\x03"
    assert credential.sign_count == 0
    assert credential.device_name == "MacBook Pro"
    assert credential.id is not None


@pytest.mark.django_db
def test_passkey_credential_str():
    user = User.objects.create_user(email="test@example.com")
    credential = PasskeyCredential.objects.create(
        user=user,
        credential_id=b"\x01\x02\x03",
        public_key=b"\x04\x05\x06",
        sign_count=0,
        device_name="iPhone",
    )
    assert str(credential) == "test@example.com — iPhone"


@pytest.mark.django_db
def test_passkey_credential_id_is_unique():
    user = User.objects.create_user(email="test@example.com")
    PasskeyCredential.objects.create(
        user=user,
        credential_id=b"\x01\x02\x03",
        public_key=b"\x04\x05\x06",
        sign_count=0,
        device_name="Device 1",
    )
    with pytest.raises(Exception):
        PasskeyCredential.objects.create(
            user=user,
            credential_id=b"\x01\x02\x03",
            public_key=b"\x07\x08\x09",
            sign_count=0,
            device_name="Device 2",
        )
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/users/tests/test_passkeys.py -v`
Expected: ImportError — `PasskeyCredential` does not exist.

**Step 3: Implement PasskeyCredential model**

Add to `backend/users/models.py` after the `Invite` class:

```python
class PasskeyCredential(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="passkey_credentials")
    credential_id = models.BinaryField(unique=True)
    public_key = models.BinaryField()
    sign_count = models.IntegerField(default=0)
    device_name = models.CharField(max_length=255, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.user.email} — {self.device_name}"
```

**Step 4: Register in admin**

Add to `backend/users/admin.py`:

Update the import to include `PasskeyCredential`:
```python
from users.models import Household, HouseholdMember, Invite, PasskeyCredential, User
```

Add admin class:
```python
@admin.register(PasskeyCredential)
class PasskeyCredentialAdmin(admin.ModelAdmin):
    list_display = ("user", "device_name", "created_at")
    list_filter = ("user",)
    readonly_fields = ("credential_id", "public_key", "sign_count")
```

**Step 5: Create migration**

Run:
```bash
cd backend && python manage.py makemigrations users
```

Expected: Migration creating `PasskeyCredential` table.

**Step 6: Run tests**

Run: `pytest backend/users/tests/test_passkeys.py -v`
Expected: All 3 tests PASS.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: add PasskeyCredential model"
```

---

### Task 3: Add WebAuthn registration endpoints

**Files:**
- Create: `backend/users/webauthn.py` (helper functions wrapping py-webauthn)
- Modify: `backend/users/schemas.py` (add new schemas)
- Modify: `backend/users/api.py` (add registration endpoints)
- Create: `backend/users/tests/test_webauthn_registration.py`

**Step 1: Write failing test for registration begin**

Create `backend/users/tests/test_webauthn_registration.py`:

```python
import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client
from django.utils import timezone

import pytest

from users.models import Household, HouseholdMember, Invite

User = get_user_model()


@pytest.fixture
def invite(db):
    owner = User.objects.create_user(email="owner@example.com")
    household = Household.objects.create(name="Test Kitchen")
    HouseholdMember.objects.create(
        household=household, user=owner, role=HouseholdMember.Role.OWNER
    )
    return Invite.objects.create(
        household=household,
        created_by=owner,
        expires_at=timezone.now() + timedelta(days=7),
    )


@pytest.mark.django_db
def test_register_begin_returns_challenge(invite):
    client = Client()
    resp = client.post(
        "/api/v1/auth/register/",
        json.dumps({"email": "newuser@example.com", "invite_code": invite.code}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "challenge" in data
    assert "rp" in data
    assert "user" in data
    assert data["user"]["name"] == "newuser@example.com"


@pytest.mark.django_db
def test_register_begin_rejects_duplicate_email(invite):
    User.objects.create_user(email="existing@example.com")
    client = Client()
    resp = client.post(
        "/api/v1/auth/register/",
        json.dumps({"email": "existing@example.com", "invite_code": invite.code}),
        content_type="application/json",
    )
    assert resp.status_code == 409


@pytest.mark.django_db
def test_register_begin_rejects_invalid_invite():
    client = Client()
    resp = client.post(
        "/api/v1/auth/register/",
        json.dumps({"email": "new@example.com", "invite_code": "badcode"}),
        content_type="application/json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_register_begin_rejects_expired_invite(db):
    owner = User.objects.create_user(email="owner@example.com")
    household = Household.objects.create(name="Test Kitchen")
    HouseholdMember.objects.create(
        household=household, user=owner, role=HouseholdMember.Role.OWNER
    )
    invite = Invite.objects.create(
        household=household,
        created_by=owner,
        expires_at=timezone.now() - timedelta(days=1),
    )
    client = Client()
    resp = client.post(
        "/api/v1/auth/register/",
        json.dumps({"email": "new@example.com", "invite_code": invite.code}),
        content_type="application/json",
    )
    assert resp.status_code == 400
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/users/tests/test_webauthn_registration.py::test_register_begin_returns_challenge -v`
Expected: 404 — endpoint doesn't exist yet.

**Step 3: Add schemas**

Add to `backend/users/schemas.py`:

```python
class RegisterBeginIn(Schema):
    email: str
    invite_code: str


class InviteValidationOut(Schema):
    household_name: str
    expires_at: datetime
```

**Step 4: Create webauthn helper module**

Create `backend/users/webauthn.py`:

```python
import json

from django.conf import settings

from webauthn import generate_registration_options, verify_registration_response
from webauthn.helpers import bytes_to_base64url, base64url_to_bytes
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)


def get_registration_options(user_id: str, user_email: str, existing_credentials: list[bytes]):
    """Generate WebAuthn registration options for a user."""
    options = generate_registration_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_id=user_id.encode(),
        user_name=user_email,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=cred_id) for cred_id in existing_credentials
        ],
    )
    return options


def verify_registration(credential_json: str, challenge: bytes):
    """Verify a WebAuthn registration response."""
    return verify_registration_response(
        credential=credential_json,
        expected_challenge=challenge,
        expected_rp_id=settings.WEBAUTHN_RP_ID,
        expected_origin=settings.WEBAUTHN_ORIGIN,
    )
```

**Step 5: Add registration begin endpoint**

Add to `backend/users/api.py` in the Auth section, replacing the removed `apple_login`:

```python
import json as json_module

from django.contrib.auth import login

from webauthn.helpers import bytes_to_base64url, options_to_json

from users.webauthn import get_registration_options, verify_registration


@router.post("/auth/register/", auth=None, tags=["auth"])
def register_begin(request, payload: RegisterBeginIn):
    # Validate invite
    invite = Invite.objects.filter(code=payload.invite_code).first()
    if not invite:
        raise HttpError(400, "Invalid invite code.")
    if invite.is_expired:
        raise HttpError(400, "This invite has expired.")
    if invite.used_by is not None:
        raise HttpError(400, "This invite has already been used.")

    # Check email not taken
    from django.contrib.auth import get_user_model
    User = get_user_model()
    if User.objects.filter(email=payload.email).exists():
        raise HttpError(409, "An account with this email already exists.")

    # Generate registration options
    options = get_registration_options(
        user_id=payload.email,
        user_email=payload.email,
        existing_credentials=[],
    )

    # Store challenge and registration data in session
    request.session["webauthn_register_challenge"] = bytes_to_base64url(options.challenge)
    request.session["webauthn_register_email"] = payload.email
    request.session["webauthn_register_invite_code"] = payload.invite_code

    return json_module.loads(options_to_json(options))
```

Update the imports at the top of `backend/users/api.py` to include `RegisterBeginIn`:

```python
from users.schemas import (
    HouseholdCreateIn,
    HouseholdOut,
    HouseholdUpdateIn,
    InviteOut,
    MessageOut,
    RegisterBeginIn,
    UserOut,
    UserUpdateIn,
)
```

**Step 6: Run tests**

Run: `pytest backend/users/tests/test_webauthn_registration.py -v`
Expected: All 4 tests PASS.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: add WebAuthn registration begin endpoint"
```

---

### Task 4: Add registration complete endpoint

**Files:**
- Modify: `backend/users/api.py`
- Modify: `backend/users/schemas.py`
- Modify: `backend/users/tests/test_webauthn_registration.py`

**Step 1: Write failing test**

Add to `backend/users/tests/test_webauthn_registration.py`:

```python
from unittest.mock import patch, MagicMock

from users.models import PasskeyCredential


@pytest.mark.django_db
def test_register_complete_creates_user_and_credential(invite):
    client = Client()

    # Step 1: Begin registration
    resp = client.post(
        "/api/v1/auth/register/",
        json.dumps({"email": "newuser@example.com", "invite_code": invite.code}),
        content_type="application/json",
    )
    assert resp.status_code == 200

    # Step 2: Mock the WebAuthn verification (we can't do a real ceremony in tests)
    mock_verification = MagicMock()
    mock_verification.credential_id = b"\x01\x02\x03\x04"
    mock_verification.credential_public_key = b"\x05\x06\x07\x08"
    mock_verification.sign_count = 0

    with patch("users.api.verify_registration", return_value=mock_verification):
        resp = client.post(
            "/api/v1/auth/passkey/register/complete/",
            json.dumps({"credential": "{}", "device_name": "Test Device"}),
            content_type="application/json",
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "newuser@example.com"

    # Verify user was created
    user = User.objects.get(email="newuser@example.com")
    assert user.has_usable_password() is False
    assert user.active_household == invite.household

    # Verify passkey credential was created
    cred = PasskeyCredential.objects.get(user=user)
    assert cred.credential_id == b"\x01\x02\x03\x04"
    assert cred.device_name == "Test Device"

    # Verify invite was consumed
    invite.refresh_from_db()
    assert invite.used_by == user

    # Verify user is logged in (session auth)
    resp = client.get("/api/v1/users/me/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_register_complete_fails_without_begin():
    client = Client()
    resp = client.post(
        "/api/v1/auth/passkey/register/complete/",
        json.dumps({"credential": "{}", "device_name": "Test"}),
        content_type="application/json",
    )
    assert resp.status_code == 400
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/users/tests/test_webauthn_registration.py::test_register_complete_creates_user_and_credential -v`
Expected: 404 — endpoint doesn't exist.

**Step 3: Add schema**

Add to `backend/users/schemas.py`:

```python
class RegisterCompleteIn(Schema):
    credential: str
    device_name: str = ""
```

**Step 4: Add registration complete endpoint**

Add to `backend/users/api.py`:

```python
from webauthn.helpers import base64url_to_bytes

from users.models import Household, HouseholdMember, Invite, PasskeyCredential


@router.post("/auth/passkey/register/complete/", auth=None, response=UserOut, tags=["auth"])
def register_complete(request, payload: RegisterCompleteIn):
    # Retrieve session data
    challenge_b64 = request.session.get("webauthn_register_challenge")
    email = request.session.get("webauthn_register_email")
    invite_code = request.session.get("webauthn_register_invite_code")

    if not challenge_b64 or not email or not invite_code:
        raise HttpError(400, "No pending registration. Call /auth/register/ first.")

    challenge = base64url_to_bytes(challenge_b64)

    # Verify the credential
    try:
        verification = verify_registration(payload.credential, challenge)
    except Exception as e:
        raise HttpError(400, f"Registration verification failed: {e}")

    # Re-validate invite
    invite = Invite.objects.filter(code=invite_code, used_by=None).first()
    if not invite or invite.is_expired:
        raise HttpError(400, "Invite is no longer valid.")

    # Create user
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = User.objects.create_user(email=email)

    # Store passkey credential
    PasskeyCredential.objects.create(
        user=user,
        credential_id=bytes(verification.credential_id),
        public_key=bytes(verification.credential_public_key),
        sign_count=verification.sign_count,
        device_name=payload.device_name,
    )

    # Join household
    HouseholdMember.objects.create(
        household=invite.household,
        user=user,
        role=HouseholdMember.Role.MEMBER,
    )
    user.active_household = invite.household
    user.save()

    # Consume invite
    invite.used_by = user
    invite.save()

    # Log the user in (session auth)
    login(request, user)

    # Clear registration session data
    for key in ["webauthn_register_challenge", "webauthn_register_email", "webauthn_register_invite_code"]:
        request.session.pop(key, None)

    return user
```

**Step 5: Run tests**

Run: `pytest backend/users/tests/test_webauthn_registration.py -v`
Expected: All 6 tests PASS.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add WebAuthn registration complete endpoint"
```

---

### Task 5: Add WebAuthn login endpoints

**Files:**
- Modify: `backend/users/webauthn.py`
- Modify: `backend/users/api.py`
- Modify: `backend/users/schemas.py`
- Create: `backend/users/tests/test_webauthn_login.py`

**Step 1: Write failing test**

Create `backend/users/tests/test_webauthn_login.py`:

```python
import json
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from users.models import PasskeyCredential

User = get_user_model()


@pytest.fixture
def user_with_passkey(db):
    user = User.objects.create_user(email="alice@example.com")
    PasskeyCredential.objects.create(
        user=user,
        credential_id=b"\x01\x02\x03\x04",
        public_key=b"\x05\x06\x07\x08",
        sign_count=0,
        device_name="Test Device",
    )
    return user


@pytest.mark.django_db
def test_login_begin_returns_challenge(user_with_passkey):
    client = Client()
    resp = client.post(
        "/api/v1/auth/login/begin/",
        json.dumps({"email": "alice@example.com"}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "challenge" in data
    assert "allowCredentials" in data


@pytest.mark.django_db
def test_login_begin_unknown_email():
    client = Client()
    resp = client.post(
        "/api/v1/auth/login/begin/",
        json.dumps({"email": "nobody@example.com"}),
        content_type="application/json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_login_complete_authenticates_user(user_with_passkey):
    client = Client()

    # Begin login
    resp = client.post(
        "/api/v1/auth/login/begin/",
        json.dumps({"email": "alice@example.com"}),
        content_type="application/json",
    )
    assert resp.status_code == 200

    # Mock verification
    mock_verification = MagicMock()
    mock_verification.credential_id = b"\x01\x02\x03\x04"
    mock_verification.new_sign_count = 1

    with patch("users.api.verify_authentication", return_value=mock_verification):
        resp = client.post(
            "/api/v1/auth/login/complete/",
            json.dumps({"credential": "{}"}),
            content_type="application/json",
        )
    assert resp.status_code == 200
    assert resp.json()["email"] == "alice@example.com"

    # Verify session is set
    resp = client.get("/api/v1/users/me/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_login_complete_fails_without_begin():
    client = Client()
    resp = client.post(
        "/api/v1/auth/login/complete/",
        json.dumps({"credential": "{}"}),
        content_type="application/json",
    )
    assert resp.status_code == 400
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/users/tests/test_webauthn_login.py::test_login_begin_returns_challenge -v`
Expected: 404 — endpoint doesn't exist.

**Step 3: Add login helpers to webauthn.py**

Add to `backend/users/webauthn.py`:

```python
from webauthn import generate_authentication_options, verify_authentication_response


def get_authentication_options(credential_ids: list[bytes]):
    """Generate WebAuthn authentication options."""
    options = generate_authentication_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=cred_id) for cred_id in credential_ids
        ],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return options


def verify_authentication(
    credential_json: str,
    challenge: bytes,
    credential_public_key: bytes,
    credential_current_sign_count: int,
    credential_id: bytes,
):
    """Verify a WebAuthn authentication response."""
    return verify_authentication_response(
        credential=credential_json,
        expected_challenge=challenge,
        expected_rp_id=settings.WEBAUTHN_RP_ID,
        expected_origin=settings.WEBAUTHN_ORIGIN,
        credential_public_key=credential_public_key,
        credential_current_sign_count=credential_current_sign_count,
        credential_id=credential_id,
    )
```

**Step 4: Add schemas**

Add to `backend/users/schemas.py`:

```python
class LoginBeginIn(Schema):
    email: str


class LoginCompleteIn(Schema):
    credential: str
```

**Step 5: Add login endpoints**

Add to `backend/users/api.py`:

```python
from users.webauthn import get_authentication_options, verify_authentication


@router.post("/auth/login/begin/", auth=None, tags=["auth"])
def login_begin(request, payload: LoginBeginIn):
    from django.contrib.auth import get_user_model
    User = get_user_model()

    user = User.objects.filter(email=payload.email).first()
    if not user:
        raise HttpError(400, "No account found with this email.")

    credentials = PasskeyCredential.objects.filter(user=user)
    if not credentials.exists():
        raise HttpError(400, "No passkeys registered for this account.")

    credential_ids = [bytes(c.credential_id) for c in credentials]
    options = get_authentication_options(credential_ids)

    # Store challenge and user email in session
    request.session["webauthn_login_challenge"] = bytes_to_base64url(options.challenge)
    request.session["webauthn_login_email"] = payload.email

    return json_module.loads(options_to_json(options))


@router.post("/auth/login/complete/", auth=None, response=UserOut, tags=["auth"])
def login_complete(request, payload: LoginCompleteIn):
    challenge_b64 = request.session.get("webauthn_login_challenge")
    email = request.session.get("webauthn_login_email")

    if not challenge_b64 or not email:
        raise HttpError(400, "No pending login. Call /auth/login/begin/ first.")

    challenge = base64url_to_bytes(challenge_b64)

    # Parse credential to get credential ID
    from django.contrib.auth import get_user_model
    User = get_user_model()

    cred_data = json_module.loads(payload.credential)
    raw_id_b64 = cred_data.get("rawId", cred_data.get("id", ""))
    credential_id = base64url_to_bytes(raw_id_b64)

    # Look up the credential
    try:
        stored_credential = PasskeyCredential.objects.select_related("user").get(
            credential_id=credential_id
        )
    except PasskeyCredential.DoesNotExist:
        raise HttpError(400, "Unknown credential.")

    if stored_credential.user.email != email:
        raise HttpError(400, "Credential does not match user.")

    # Verify
    try:
        verification = verify_authentication(
            credential_json=payload.credential,
            challenge=challenge,
            credential_public_key=bytes(stored_credential.public_key),
            credential_current_sign_count=stored_credential.sign_count,
            credential_id=bytes(stored_credential.credential_id),
        )
    except Exception as e:
        raise HttpError(400, f"Authentication failed: {e}")

    # Update sign count
    stored_credential.sign_count = verification.new_sign_count
    stored_credential.save()

    # Log in
    login(request, stored_credential.user)

    # Clear session data
    for key in ["webauthn_login_challenge", "webauthn_login_email"]:
        request.session.pop(key, None)

    return stored_credential.user
```

**Step 6: Run tests**

Run: `pytest backend/users/tests/test_webauthn_login.py -v`
Expected: All 4 tests PASS.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: add WebAuthn login begin/complete endpoints"
```

---

### Task 6: Add invite validation endpoint and passkey management endpoints

**Files:**
- Modify: `backend/users/api.py`
- Modify: `backend/users/schemas.py`
- Modify: `backend/users/tests/test_webauthn_registration.py` (invite validation tests)
- Create: `backend/users/tests/test_passkey_management.py`

**Step 1: Write failing tests for invite validation**

Add to `backend/users/tests/test_webauthn_registration.py`:

```python
@pytest.mark.django_db
def test_get_invite_returns_household_info(invite):
    client = Client()
    resp = client.get(f"/api/v1/invites/{invite.code}/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["household_name"] == "Test Kitchen"
    assert "expires_at" in data


@pytest.mark.django_db
def test_get_invite_invalid_code():
    client = Client()
    resp = client.get("/api/v1/invites/badcode/")
    assert resp.status_code == 404
```

**Step 2: Write failing tests for passkey management**

Create `backend/users/tests/test_passkey_management.py`:

```python
import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from users.models import PasskeyCredential

User = get_user_model()


@pytest.fixture
def user_with_passkey(db):
    user = User.objects.create_user(email="alice@example.com")
    cred = PasskeyCredential.objects.create(
        user=user,
        credential_id=b"\x01\x02\x03",
        public_key=b"\x04\x05\x06",
        sign_count=0,
        device_name="MacBook Pro",
    )
    return user, cred


@pytest.mark.django_db
def test_list_passkeys(user_with_passkey):
    user, cred = user_with_passkey
    client = Client()
    client.force_login(user)
    resp = client.get("/api/v1/users/me/passkeys/")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["device_name"] == "MacBook Pro"
    assert "id" in data[0]
    assert "created_at" in data[0]


@pytest.mark.django_db
def test_delete_passkey(user_with_passkey):
    user, cred = user_with_passkey
    # Add a second passkey so deletion is allowed
    PasskeyCredential.objects.create(
        user=user,
        credential_id=b"\x07\x08\x09",
        public_key=b"\x0a\x0b\x0c",
        sign_count=0,
        device_name="iPhone",
    )
    client = Client()
    client.force_login(user)
    resp = client.delete(f"/api/v1/users/me/passkeys/{cred.id}/")
    assert resp.status_code == 204
    assert not PasskeyCredential.objects.filter(id=cred.id).exists()


@pytest.mark.django_db
def test_delete_last_passkey_rejected(user_with_passkey):
    user, cred = user_with_passkey
    client = Client()
    client.force_login(user)
    resp = client.delete(f"/api/v1/users/me/passkeys/{cred.id}/")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_list_passkeys_unauthenticated():
    client = Client()
    resp = client.get("/api/v1/users/me/passkeys/")
    assert resp.status_code in (401, 403)
```

**Step 3: Run tests to verify they fail**

Run: `pytest backend/users/tests/test_passkey_management.py -v`
Expected: 404 — endpoints don't exist.

**Step 4: Add schemas**

Add to `backend/users/schemas.py`:

```python
class PasskeyOut(Schema):
    id: UUID
    device_name: str
    created_at: datetime
```

**Step 5: Add invite validation endpoint**

Add to `backend/users/api.py`:

```python
@router.get("/invites/{code}/", auth=None, response=InviteValidationOut, tags=["invites"])
def get_invite(request, code: str):
    invite = get_object_or_404(Invite, code=code)
    if invite.is_expired:
        raise HttpError(400, "This invite has expired.")
    if invite.used_by is not None:
        raise HttpError(400, "This invite has already been used.")
    return {"household_name": invite.household.name, "expires_at": invite.expires_at}
```

**Step 6: Add passkey management endpoints**

Add to `backend/users/api.py`:

```python
@router.get("/users/me/passkeys/", response=list[PasskeyOut], tags=["passkeys"])
def list_passkeys(request):
    return PasskeyCredential.objects.filter(user=request.user).order_by("-created_at")


@router.delete("/users/me/passkeys/{passkey_id}/", response={204: None}, tags=["passkeys"])
def delete_passkey(request, passkey_id: UUID):
    credential = get_object_or_404(PasskeyCredential, id=passkey_id, user=request.user)
    if PasskeyCredential.objects.filter(user=request.user).count() <= 1:
        raise HttpError(400, "Cannot delete your only passkey.")
    credential.delete()
    return None
```

Update imports in schemas to include `InviteValidationOut` and `PasskeyOut`.

**Step 7: Add passkey add begin/complete endpoints**

Add to `backend/users/api.py`:

```python
@router.post("/users/me/passkeys/add/begin/", tags=["passkeys"])
def add_passkey_begin(request):
    existing = [
        bytes(c.credential_id) for c in PasskeyCredential.objects.filter(user=request.user)
    ]
    options = get_registration_options(
        user_id=str(request.user.id),
        user_email=request.user.email,
        existing_credentials=existing,
    )
    request.session["webauthn_add_challenge"] = bytes_to_base64url(options.challenge)
    return json_module.loads(options_to_json(options))


@router.post("/users/me/passkeys/add/complete/", response=PasskeyOut, tags=["passkeys"])
def add_passkey_complete(request, payload: RegisterCompleteIn):
    challenge_b64 = request.session.get("webauthn_add_challenge")
    if not challenge_b64:
        raise HttpError(400, "No pending passkey registration.")

    challenge = base64url_to_bytes(challenge_b64)
    try:
        verification = verify_registration(payload.credential, challenge)
    except Exception as e:
        raise HttpError(400, f"Verification failed: {e}")

    credential = PasskeyCredential.objects.create(
        user=request.user,
        credential_id=bytes(verification.credential_id),
        public_key=bytes(verification.credential_public_key),
        sign_count=verification.sign_count,
        device_name=payload.device_name,
    )
    request.session.pop("webauthn_add_challenge", None)
    return credential
```

**Step 8: Run tests**

Run: `pytest backend/users/tests/test_passkey_management.py backend/users/tests/test_webauthn_registration.py -v`
Expected: All tests PASS.

**Step 9: Run full backend test suite**

Run: `pytest`
Expected: All tests pass.

**Step 10: Commit**

```bash
git add -A && git commit -m "feat: add invite validation and passkey management endpoints"
```

---

### Task 7: Update frontend AuthContext and login page

**Files:**
- Modify: `frontend/src/contexts/authContextValue.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Create WebAuthn browser helper**

Create `frontend/src/api/webauthn.ts`:

```typescript
import { api } from "./client";
import type { User } from "./types";

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function registerPasskey(
  email: string,
  inviteCode: string,
  deviceName: string,
): Promise<User> {
  // Step 1: Get registration options
  const options = await api.post<PublicKeyCredentialCreationOptions>(
    "/api/v1/auth/register/",
    { email, invite_code: inviteCode },
  );

  // Step 2: Convert challenge and user.id from base64url to ArrayBuffer
  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(options.challenge as unknown as string),
    user: {
      ...options.user,
      id: base64urlToBuffer(options.user.id as unknown as string),
    },
    excludeCredentials: (options.excludeCredentials ?? []).map((c) => ({
      ...c,
      id: base64urlToBuffer(c.id as unknown as string),
    })),
  };

  // Step 3: Create credential via browser API
  const credential = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential;
  if (!credential) throw new Error("Passkey creation cancelled.");

  const response = credential.response as AuthenticatorAttestationResponse;

  // Step 4: Send attestation to backend
  const credentialJSON = JSON.stringify({
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    response: {
      attestationObject: bufferToBase64url(response.attestationObject),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
    },
    type: credential.type,
  });

  return api.post<User>("/api/v1/auth/passkey/register/complete/", {
    credential: credentialJSON,
    device_name: deviceName,
  });
}

export async function loginWithPasskey(email: string): Promise<User> {
  // Step 1: Get authentication options
  const options = await api.post<PublicKeyCredentialRequestOptions>(
    "/api/v1/auth/login/begin/",
    { email },
  );

  // Step 2: Convert challenge and credential IDs
  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(options.challenge as unknown as string),
    allowCredentials: ((options as Record<string, unknown>).allowCredentials as Array<{ id: string; type: string }> ?? []).map(
      (c) => ({
        ...c,
        id: base64urlToBuffer(c.id as unknown as string),
      }),
    ),
  };

  // Step 3: Get credential via browser API
  const credential = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential;
  if (!credential) throw new Error("Passkey authentication cancelled.");

  const response = credential.response as AuthenticatorAssertionResponse;

  // Step 4: Send assertion to backend
  const credentialJSON = JSON.stringify({
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    response: {
      authenticatorData: bufferToBase64url(response.authenticatorData),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle
        ? bufferToBase64url(response.userHandle)
        : null,
    },
    type: credential.type,
  });

  return api.post<User>("/api/v1/auth/login/complete/", {
    credential: credentialJSON,
  });
}
```

**Step 2: Update AuthContext types**

Replace `frontend/src/contexts/authContextValue.ts`:

```typescript
import { createContext } from "react";
import type { User } from "../api/types";

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string) => Promise<void>;
  register: (email: string, inviteCode: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
```

**Step 3: Update AuthContext implementation**

Replace `frontend/src/contexts/AuthContext.tsx`:

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import type { User } from "../api/types";
import { loginWithPasskey, registerPasskey } from "../api/webauthn";
import { AuthContext } from "./authContextValue";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initialised = useRef(false);

  const fetchUser = useCallback(async () => {
    try {
      const data = await api.get<User>("/api/v1/users/me/");
      setUser(data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    fetchUser().finally(() => setIsLoading(false));
  }, [fetchUser]);

  const login = useCallback(async (email: string) => {
    const data = await loginWithPasskey(email);
    setUser(data);
  }, []);

  const register = useCallback(async (email: string, inviteCode: string) => {
    const data = await registerPasskey(email, inviteCode, navigator.userAgent);
    setUser(data);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/v1/auth/logout/");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout, refreshUser: fetchUser }),
    [user, isLoading, login, register, logout, fetchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

**Step 4: Update LoginPage**

Replace `frontend/src/pages/LoginPage.tsx`:

```typescript
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await login(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <h1 className="mb-2 text-4xl font-bold text-orange-500">
        {t("common.appName")}
      </h1>
      <p className="mb-12 text-gray-500">{t("nav.plan")}</p>

      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.emailPlaceholder")}
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={isLoading || !email}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
        >
          {isLoading ? t("common.loading") : t("auth.signIn")}
        </button>
      </form>
    </div>
  );
}
```

**Step 5: Update i18n translations**

Add/update keys in `frontend/src/i18n/en.json` under the `"auth"` section:

```json
"signIn": "Sign in with Passkey",
"emailPlaceholder": "Email address",
"loginFailed": "Login failed. Please try again.",
"registerDevice": "Register this device",
"passkeyPrompt": "Use your fingerprint, face, or security key to sign in."
```

Remove `"signInWithApple"`.

Add/update in `frontend/src/i18n/de.json`:

```json
"signIn": "Mit Passkey anmelden",
"emailPlaceholder": "E-Mail-Adresse",
"loginFailed": "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
"registerDevice": "Dieses Gerät registrieren",
"passkeyPrompt": "Verwenden Sie Fingerabdruck, Gesichtserkennung oder Sicherheitsschlüssel."
```

Remove `"signInWithApple"`.

**Step 6: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: update frontend auth to use passkeys"
```

---

### Task 8: Add invite page

**Files:**
- Create: `frontend/src/pages/InvitePage.tsx`
- Modify: `frontend/src/App.tsx` (add route)
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Create InvitePage component**

Create `frontend/src/pages/InvitePage.tsx`:

```typescript
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth";

interface InviteInfo {
  household_name: string;
  expires_at: string;
}

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const { t } = useTranslation();
  const { user, register } = useAuth();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!code) return;
    api
      .get<InviteInfo>(`/api/v1/invites/${code}/`)
      .then(setInvite)
      .catch(() => setError(t("invite.invalid")))
      .finally(() => setLoading(false));
  }, [code, t]);

  const handleJoin = useCallback(async () => {
    if (!code) return;
    setSubmitting(true);
    try {
      await api.post(`/api/v1/invites/${code}/accept/`);
      navigate("/recipes");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("invite.joinFailed"));
    } finally {
      setSubmitting(false);
    }
  }, [code, navigate, t]);

  const handleRegister = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!code) return;
      setSubmitting(true);
      setError("");
      try {
        await register(email, code);
        navigate("/recipes");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("invite.registerFailed"));
      } finally {
        setSubmitting(false);
      }
    },
    [code, email, register, navigate, t],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!invite) return null;

  // Logged-in user: show join confirmation
  if (user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <h1 className="mb-2 text-2xl font-bold">{t("invite.joinTitle")}</h1>
        <p className="mb-8 text-gray-600">
          {t("invite.joinPrompt", { household: invite.household_name })}
        </p>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <div className="flex gap-4">
          <button
            onClick={() => navigate("/recipes")}
            className="rounded-lg border border-gray-300 px-6 py-3 font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("invite.decline")}
          </button>
          <button
            onClick={handleJoin}
            disabled={submitting}
            className="rounded-lg bg-orange-500 px-6 py-3 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {submitting ? t("common.loading") : t("invite.join")}
          </button>
        </div>
      </div>
    );
  }

  // Not logged in: show registration form
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="mb-2 text-2xl font-bold">{t("invite.registerTitle")}</h1>
      <p className="mb-8 text-gray-600">
        {t("invite.registerPrompt", { household: invite.household_name })}
      </p>

      <form onSubmit={handleRegister} className="w-full max-w-xs space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.emailPlaceholder")}
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !email}
          className="w-full rounded-lg bg-orange-500 px-6 py-3 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {submitting ? t("common.loading") : t("invite.createAccount")}
        </button>
      </form>
    </div>
  );
}
```

**Step 2: Add route**

In `frontend/src/App.tsx`, add import and route:

```typescript
import InvitePage from "./pages/InvitePage";
```

Add route before the wildcard route (line 29):
```tsx
<Route path="/invite/:code" element={<InvitePage />} />
```

**Step 3: Add i18n keys**

Add to `frontend/src/i18n/en.json`:

```json
"invite": {
  "invalid": "This invite link is invalid or has expired.",
  "joinTitle": "Join Household",
  "joinPrompt": "You've been invited to join {{household}}.",
  "join": "Join",
  "decline": "Decline",
  "joinFailed": "Failed to join household.",
  "registerTitle": "Create Account",
  "registerPrompt": "Create an account to join {{household}}.",
  "createAccount": "Create Account & Set Up Passkey",
  "registerFailed": "Registration failed. Please try again."
}
```

Add to `frontend/src/i18n/de.json`:

```json
"invite": {
  "invalid": "Dieser Einladungslink ist ungültig oder abgelaufen.",
  "joinTitle": "Haushalt beitreten",
  "joinPrompt": "Du wurdest eingeladen, {{household}} beizutreten.",
  "join": "Beitreten",
  "decline": "Ablehnen",
  "joinFailed": "Beitritt fehlgeschlagen.",
  "registerTitle": "Konto erstellen",
  "registerPrompt": "Erstelle ein Konto, um {{household}} beizutreten.",
  "createAccount": "Konto erstellen & Passkey einrichten",
  "registerFailed": "Registrierung fehlgeschlagen. Bitte erneut versuchen."
}
```

**Step 4: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add invite page with registration and join flows"
```

---

### Task 9: Update frontend settings page with passkey management

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx` (add passkey section)
- Modify: `frontend/src/api/types.ts` (add Passkey type)
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Add Passkey type**

Add to `frontend/src/api/types.ts`:

```typescript
export interface Passkey {
  id: string;
  device_name: string;
  created_at: string;
}
```

**Step 2: Read current SettingsPage**

Read `frontend/src/pages/SettingsPage.tsx` to understand the current structure, then add a passkey management section that:
- Fetches passkeys from `GET /api/v1/users/me/passkeys/`
- Lists each passkey with device name and date
- Has a delete button (disabled if only 1 passkey, with confirmation)
- Has an "Add passkey" button that triggers the browser WebAuthn ceremony via `POST /api/v1/users/me/passkeys/add/begin/` and `POST /api/v1/users/me/passkeys/add/complete/`

**Step 3: Add i18n keys**

Add to both `en.json` and `de.json`:

English:
```json
"passkeys": {
  "title": "Passkeys",
  "addPasskey": "Add Passkey",
  "deletePasskey": "Remove",
  "confirmDelete": "Remove this passkey?",
  "cannotDeleteLast": "You must have at least one passkey.",
  "added": "Added {{date}}"
}
```

German:
```json
"passkeys": {
  "title": "Passkeys",
  "addPasskey": "Passkey hinzufügen",
  "deletePasskey": "Entfernen",
  "confirmDelete": "Diesen Passkey entfernen?",
  "cannotDeleteLast": "Du musst mindestens einen Passkey haben.",
  "added": "Hinzugefügt {{date}}"
}
```

**Step 4: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add passkey management to settings page"
```

---

### Task 10: Remove Apple frontend code and clean up .env

**Files:**
- Modify: `frontend/src/i18n/en.json` (remove `signInWithApple`)
- Modify: `frontend/src/i18n/de.json` (remove `signInWithApple`)
- Modify: `.env` (remove Apple vars, add WebAuthn vars)
- Modify: `.env.example` (same)
- Modify: `CLAUDE.md` (update env vars section)

**Step 1: Clean up i18n**

Remove `"signInWithApple"` key from both `en.json` and `de.json` (if not already done in Task 7).

**Step 2: Update .env files**

Remove Apple vars, add WebAuthn vars (if not already done in Task 1).

**Step 3: Update CLAUDE.md**

In the Environment Variables section, replace Apple keys with:
```
`WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN`
```

**Step 4: Run full test suite**

Run:
```bash
pytest
cd frontend && npm run lint
```

Expected: All backend tests pass, no frontend lint errors.

**Step 5: Commit**

```bash
git add -A && git commit -m "chore: clean up Apple auth remnants and update docs"
```

---

### Task 11: Create first user / bootstrap flow

Since registration requires an invite, and invites require an existing household owner, we need a bootstrap mechanism.

**Files:**
- Create: `backend/users/management/commands/create_first_household.py`

**Step 1: Write the management command**

Create `backend/users/management/commands/create_first_household.py`:

```python
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from users.models import Household, HouseholdMember, Invite

User = get_user_model()


class Command(BaseCommand):
    help = "Create the first household and an invite link for the first user to register."

    def add_arguments(self, parser):
        parser.add_argument("household_name", type=str, help="Name of the household")

    def handle(self, *args, **options):
        household_name = options["household_name"]

        household = Household.objects.create(name=household_name)

        # Create a system user to own the invite (will be replaced by first registrant)
        system_user, _ = User.objects.get_or_create(
            email="system@cookless.local",
            defaults={"is_active": False},
        )
        HouseholdMember.objects.create(
            household=household,
            user=system_user,
            role=HouseholdMember.Role.OWNER,
        )

        invite = Invite.objects.create(
            household=household,
            created_by=system_user,
            expires_at=timezone.now() + timedelta(days=30),
        )

        self.stdout.write(self.style.SUCCESS(f"Household '{household_name}' created."))
        self.stdout.write(self.style.SUCCESS(f"Invite code: {invite.code}"))
        self.stdout.write(
            self.style.SUCCESS(f"Registration URL: /invite/{invite.code}")
        )
```

Note: The first user who registers via this invite becomes a MEMBER. You can promote them to OWNER via Django admin. Alternatively, update the register_complete endpoint to make the first member of a household an OWNER — but that adds complexity. Admin promotion is simpler for a one-time bootstrap.

**Step 2: Run it to verify**

Run: `cd backend && python manage.py create_first_household "My Kitchen"`
Expected: Prints invite code and URL.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add create_first_household management command"
```

---

### Task 12: Final integration test and cleanup

**Step 1: Run full backend test suite**

Run: `pytest -v`
Expected: All tests pass.

**Step 2: Run ruff lint and format**

Run: `ruff check . --fix && ruff format .`
Expected: Clean.

**Step 3: Run mypy**

Run: `cd backend && mypy --config-file=../pyproject.toml .`
Expected: No errors (may need to add `py-webauthn` to mypy ignore if stubs are missing).

**Step 4: Run frontend checks**

Run: `cd frontend && npm run lint && npm run build`
Expected: No errors, build succeeds.

**Step 5: Final commit if any formatting changes**

```bash
git add -A && git commit -m "chore: lint and format"
```
