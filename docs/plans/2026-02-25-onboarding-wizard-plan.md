# Onboarding Wizard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a backend-driven onboarding wizard that guides the initial admin user through changing their password, adding a passkey, and creating a household before using the app.

**Architecture:** Add an `onboarding_step` field to the User model that tracks progress through CHANGE_PASSWORD → ADD_PASSKEY → CREATE_HOUSEHOLD → COMPLETED. Frontend adds a `/setup` route with a step-by-step wizard and a `/welcome` page shown after completion. Layout guards redirect incomplete users to `/setup`.

**Tech Stack:** Django 5.1, Django Ninja, React 19, TypeScript, Tailwind CSS, react-i18next

---

## Task 1: Add onboarding_step field to User model

**Files:**
- Modify: `backend/users/models.py:39-67`

**Step 1: Add the OnboardingStep choices and field to the User model**

In `backend/users/models.py`, add `OnboardingStep` as a `TextChoices` inside the `User` class (after the `Language` class on line 43), and add the `onboarding_step` field:

```python
class OnboardingStep(models.TextChoices):
    CHANGE_PASSWORD = "CHANGE_PASSWORD", "Change Password"
    ADD_PASSKEY = "ADD_PASSKEY", "Add Passkey"
    CREATE_HOUSEHOLD = "CREATE_HOUSEHOLD", "Create Household"
    COMPLETED = "COMPLETED", "Completed"

onboarding_step = models.CharField(
    max_length=20,
    choices=OnboardingStep.choices,
    default=OnboardingStep.CHANGE_PASSWORD,
)
```

**Step 2: Create and run the migration**

```bash
cd backend && python manage.py makemigrations users
cd backend && python manage.py migrate
```

**Step 3: Commit**

```bash
git add backend/users/models.py backend/users/migrations/
git commit -m "feat(onboarding): add onboarding_step field to User model"
```

---

## Task 2: Expose onboarding_step in UserOut schema

**Files:**
- Modify: `backend/users/schemas.py:37-52`

**Step 1: Write the failing test**

In `backend/users/tests/test_api.py`, add a test to the `TestGetMe` class:

```python
def test_get_me_includes_onboarding_step(self, api_client, user):
    api_client.force_login(user)
    resp = api_client.get("/api/v1/users/me/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["onboarding_step"] == "CHANGE_PASSWORD"
```

**Step 2: Run test to verify it fails**

```bash
pytest backend/users/tests/test_api.py::TestGetMe::test_get_me_includes_onboarding_step -v
```

Expected: FAIL — `onboarding_step` not in response.

**Step 3: Add onboarding_step to UserOut schema**

In `backend/users/schemas.py`, add to the `UserOut` class:

```python
onboarding_step: str
```

**Step 4: Run test to verify it passes**

```bash
pytest backend/users/tests/test_api.py::TestGetMe::test_get_me_includes_onboarding_step -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/users/schemas.py backend/users/tests/test_api.py
git commit -m "feat(onboarding): expose onboarding_step in /me/ response"
```

---

## Task 3: Add skip-passkey endpoint

**Files:**
- Modify: `backend/users/api.py`
- Test: `backend/users/tests/test_api.py`

**Step 1: Write the failing tests**

Add a new test class in `backend/users/tests/test_api.py`:

```python
@pytest.mark.django_db
class TestSkipPasskey:
    def test_skip_passkey_advances_step(self, api_client, user):
        user.onboarding_step = "ADD_PASSKEY"
        user.save()
        api_client.force_login(user)
        resp = api_client.post("/api/v1/users/me/skip-passkey/")
        assert resp.status_code == 200
        user.refresh_from_db()
        assert user.onboarding_step == "CREATE_HOUSEHOLD"

    def test_skip_passkey_wrong_step(self, api_client, user):
        user.onboarding_step = "CHANGE_PASSWORD"
        user.save()
        api_client.force_login(user)
        resp = api_client.post("/api/v1/users/me/skip-passkey/")
        assert resp.status_code == 400
```

**Step 2: Run tests to verify they fail**

```bash
pytest backend/users/tests/test_api.py::TestSkipPasskey -v
```

Expected: FAIL — endpoint doesn't exist (404).

**Step 3: Implement the skip-passkey endpoint**

In `backend/users/api.py`, add after the `set_password` endpoint (around line 99):

```python
@router.post("/users/me/skip-passkey/", response=MessageOut, tags=["users"])
def skip_passkey(request):
    user = request.user
    if user.onboarding_step != "ADD_PASSKEY":
        raise HttpError(400, "Not at the passkey step.")
    user.onboarding_step = "CREATE_HOUSEHOLD"
    user.save()
    return {"detail": "Passkey step skipped."}
```

**Step 4: Run tests to verify they pass**

```bash
pytest backend/users/tests/test_api.py::TestSkipPasskey -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/users/api.py backend/users/tests/test_api.py
git commit -m "feat(onboarding): add skip-passkey endpoint"
```

---

## Task 4: Advance onboarding_step in existing endpoints

**Files:**
- Modify: `backend/users/api.py:84-99` (set_password)
- Modify: `backend/users/api.py:329-351` (add_passkey_complete)
- Modify: `backend/users/api.py:128-139` (create_household)
- Test: `backend/users/tests/test_api.py`

**Step 1: Write failing tests for onboarding advancement**

Add to `backend/users/tests/test_api.py`:

```python
@pytest.mark.django_db
class TestOnboardingAdvancement:
    def test_set_password_advances_from_change_password(self, api_client, user):
        user.set_password("OldPass123!")
        user.onboarding_step = "CHANGE_PASSWORD"
        user.save()
        api_client.force_login(user)
        resp = api_client.post(
            "/api/v1/users/me/password/",
            json.dumps({"current_password": "OldPass123!", "new_password": "NewSecure456!"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        user.refresh_from_db()
        assert user.onboarding_step == "ADD_PASSKEY"

    def test_set_password_no_advance_if_not_onboarding(self, api_client, user):
        user.set_password("OldPass123!")
        user.onboarding_step = "COMPLETED"
        user.save()
        api_client.force_login(user)
        resp = api_client.post(
            "/api/v1/users/me/password/",
            json.dumps({"current_password": "OldPass123!", "new_password": "NewSecure456!"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        user.refresh_from_db()
        assert user.onboarding_step == "COMPLETED"

    def test_create_household_advances_from_create_household(self, api_client, user):
        user.onboarding_step = "CREATE_HOUSEHOLD"
        user.save()
        api_client.force_login(user)
        resp = api_client.post(
            "/api/v1/households/",
            json.dumps({"name": "My Home"}),
            content_type="application/json",
        )
        assert resp.status_code == 201
        user.refresh_from_db()
        assert user.onboarding_step == "COMPLETED"
```

**Step 2: Run tests to verify they fail**

```bash
pytest backend/users/tests/test_api.py::TestOnboardingAdvancement -v
```

Expected: FAIL — onboarding_step not advancing.

**Step 3: Modify set_password to advance onboarding**

In `backend/users/api.py`, in the `set_password` function, add before `return`:

```python
if user.onboarding_step == "CHANGE_PASSWORD":
    user.onboarding_step = "ADD_PASSKEY"
    user.save()
```

Note: `user.save()` is already called on line 97, so instead modify the existing save to include the step change before it. The full function should look like:

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
    if user.onboarding_step == "CHANGE_PASSWORD":
        user.onboarding_step = "ADD_PASSKEY"
    user.save()
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return {"detail": "Password updated."}
```

**Step 4: Modify add_passkey_complete to advance onboarding**

In `backend/users/api.py`, in the `add_passkey_complete` function (line 330), add before the return statement:

```python
if request.user.onboarding_step == "ADD_PASSKEY":
    request.user.onboarding_step = "CREATE_HOUSEHOLD"
    request.user.save()
```

**Step 5: Modify create_household to advance onboarding**

In `backend/users/api.py`, in the `create_household` function (line 128), modify the section that sets active_household. After `request.user.save()` on line 138, or combine with the existing conditional:

```python
@router.post("/households/", response={201: HouseholdOut}, tags=["households"])
def create_household(request, payload: HouseholdCreateIn):
    household = Household.objects.create(name=payload.name)
    HouseholdMember.objects.create(
        household=household,
        user=request.user,
        role=HouseholdMember.Role.OWNER,
    )
    if not request.user.active_household:
        request.user.active_household = household
    if request.user.onboarding_step == "CREATE_HOUSEHOLD":
        request.user.onboarding_step = "COMPLETED"
    request.user.save()
    return household
```

**Step 6: Run tests to verify they pass**

```bash
pytest backend/users/tests/test_api.py::TestOnboardingAdvancement -v
```

Expected: PASS

**Step 7: Run all backend tests to check for regressions**

```bash
pytest
```

Expected: All tests pass.

**Step 8: Commit**

```bash
git add backend/users/api.py backend/users/tests/test_api.py
git commit -m "feat(onboarding): advance onboarding_step in password, passkey, and household endpoints"
```

---

## Task 5: Set onboarding_step=COMPLETED for invite-registered users

**Files:**
- Modify: `backend/users/api.py:366-395` (register_password endpoint)
- Modify: `backend/users/api.py:434-509` (register_complete / passkey register endpoint)
- Test: `backend/users/tests/test_api.py`

**Step 1: Write the failing test**

Add to `backend/users/tests/test_api.py`:

```python
@pytest.mark.django_db
class TestInviteRegistrationOnboarding:
    def test_password_register_sets_completed(self, api_client, user, household):
        """Users who register via invite should have onboarding completed."""
        api_client.force_login(user)
        # Create an invite
        resp = api_client.post(
            f"/api/v1/households/{household.id}/invites/",
            content_type="application/json",
        )
        assert resp.status_code == 201
        invite_code = resp.json()["code"]

        # Register new user via password with the invite
        new_client = Client()
        resp = new_client.post(
            "/api/v1/auth/register/password/",
            json.dumps({
                "email": "newuser@example.com",
                "password": "SecurePass123!",
                "invite_code": invite_code,
            }),
            content_type="application/json",
        )
        assert resp.status_code == 200
        from users.models import User
        new_user = User.objects.get(email="newuser@example.com")
        assert new_user.onboarding_step == "COMPLETED"
```

**Step 2: Run test to verify it fails**

```bash
pytest backend/users/tests/test_api.py::TestInviteRegistrationOnboarding -v
```

Expected: FAIL — onboarding_step is "CHANGE_PASSWORD" (the default).

**Step 3: Set COMPLETED in register_password**

In `backend/users/api.py`, in the `register_password` function, after the user is created and household membership is set up, add:

```python
user.onboarding_step = "COMPLETED"
```

before `user.save()`.

**Step 4: Set COMPLETED in register_complete (passkey registration)**

In `backend/users/api.py`, in the `register_complete` function, after the user is created and household membership is set up, add the same line before `user.save()`.

**Step 5: Run tests to verify they pass**

```bash
pytest backend/users/tests/test_api.py::TestInviteRegistrationOnboarding -v
```

Expected: PASS

**Step 6: Run all backend tests**

```bash
pytest
```

Expected: All tests pass.

**Step 7: Commit**

```bash
git add backend/users/api.py backend/users/tests/test_api.py
git commit -m "feat(onboarding): set COMPLETED for invite-registered users"
```

---

## Task 6: Add onboarding_step to frontend User type and AuthContext

**Files:**
- Modify: `frontend/src/api/types.ts:17-25`
- Modify: `frontend/src/contexts/AuthContext.tsx` (if needed)

**Step 1: Add onboarding_step to the User interface**

In `frontend/src/api/types.ts`, add to the `User` interface:

```typescript
export interface User {
  id: string;
  email: string;
  preferred_language: string;
  settings: UserSettings;
  active_household: HouseholdSummary | null;
  has_password: boolean;
  has_passkey: boolean;
  onboarding_step: "CHANGE_PASSWORD" | "ADD_PASSKEY" | "CREATE_HOUSEHOLD" | "COMPLETED";
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat(onboarding): add onboarding_step to frontend User type"
```

---

## Task 7: Add i18n translations for the onboarding wizard

**Files:**
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Add setup and welcome translation keys**

In `frontend/src/i18n/en.json`, add a new `"setup"` section and a `"welcome"` section:

```json
"setup": {
  "title": "Set Up Your Account",
  "step": "Step {{current}} of {{total}}",
  "changePassword": {
    "title": "Change Your Password",
    "description": "For security, please change the default password.",
    "currentPassword": "Current password",
    "newPassword": "New password",
    "confirmPassword": "Confirm new password",
    "submit": "Change Password",
    "mismatch": "Passwords don't match.",
    "success": "Password changed!"
  },
  "addPasskey": {
    "title": "Add a Passkey",
    "description": "Passkeys let you sign in quickly and securely using your fingerprint, face, or device PIN. No passwords to remember.",
    "add": "Add Passkey",
    "skip": "Skip for now"
  },
  "createHousehold": {
    "title": "Create Your Home",
    "description": "A home is where your recipes, meal plans, and shopping lists live. You can invite family members later.",
    "name": "Home name",
    "namePlaceholder": "e.g. Our Kitchen",
    "submit": "Create Home"
  }
},
"welcome": {
  "title": "Welcome to Cookless!",
  "subtitle": "Your home is all set up. Here's what you can do:",
  "addRecipe": "Add your first recipe",
  "addRecipeDescription": "Start building your collection",
  "createPlan": "Create a meal plan",
  "createPlanDescription": "Plan your meals for the week",
  "inviteMember": "Invite a family member",
  "inviteMemberDescription": "Cook together",
  "getStarted": "Get started"
}
```

**Step 2: Add the same keys in German**

In `frontend/src/i18n/de.json`, add:

```json
"setup": {
  "title": "Konto einrichten",
  "step": "Schritt {{current}} von {{total}}",
  "changePassword": {
    "title": "Passwort ändern",
    "description": "Bitte ändere aus Sicherheitsgründen das Standardpasswort.",
    "currentPassword": "Aktuelles Passwort",
    "newPassword": "Neues Passwort",
    "confirmPassword": "Neues Passwort bestätigen",
    "submit": "Passwort ändern",
    "mismatch": "Passwörter stimmen nicht überein.",
    "success": "Passwort geändert!"
  },
  "addPasskey": {
    "title": "Passkey hinzufügen",
    "description": "Mit Passkeys kannst du dich schnell und sicher mit Fingerabdruck, Gesicht oder Geräte-PIN anmelden. Keine Passwörter nötig.",
    "add": "Passkey hinzufügen",
    "skip": "Erstmal überspringen"
  },
  "createHousehold": {
    "title": "Zuhause erstellen",
    "description": "Ein Zuhause ist der Ort für deine Rezepte, Essenspläne und Einkaufslisten. Du kannst später Familienmitglieder einladen.",
    "name": "Name",
    "namePlaceholder": "z.B. Unsere Küche",
    "submit": "Zuhause erstellen"
  }
},
"welcome": {
  "title": "Willkommen bei Cookless!",
  "subtitle": "Dein Zuhause ist eingerichtet. Das kannst du jetzt tun:",
  "addRecipe": "Erstes Rezept hinzufügen",
  "addRecipeDescription": "Starte deine Sammlung",
  "createPlan": "Essensplan erstellen",
  "createPlanDescription": "Plane deine Mahlzeiten für die Woche",
  "inviteMember": "Familienmitglied einladen",
  "inviteMemberDescription": "Zusammen kochen",
  "getStarted": "Los geht's"
}
```

**Step 3: Commit**

```bash
git add frontend/src/i18n/en.json frontend/src/i18n/de.json
git commit -m "feat(onboarding): add i18n translations for setup wizard and welcome page"
```

---

## Task 8: Create SetupWizard page with ChangePasswordStep

**Files:**
- Create: `frontend/src/pages/SetupWizardPage.tsx`

**Step 1: Create the SetupWizardPage with step indicator and ChangePasswordStep**

Create `frontend/src/pages/SetupWizardPage.tsx`:

```tsx
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { api } from "../api/client";
import { addPasskey } from "../api/webauthn";
import { KeyRound, Home, Lock, Check } from "lucide-react";

const STEPS = ["CHANGE_PASSWORD", "ADD_PASSKEY", "CREATE_HOUSEHOLD"] as const;

function StepIndicator({ currentStep }: { currentStep: string }) {
  const { t } = useTranslation();
  const icons = [Lock, KeyRound, Home];
  const currentIndex = STEPS.indexOf(currentStep as (typeof STEPS)[number]);

  return (
    <div className="mb-8">
      <p className="mb-4 text-center text-sm text-gray-500">
        {t("setup.step", { current: currentIndex + 1, total: 3 })}
      </p>
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((step, i) => {
          const Icon = icons[i];
          const isActive = i === currentIndex;
          const isDone = i < currentIndex;
          return (
            <div key={step} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-0.5 w-8 ${isDone ? "bg-orange-500" : "bg-gray-200"}`}
                />
              )}
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  isActive
                    ? "bg-orange-500 text-white"
                    : isDone
                      ? "bg-orange-100 text-orange-500"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {isDone ? <Check size={20} /> : <Icon size={20} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChangePasswordStep({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError(t("setup.changePassword.mismatch"));
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/api/v1/users/me/password/", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      onComplete();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "body" in err
          ? String((err as { body: unknown }).body)
          : t("common.error");
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          {t("setup.changePassword.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t("setup.changePassword.description")}
        </p>
      </div>

      <div className="text-sm text-gray-500">{user?.email}</div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t("setup.changePassword.currentPassword")}
        </label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t("setup.changePassword.newPassword")}
        </label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t("setup.changePassword.confirmPassword")}
        </label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          required
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {submitting ? t("common.loading") : t("setup.changePassword.submit")}
      </button>
    </form>
  );
}

function AddPasskeyStep({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [skipping, setSkipping] = useState(false);

  async function handleAdd() {
    setAdding(true);
    setError("");
    try {
      await addPasskey(navigator.userAgent);
      onComplete();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setAdding(false);
        return;
      }
      setError(t("errors.passkeyAdd"));
    } finally {
      setAdding(false);
    }
  }

  async function handleSkip() {
    setSkipping(true);
    try {
      await api.post("/api/v1/users/me/skip-passkey/");
      onComplete();
    } catch {
      setError(t("common.error"));
    } finally {
      setSkipping(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          {t("setup.addPasskey.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t("setup.addPasskey.description")}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleAdd}
        disabled={adding || skipping}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        <KeyRound size={18} />
        {adding ? t("common.loading") : t("setup.addPasskey.add")}
      </button>

      <button
        onClick={handleSkip}
        disabled={adding || skipping}
        className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        {skipping ? t("common.loading") : t("setup.addPasskey.skip")}
      </button>
    </div>
  );
}

function CreateHouseholdStep({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/v1/households/", { name });
      onComplete();
    } catch {
      setError(t("errors.householdCreate"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          {t("setup.createHousehold.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t("setup.createHousehold.description")}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t("setup.createHousehold.name")}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("setup.createHousehold.namePlaceholder")}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          required
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="w-full rounded-md bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {submitting ? t("common.loading") : t("setup.createHousehold.submit")}
      </button>
    </form>
  );
}

export default function SetupWizardPage() {
  const { user, refreshUser } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.onboarding_step === "COMPLETED") {
    return <Navigate to="/welcome" replace />;
  }

  async function handleStepComplete() {
    await refreshUser();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">
          {/* Cookless logo or app name could go here */}
          Cookless
        </h1>

        <StepIndicator currentStep={user.onboarding_step} />

        {user.onboarding_step === "CHANGE_PASSWORD" && (
          <ChangePasswordStep onComplete={handleStepComplete} />
        )}
        {user.onboarding_step === "ADD_PASSKEY" && (
          <AddPasskeyStep onComplete={handleStepComplete} />
        )}
        {user.onboarding_step === "CREATE_HOUSEHOLD" && (
          <CreateHouseholdStep onComplete={handleStepComplete} />
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/pages/SetupWizardPage.tsx
git commit -m "feat(onboarding): create SetupWizard page with all three steps"
```

---

## Task 9: Create WelcomePage

**Files:**
- Create: `frontend/src/pages/WelcomePage.tsx`

**Step 1: Create WelcomePage**

Create `frontend/src/pages/WelcomePage.tsx`:

```tsx
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, CalendarDays, UserPlus } from "lucide-react";

const LINKS = [
  { to: "/recipes", icon: BookOpen, titleKey: "welcome.addRecipe", descKey: "welcome.addRecipeDescription" },
  { to: "/plan", icon: CalendarDays, titleKey: "welcome.createPlan", descKey: "welcome.createPlanDescription" },
  { to: "/household", icon: UserPlus, titleKey: "welcome.inviteMember", descKey: "welcome.inviteMemberDescription" },
] as const;

export default function WelcomePage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h1 className="text-center text-2xl font-bold text-gray-900">
          {t("welcome.title")}
        </h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          {t("welcome.subtitle")}
        </p>

        <div className="mt-6 space-y-3">
          {LINKS.map(({ to, icon: Icon, titleKey, descKey }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 transition-colors hover:border-orange-300 hover:bg-orange-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-500">
                <Icon size={20} />
              </div>
              <div>
                <div className="font-medium text-gray-900">{t(titleKey)}</div>
                <div className="text-sm text-gray-500">{t(descKey)}</div>
              </div>
            </Link>
          ))}
        </div>

        <Link
          to="/recipes"
          className="mt-6 block w-full rounded-md bg-orange-500 px-4 py-2 text-center font-medium text-white hover:bg-orange-600"
        >
          {t("welcome.getStarted")}
        </Link>
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/pages/WelcomePage.tsx
git commit -m "feat(onboarding): create Welcome page with feature links"
```

---

## Task 10: Add routes and Layout guard

**Files:**
- Modify: `frontend/src/App.tsx:15-36`
- Modify: `frontend/src/components/Layout.tsx:8-22`

**Step 1: Add /setup and /welcome routes to App.tsx**

In `frontend/src/App.tsx`, add imports for the new pages and add routes. The `/setup` and `/welcome` routes go outside the `<Layout />` wrapper (like `/login`):

```tsx
import SetupWizardPage from "./pages/SetupWizardPage";
import WelcomePage from "./pages/WelcomePage";
```

Add these routes alongside the existing public routes (before the `<Route element={<Layout />}>` block):

```tsx
<Route path="/setup" element={<SetupWizardPage />} />
<Route path="/welcome" element={<WelcomePage />} />
```

**Step 2: Add onboarding guard to Layout**

In `frontend/src/components/Layout.tsx`, after the `if (!user)` check on line 20, add:

```tsx
if (user.onboarding_step !== "COMPLETED") {
  return <Navigate to="/setup" replace />;
}
```

**Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat(onboarding): add /setup and /welcome routes with Layout guard"
```

---

## Task 11: End-to-end verification

**Step 1: Run all backend tests**

```bash
pytest
```

Expected: All tests pass.

**Step 2: Run frontend lint and type check**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

Expected: No errors.

**Step 3: Run frontend tests**

```bash
cd frontend && npm test
```

Expected: All tests pass.

**Step 4: Run pre-commit hooks**

```bash
pre-commit run --all-files
```

Expected: All hooks pass.

**Step 5: Manual smoke test**

1. Start the dev servers (`docker-compose up` or manual backend + frontend)
2. Log in with the admin user (SUPERUSER_EMAIL / SUPERUSER_PASSWORD)
3. Verify redirect to `/setup`
4. Step 1: Change password — enter current + new password → advances to step 2
5. Step 2: Add passkey — click "Skip for now" → advances to step 3
6. Step 3: Create household — enter a name → redirects to `/welcome`
7. Welcome page: verify links work, click "Get started" → goes to `/recipes`
8. Refresh the page — verify you stay in the normal app (not redirected back to `/setup`)

**Step 6: Commit any fixes from smoke testing**

```bash
git add -A
git commit -m "fix(onboarding): address issues from smoke testing"
```
