# Password Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add password authentication alongside existing passkey auth, allowing registration and login with passwords while preferring passkeys.

**Architecture:** Extend existing Django `AbstractBaseUser` password infrastructure (`set_password()`, `check_password()`, `has_usable_password()`). Add new API endpoints for password registration, login, set/change/remove. Update `UserOut` schema with `has_password` and `has_passkey`. Update frontend login, registration, and settings pages.

**Tech Stack:** Django 5.1, Django Ninja, React 19, TypeScript, Tailwind CSS, react-i18next

**Design doc:** `docs/plans/2026-02-25-password-auth-design.md`

---

### Task 1: Backend — Add `has_passkey` property to User model

**Files:**
- Modify: `backend/users/models.py:39-63`
- Test: `backend/users/tests/test_models.py`

**Step 1: Write the failing test**

Add to `backend/users/tests/test_models.py`:

```python
@pytest.mark.django_db
def test_user_has_passkey_false_by_default():
    user = User.objects.create_user(email="passkey-test@example.com")
    assert user.has_passkey is False


@pytest.mark.django_db
def test_user_has_passkey_true_with_credential():
    user = User.objects.create_user(email="passkey-test2@example.com")
    PasskeyCredential.objects.create(
        user=user,
        credential_id=b"test-credential-id",
        public_key=b"test-public-key",
        sign_count=0,
        device_name="Test Device",
    )
    assert user.has_passkey is True
```

Make sure `PasskeyCredential` is imported at the top of the test file.

**Step 2: Run tests to verify they fail**

Run: `pytest backend/users/tests/test_models.py -v -k "has_passkey"`
Expected: FAIL — `AttributeError: 'User' object has no attribute 'has_passkey'`

**Step 3: Write minimal implementation**

Add to `User` class in `backend/users/models.py` after the `__str__` method:

```python
@property
def has_passkey(self) -> bool:
    return self.passkey_credentials.exists()
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/users/tests/test_models.py -v -k "has_passkey"`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/users/models.py backend/users/tests/test_models.py
git commit -m "feat: add has_passkey property to User model"
```

---

### Task 2: Backend — Update UserOut schema with has_password and has_passkey

**Files:**
- Modify: `backend/users/schemas.py:37-42`
- Test: `backend/users/tests/test_auth.py`

**Step 1: Write the failing test**

Add to `backend/users/tests/test_auth.py`:

```python
@pytest.mark.django_db
def test_me_endpoint_includes_has_password_and_has_passkey():
    client = Client()
    user = User.objects.create_user(email="schema-test@example.com")
    client.force_login(user)
    response = client.get("/api/v1/users/me/")
    assert response.status_code == 200
    data = response.json()
    assert "has_password" in data
    assert "has_passkey" in data
    assert data["has_password"] is False
    assert data["has_passkey"] is False


@pytest.mark.django_db
def test_me_endpoint_has_password_true_when_set():
    client = Client()
    user = User.objects.create_user(email="pw-test@example.com")
    user.set_password("testpassword123")
    user.save()
    client.force_login(user)
    response = client.get("/api/v1/users/me/")
    data = response.json()
    assert data["has_password"] is True
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/users/tests/test_auth.py -v -k "has_password"`
Expected: FAIL — `has_password` not in response

**Step 3: Write minimal implementation**

Update `UserOut` in `backend/users/schemas.py`:

```python
class UserOut(Schema):
    id: UUID
    email: str
    preferred_language: str
    settings: dict
    active_household: HouseholdSummaryOut | None
    has_password: bool
    has_passkey: bool

    @staticmethod
    def resolve_has_password(obj):
        return obj.has_usable_password()

    @staticmethod
    def resolve_has_passkey(obj):
        return obj.has_passkey
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/users/tests/test_auth.py -v -k "has_password"`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/users/schemas.py backend/users/tests/test_auth.py
git commit -m "feat: add has_password and has_passkey to UserOut schema"
```

---

### Task 3: Backend — Password login endpoint

**Files:**
- Modify: `backend/users/schemas.py` (add `LoginPasswordIn`)
- Modify: `backend/users/api.py` (add endpoint + import)
- Test: `backend/users/tests/test_auth.py`

**Step 1: Write the failing tests**

Add to `backend/users/tests/test_auth.py`:

```python
@pytest.mark.django_db
def test_password_login_success():
    client = Client()
    user = User.objects.create_user(email="login@example.com")
    user.set_password("correctpassword1")
    user.save()
    response = client.post(
        "/api/v1/auth/login/password/",
        json.dumps({"email": "login@example.com", "password": "correctpassword1"}),
        content_type="application/json",
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "login@example.com"


@pytest.mark.django_db
def test_password_login_wrong_password():
    client = Client()
    user = User.objects.create_user(email="login-fail@example.com")
    user.set_password("correctpassword1")
    user.save()
    response = client.post(
        "/api/v1/auth/login/password/",
        json.dumps({"email": "login-fail@example.com", "password": "wrongpassword"}),
        content_type="application/json",
    )
    assert response.status_code == 401


@pytest.mark.django_db
def test_password_login_no_account():
    client = Client()
    response = client.post(
        "/api/v1/auth/login/password/",
        json.dumps({"email": "nobody@example.com", "password": "whatever123"}),
        content_type="application/json",
    )
    assert response.status_code == 401


@pytest.mark.django_db
def test_password_login_no_password_set():
    client = Client()
    User.objects.create_user(email="nopassword@example.com")
    response = client.post(
        "/api/v1/auth/login/password/",
        json.dumps({"email": "nopassword@example.com", "password": "whatever123"}),
        content_type="application/json",
    )
    assert response.status_code == 401
```

Add `import json` to the top of the test file if not already present.

**Step 2: Run tests to verify they fail**

Run: `pytest backend/users/tests/test_auth.py -v -k "password_login"`
Expected: FAIL — 404 (endpoint doesn't exist)

**Step 3: Write minimal implementation**

Add schema to `backend/users/schemas.py`:

```python
class LoginPasswordIn(Schema):
    email: str
    password: str
```

Add endpoint to `backend/users/api.py` in the Auth section, and add `LoginPasswordIn` to the imports from `users.schemas`:

```python
@router.post("/auth/login/password/", auth=None, response=UserOut, tags=["auth"])
def login_password(request, payload: LoginPasswordIn):
    user = User.objects.filter(email=payload.email).first()
    if not user or not user.check_password(payload.password):
        raise HttpError(401, "Invalid email or password.")
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return user
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/users/tests/test_auth.py -v -k "password_login"`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/users/schemas.py backend/users/api.py backend/users/tests/test_auth.py
git commit -m "feat: add password login endpoint"
```

---

### Task 4: Backend — Password registration endpoint

**Files:**
- Modify: `backend/users/schemas.py` (add `RegisterPasswordIn`)
- Modify: `backend/users/api.py` (add endpoint + import)
- Test: `backend/users/tests/test_auth.py`

**Step 1: Write the failing tests**

Add to `backend/users/tests/test_auth.py`. These tests need invite fixtures:

```python
from datetime import timedelta
from django.utils import timezone
from users.models import Household, HouseholdMember, Invite


def _create_invite():
    """Helper to create a valid invite for testing."""
    owner = User.objects.create_user(email="owner@example.com")
    household = Household.objects.create(name="Test Household")
    HouseholdMember.objects.create(
        household=household, user=owner, role=HouseholdMember.Role.OWNER
    )
    invite = Invite.objects.create(
        household=household,
        created_by=owner,
        expires_at=timezone.now() + timedelta(days=7),
    )
    return invite


@pytest.mark.django_db
def test_password_register_success():
    client = Client()
    invite = _create_invite()
    response = client.post(
        "/api/v1/auth/register/password/",
        json.dumps({
            "email": "newuser@example.com",
            "password": "securepassword1",
            "invite_code": invite.code,
        }),
        content_type="application/json",
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["has_password"] is True
    assert data["has_passkey"] is False
    # Verify user is logged in (session established)
    me_response = client.get("/api/v1/users/me/")
    assert me_response.status_code == 200


@pytest.mark.django_db
def test_password_register_invalid_invite():
    client = Client()
    response = client.post(
        "/api/v1/auth/register/password/",
        json.dumps({
            "email": "newuser2@example.com",
            "password": "securepassword1",
            "invite_code": "invalid-code",
        }),
        content_type="application/json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_password_register_email_taken():
    client = Client()
    invite = _create_invite()
    User.objects.create_user(email="taken@example.com")
    response = client.post(
        "/api/v1/auth/register/password/",
        json.dumps({
            "email": "taken@example.com",
            "password": "securepassword1",
            "invite_code": invite.code,
        }),
        content_type="application/json",
    )
    assert response.status_code == 409


@pytest.mark.django_db
def test_password_register_weak_password():
    client = Client()
    invite = _create_invite()
    response = client.post(
        "/api/v1/auth/register/password/",
        json.dumps({
            "email": "weakpw@example.com",
            "password": "123",
            "invite_code": invite.code,
        }),
        content_type="application/json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_password_register_consumes_invite():
    client = Client()
    invite = _create_invite()
    client.post(
        "/api/v1/auth/register/password/",
        json.dumps({
            "email": "consumer@example.com",
            "password": "securepassword1",
            "invite_code": invite.code,
        }),
        content_type="application/json",
    )
    invite.refresh_from_db()
    assert invite.used_by is not None
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/users/tests/test_auth.py -v -k "password_register"`
Expected: FAIL — 404 (endpoint doesn't exist)

**Step 3: Write minimal implementation**

Add schema to `backend/users/schemas.py`:

```python
class RegisterPasswordIn(Schema):
    email: str
    password: str
    invite_code: str
```

Add endpoint to `backend/users/api.py` in the Auth section. Add `RegisterPasswordIn` to imports from `users.schemas`. Also add `from django.contrib.auth.password_validation import validate_password` and `from django.core.exceptions import ValidationError` to imports:

```python
@router.post("/auth/register/password/", auth=None, response=UserOut, tags=["auth"])
def register_password(request, payload: RegisterPasswordIn):
    # Validate invite
    invite = Invite.objects.filter(code=payload.invite_code).first()
    if not invite:
        raise HttpError(400, "Invalid invite code.")
    if invite.is_expired:
        raise HttpError(400, "This invite has expired.")
    if invite.used_by is not None:
        raise HttpError(400, "This invite has already been used.")

    # Check email not taken
    if User.objects.filter(email=payload.email).exists():
        raise HttpError(409, "A user with this email already exists.")

    # Validate password
    try:
        validate_password(payload.password)
    except ValidationError as e:
        raise HttpError(400, " ".join(e.messages)) from None

    # Create user with password
    user = User.objects.create_user(email=payload.email)
    user.set_password(payload.password)
    user.save()

    # Determine role (bootstrap: if invite creator is inactive, promote to OWNER)
    role = HouseholdMember.Role.MEMBER
    if not invite.created_by.is_active:
        role = HouseholdMember.Role.OWNER

    HouseholdMember.objects.create(
        household=invite.household,
        user=user,
        role=role,
    )

    # Set active household
    user.active_household = invite.household
    user.save()

    # Consume invite
    invite.used_by = user
    invite.save()

    # Log user in
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")

    return user
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/users/tests/test_auth.py -v -k "password_register"`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/users/schemas.py backend/users/api.py backend/users/tests/test_auth.py
git commit -m "feat: add password registration endpoint"
```

---

### Task 5: Backend — Set/change password endpoint

**Files:**
- Modify: `backend/users/schemas.py` (add `SetPasswordIn`)
- Modify: `backend/users/api.py` (add endpoint + import)
- Test: `backend/users/tests/test_auth.py`

**Step 1: Write the failing tests**

Add to `backend/users/tests/test_auth.py`:

```python
@pytest.mark.django_db
def test_set_password_when_none_exists():
    client = Client()
    user = User.objects.create_user(email="setpw@example.com")
    client.force_login(user)
    response = client.post(
        "/api/v1/users/me/password/",
        json.dumps({"new_password": "mynewpassword1"}),
        content_type="application/json",
    )
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.has_usable_password()
    assert user.check_password("mynewpassword1")


@pytest.mark.django_db
def test_change_password_requires_current():
    client = Client()
    user = User.objects.create_user(email="changepw@example.com")
    user.set_password("oldpassword123")
    user.save()
    client.force_login(user)
    # Missing current_password should fail
    response = client.post(
        "/api/v1/users/me/password/",
        json.dumps({"new_password": "newpassword123"}),
        content_type="application/json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_change_password_wrong_current():
    client = Client()
    user = User.objects.create_user(email="wrongcurrent@example.com")
    user.set_password("oldpassword123")
    user.save()
    client.force_login(user)
    response = client.post(
        "/api/v1/users/me/password/",
        json.dumps({"current_password": "wrongpassword", "new_password": "newpassword123"}),
        content_type="application/json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_change_password_success():
    client = Client()
    user = User.objects.create_user(email="changeok@example.com")
    user.set_password("oldpassword123")
    user.save()
    client.force_login(user)
    response = client.post(
        "/api/v1/users/me/password/",
        json.dumps({"current_password": "oldpassword123", "new_password": "newpassword123"}),
        content_type="application/json",
    )
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.check_password("newpassword123")


@pytest.mark.django_db
def test_set_password_weak_rejected():
    client = Client()
    user = User.objects.create_user(email="weakset@example.com")
    client.force_login(user)
    response = client.post(
        "/api/v1/users/me/password/",
        json.dumps({"new_password": "123"}),
        content_type="application/json",
    )
    assert response.status_code == 400
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/users/tests/test_auth.py -v -k "set_password or change_password"`
Expected: FAIL — 404/405

**Step 3: Write minimal implementation**

Add schema to `backend/users/schemas.py`:

```python
class SetPasswordIn(Schema):
    current_password: str | None = None
    new_password: str
```

Add endpoint to `backend/users/api.py`. Add `SetPasswordIn` to imports from `users.schemas`:

```python
@router.post("/users/me/password/", response=MessageOut, tags=["users"])
def set_password(request, payload: SetPasswordIn):
    user = request.user
    if user.has_usable_password():
        if not payload.current_password:
            raise HttpError(400, "Current password is required.")
        if not user.check_password(payload.current_password):
            raise HttpError(400, "Current password is incorrect.")

    try:
        validate_password(payload.new_password, user=user)
    except ValidationError as e:
        raise HttpError(400, " ".join(e.messages)) from None

    user.set_password(payload.new_password)
    user.save()
    # Keep the user logged in after password change
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return {"detail": "Password updated."}
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/users/tests/test_auth.py -v -k "set_password or change_password"`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/users/schemas.py backend/users/api.py backend/users/tests/test_auth.py
git commit -m "feat: add set/change password endpoint"
```

---

### Task 6: Backend — Remove password endpoint

**Files:**
- Modify: `backend/users/api.py` (add endpoint)
- Test: `backend/users/tests/test_auth.py`

**Step 1: Write the failing tests**

Add to `backend/users/tests/test_auth.py`:

```python
@pytest.mark.django_db
def test_remove_password_with_passkey():
    client = Client()
    user = User.objects.create_user(email="removepw@example.com")
    user.set_password("mypassword123")
    user.save()
    PasskeyCredential.objects.create(
        user=user,
        credential_id=b"cred-remove-test",
        public_key=b"key-remove-test",
        sign_count=0,
        device_name="Test",
    )
    client.force_login(user)
    response = client.delete("/api/v1/users/me/password/")
    assert response.status_code == 200
    user.refresh_from_db()
    assert not user.has_usable_password()


@pytest.mark.django_db
def test_remove_password_without_passkey_fails():
    client = Client()
    user = User.objects.create_user(email="removepw-fail@example.com")
    user.set_password("mypassword123")
    user.save()
    client.force_login(user)
    response = client.delete("/api/v1/users/me/password/")
    assert response.status_code == 400


@pytest.mark.django_db
def test_remove_password_when_no_password():
    client = Client()
    user = User.objects.create_user(email="removepw-none@example.com")
    client.force_login(user)
    response = client.delete("/api/v1/users/me/password/")
    assert response.status_code == 400
```

Add `from users.models import PasskeyCredential` to the imports at the top if not already present (it may already be imported from task 4 helpers — adjust as needed, ensuring `Household`, `HouseholdMember`, `Invite`, and `PasskeyCredential` are all imported from `users.models`).

**Step 2: Run tests to verify they fail**

Run: `pytest backend/users/tests/test_auth.py -v -k "remove_password"`
Expected: FAIL — 404/405

**Step 3: Write minimal implementation**

Add endpoint to `backend/users/api.py`:

```python
@router.delete("/users/me/password/", response=MessageOut, tags=["users"])
def remove_password(request):
    user = request.user
    if not user.has_usable_password():
        raise HttpError(400, "No password is set.")
    if not user.has_passkey:
        raise HttpError(400, "Cannot remove password without at least one passkey.")
    user.set_unusable_password()
    user.save()
    return {"detail": "Password removed."}
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/users/tests/test_auth.py -v -k "remove_password"`
Expected: PASS

**Step 5: Run all backend tests to check for regressions**

Run: `pytest backend/ -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add backend/users/api.py backend/users/tests/test_auth.py
git commit -m "feat: add remove password endpoint"
```

---

### Task 7: Backend — Update delete_passkey to check for password

**Files:**
- Modify: `backend/users/api.py:201-207` (update `delete_passkey`)
- Test: `backend/users/tests/test_passkey_management.py`

The current `delete_passkey` prevents deleting the last passkey. Now that users can have passwords, we should allow deleting the last passkey IF the user has a password set.

**Step 1: Write the failing test**

Check current tests in `backend/users/tests/test_passkey_management.py` first and add:

```python
@pytest.mark.django_db
def test_delete_last_passkey_allowed_with_password():
    client = Client()
    user = User.objects.create_user(email="delete-last@example.com")
    user.set_password("securepassword1")
    user.save()
    credential = PasskeyCredential.objects.create(
        user=user,
        credential_id=b"cred-delete-last",
        public_key=b"key-delete-last",
        sign_count=0,
        device_name="Test",
    )
    client.force_login(user)
    response = client.delete(f"/api/v1/users/me/passkeys/{credential.id}/")
    assert response.status_code == 204
```

Ensure imports at top of the test file include `User`, `PasskeyCredential`, `Client`, and `pytest`.

**Step 2: Run test to verify it fails**

Run: `pytest backend/users/tests/test_passkey_management.py -v -k "delete_last_passkey_allowed_with_password"`
Expected: FAIL — 400 "Cannot delete your only passkey."

**Step 3: Write minimal implementation**

Update `delete_passkey` in `backend/users/api.py`:

```python
@router.delete("/users/me/passkeys/{passkey_id}/", response={204: None}, tags=["passkeys"])
def delete_passkey(request, passkey_id: UUID):
    credential = get_object_or_404(PasskeyCredential, id=passkey_id, user=request.user)
    is_last_passkey = PasskeyCredential.objects.filter(user=request.user).count() <= 1
    if is_last_passkey and not request.user.has_usable_password():
        raise HttpError(400, "Cannot delete your only passkey without a password set.")
    credential.delete()
    return None
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/users/tests/test_passkey_management.py -v`
Expected: PASS (check that existing "cannot delete last passkey" test still passes — it tests a user without a password)

**Step 5: Commit**

```bash
git add backend/users/api.py backend/users/tests/test_passkey_management.py
git commit -m "feat: allow deleting last passkey if user has password"
```

---

### Task 8: Frontend — Update types and auth context

**Files:**
- Modify: `frontend/src/api/types.ts:21-27`
- Modify: `frontend/src/contexts/authContextValue.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx`

**Step 1: Update User type**

In `frontend/src/api/types.ts`, update the `User` interface:

```typescript
export interface User {
  id: string;
  email: string;
  preferred_language: string;
  settings: UserSettings;
  active_household: HouseholdSummary | null;
  has_password: boolean;
  has_passkey: boolean;
}
```

**Step 2: Update AuthContextValue interface**

In `frontend/src/contexts/authContextValue.ts`, add new methods:

```typescript
export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string) => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  register: (email: string, inviteCode: string) => Promise<void>;
  registerWithPassword: (email: string, password: string, inviteCode: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}
```

**Step 3: Update AuthProvider**

In `frontend/src/contexts/AuthContext.tsx`, add the new auth methods:

```typescript
const loginWithPassword = useCallback(async (email: string, password: string) => {
  const loggedInUser = await api.post<User>("/api/v1/auth/login/password/", {
    email,
    password,
  });
  setUser(loggedInUser);
}, []);

const registerWithPassword = useCallback(
  async (email: string, password: string, inviteCode: string) => {
    const newUser = await api.post<User>("/api/v1/auth/register/password/", {
      email,
      password,
      invite_code: inviteCode,
    });
    setUser(newUser);
  },
  [],
);
```

Add these to the `useMemo` value object and its dependency array.

**Step 4: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds (may have lint warnings about unused vars until UI is updated)

**Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/contexts/authContextValue.ts frontend/src/contexts/AuthContext.tsx
git commit -m "feat: add password auth methods to frontend auth context"
```

---

### Task 9: Frontend — Add i18n strings

**Files:**
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Add English strings**

Add to `auth` section in `frontend/src/i18n/en.json`:

```json
"signInWithPassword": "Sign in with Password",
"signInWithPasskey": "Sign in with Passkey",
"password": "Password",
"passwordPlaceholder": "Enter password",
"passwordLoginFailed": "Invalid email or password.",
"orDivider": "or"
```

Add to `invite` section:

```json
"registerWithPasskey": "Create Account & Set Up Passkey",
"registerWithPassword": "Create Account with Password",
"passkeyRecommendation": "For better security, consider adding a passkey in Settings."
```

Add new `password` section:

```json
"password": {
  "title": "Password",
  "setPassword": "Set Password",
  "changePassword": "Change Password",
  "removePassword": "Remove Password",
  "currentPassword": "Current password",
  "newPassword": "New password",
  "confirmPassword": "Confirm password",
  "passwordMismatch": "Passwords do not match.",
  "passwordSet": "Password set!",
  "passwordChanged": "Password changed!",
  "passwordRemoved": "Password removed.",
  "removeConfirm": "Remove your password? You'll need a passkey to log in.",
  "noPasswordSet": "No password set."
}
```

**Step 2: Add German strings**

Add equivalent translations to `frontend/src/i18n/de.json`:

Auth section:

```json
"signInWithPassword": "Mit Passwort anmelden",
"signInWithPasskey": "Mit Passkey anmelden",
"password": "Passwort",
"passwordPlaceholder": "Passwort eingeben",
"passwordLoginFailed": "Ungültige E-Mail oder Passwort.",
"orDivider": "oder"
```

Invite section:

```json
"registerWithPasskey": "Konto erstellen & Passkey einrichten",
"registerWithPassword": "Konto mit Passwort erstellen",
"passkeyRecommendation": "Für mehr Sicherheit, füge einen Passkey in den Einstellungen hinzu."
```

Password section:

```json
"password": {
  "title": "Passwort",
  "setPassword": "Passwort festlegen",
  "changePassword": "Passwort ändern",
  "removePassword": "Passwort entfernen",
  "currentPassword": "Aktuelles Passwort",
  "newPassword": "Neues Passwort",
  "confirmPassword": "Passwort bestätigen",
  "passwordMismatch": "Passwörter stimmen nicht überein.",
  "passwordSet": "Passwort festgelegt!",
  "passwordChanged": "Passwort geändert!",
  "passwordRemoved": "Passwort entfernt.",
  "removeConfirm": "Passwort entfernen? Du benötigst dann einen Passkey zum Anmelden.",
  "noPasswordSet": "Kein Passwort festgelegt."
}
```

**Step 3: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/i18n/en.json frontend/src/i18n/de.json
git commit -m "feat: add i18n strings for password authentication"
```

---

### Task 10: Frontend — Update LoginPage with password option

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`

**Step 1: Update LoginPage**

Rewrite `frontend/src/pages/LoginPage.tsx` to show two login options — passkey (primary) and password (secondary). The page should:

1. Show email input field (shared between both methods)
2. Show "Sign in with Passkey" button (primary, orange filled)
3. Show divider with "or"
4. Show "Sign in with Password" button (secondary, orange outline) that expands a password field
5. When password mode is active, show password input and submit button
6. Keep error handling for both methods

Use `useAuth` hook's `login` for passkey and `loginWithPassword` for password. Follow existing Tailwind patterns from the current `LoginPage.tsx` (orange-500 accent, rounded-lg, same input styling).

**Step 2: Verify frontend builds and lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: Build and lint succeed

**Step 3: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat: add password login option to login page"
```

---

### Task 11: Frontend — Update InvitePage with password registration

**Files:**
- Modify: `frontend/src/pages/InvitePage.tsx`

**Step 1: Update InvitePage registration form**

Update the "Not logged in" registration section of `frontend/src/pages/InvitePage.tsx` to:

1. Show email input (existing)
2. Show "Create Account & Set Up Passkey" button (primary, existing behavior via `register`)
3. Show divider with "or"
4. Show "Create Account with Password" button (secondary) that expands a password field
5. When password mode is active, show password + confirm password inputs and submit
6. After successful password registration, show a brief nudge message: "For better security, consider adding a passkey in Settings." before navigating

Use `useAuth` hook's `registerWithPassword` for the password path.

**Step 2: Verify frontend builds and lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: Build and lint succeed

**Step 3: Commit**

```bash
git add frontend/src/pages/InvitePage.tsx
git commit -m "feat: add password registration option to invite page"
```

---

### Task 12: Frontend — Add password section to SettingsPage

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

**Step 1: Add password management section**

Add a new "Password" card section to `frontend/src/pages/SettingsPage.tsx` between the Passkeys section and the Account section. It should:

1. Show section title "Password"
2. If `user.has_password` is false: show "Set Password" form with new_password + confirm_password inputs
3. If `user.has_password` is true: show "Change Password" form with current_password + new_password + confirm_password, plus a "Remove Password" button (only enabled if `user.has_passkey`)
4. Client-side validation: confirm_password must match new_password
5. API calls:
   - Set/change: `POST /api/v1/users/me/password/` with `{ current_password, new_password }`
   - Remove: `DELETE /api/v1/users/me/password/`
6. After success, call `refreshUser()` to update `has_password` state
7. Show success/error feedback

Follow existing Tailwind patterns from the SettingsPage (rounded-lg bg-white p-4 shadow-sm cards, orange-500 buttons).

**Step 2: Also update the delete passkey button guard**

The passkey delete button currently disables when `passkeys.length <= 1`. Update it to disable when `passkeys.length <= 1 && !user?.has_password`. Update the tooltip text accordingly.

**Step 3: Verify frontend builds and lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: Build and lint succeed

**Step 4: Commit**

```bash
git add frontend/src/pages/SettingsPage.tsx
git commit -m "feat: add password management section to settings page"
```

---

### Task 13: Final verification

**Step 1: Run all backend tests**

Run: `pytest backend/ -v`
Expected: All PASS

**Step 2: Run all frontend checks**

Run: `cd frontend && npm run build && npm run lint && npm test`
Expected: All PASS

**Step 3: Run pre-commit hooks**

Run: `pre-commit run --all-files`
Expected: All PASS

**Step 4: Fix any issues found, then commit fixes if needed**
