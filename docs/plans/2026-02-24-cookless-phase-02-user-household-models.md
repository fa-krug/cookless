# Cookless Phase 2: User & Household Models

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization.

**Architecture:** Django + DRF backend serving a React PWA via WhiteNoise in a single container. Cookie auth for frontend, token auth for programmatic API. Multi-user with households and Sign in with Apple.

**Tech Stack:** Python 3.13, Django 5.x, DRF, React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, react-i18next, Workbox

---

## Phase 2: User & Household Models

### Task 6: Custom User model

**Files:**
- Create: `backend/users/__init__.py`
- Create: `backend/users/models.py`
- Create: `backend/users/admin.py`
- Create: `backend/users/serializers.py`
- Create: `backend/users/views.py`
- Create: `backend/users/urls.py`
- Create: `backend/users/permissions.py`
- Create: `backend/users/tests/`
- Modify: `backend/cookless/settings.py` (AUTH_USER_MODEL)

**Step 1: Write failing test for User model**

```python
# backend/users/tests/test_models.py
import pytest
from django.contrib.auth import get_user_model

User = get_user_model()

@pytest.mark.django_db
def test_create_user_with_apple_id():
    user = User.objects.create_user(
        email="test@example.com",
        apple_id="apple_123",
    )
    assert user.email == "test@example.com"
    assert user.apple_id == "apple_123"
    assert user.preferred_language == "en"

@pytest.mark.django_db
def test_user_has_settings_defaults():
    user = User.objects.create_user(email="test@example.com", apple_id="apple_123")
    assert user.settings == {"default_servings": 2, "known_new_ratio": 0.7, "plan_days": 7}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest users/tests/test_models.py -v`
Expected: FAIL

**Step 3: Create users app and User model**

```python
# backend/users/models.py
import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

class UserManager(BaseUserManager):
    def create_user(self, email, apple_id, **extra_fields):
        email = self.normalize_email(email)
        user = self.model(email=email, apple_id=apple_id, **extra_fields)
        user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("apple_id", "")
        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(extra_fields.get("password", ""))
        user.save(using=self._db)
        return user

class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    apple_id = models.CharField(max_length=255, blank=True, default="")
    preferred_language = models.CharField(max_length=2, choices=[("en", "English"), ("de", "Deutsch")], default="en")
    active_household = models.ForeignKey("users.Household", on_delete=models.SET_NULL, null=True, blank=True, related_name="active_users")
    settings = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()
    USERNAME_FIELD = "email"

    def save(self, *args, **kwargs):
        if not self.settings:
            self.settings = {"default_servings": 2, "known_new_ratio": 0.7, "plan_days": 7}
        super().save(*args, **kwargs)
```

Add `AUTH_USER_MODEL = "users.User"` to settings.py. Register users app.

**Step 4: Create and run migrations**

```bash
cd backend && python manage.py startapp users  # if not manually created
python manage.py makemigrations users
python manage.py migrate
```

**Step 5: Run test to verify it passes**

Run: `cd backend && pytest users/tests/test_models.py -v`
Expected: PASS

**Step 6: Commit**

```bash
git add backend/users/ backend/cookless/settings.py
git commit -m "feat: add custom User model with Apple ID and settings"
```

---

### Task 7: Household model and membership

**Files:**
- Create: `backend/users/tests/test_households.py`
- Modify: `backend/users/models.py`

**Step 1: Write failing tests for Household**

```python
# backend/users/tests/test_households.py
import pytest
from django.contrib.auth import get_user_model
from users.models import Household, HouseholdMember

User = get_user_model()

@pytest.mark.django_db
def test_create_household():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    household = Household.objects.create(name="Test Family")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    assert household.members.count() == 1
    assert household.members.first().user == user

@pytest.mark.django_db
def test_user_can_belong_to_multiple_households():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    h1 = Household.objects.create(name="Home")
    h2 = Household.objects.create(name="Office")
    HouseholdMember.objects.create(household=h1, user=user, role="OWNER")
    HouseholdMember.objects.create(household=h2, user=user, role="MEMBER")
    assert user.household_memberships.count() == 2
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest users/tests/test_households.py -v`
Expected: FAIL

**Step 3: Implement Household and HouseholdMember models**

```python
# Add to backend/users/models.py

class Household(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class HouseholdMember(models.Model):
    ROLE_CHOICES = [("OWNER", "Owner"), ("MEMBER", "Member")]
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="household_memberships")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("household", "user")
```

**Step 4: Migrate and run tests**

```bash
cd backend && python manage.py makemigrations && python manage.py migrate
pytest users/tests/test_households.py -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add backend/users/
git commit -m "feat: add Household and HouseholdMember models"
```

---

### Task 8: Invite model

**Files:**
- Create: `backend/users/tests/test_invites.py`
- Modify: `backend/users/models.py`

**Step 1: Write failing tests for Invite**

```python
# backend/users/tests/test_invites.py
import pytest
from django.utils import timezone
from datetime import timedelta
from django.contrib.auth import get_user_model
from users.models import Household, HouseholdMember, Invite

User = get_user_model()

@pytest.mark.django_db
def test_create_invite():
    user = User.objects.create_user(email="owner@example.com", apple_id="a1")
    household = Household.objects.create(name="Home")
    invite = Invite.objects.create(
        household=household,
        created_by=user,
        expires_at=timezone.now() + timedelta(days=7),
    )
    assert invite.code  # auto-generated
    assert invite.used_by is None

@pytest.mark.django_db
def test_invite_is_expired():
    user = User.objects.create_user(email="owner@example.com", apple_id="a1")
    household = Household.objects.create(name="Home")
    invite = Invite.objects.create(
        household=household,
        created_by=user,
        expires_at=timezone.now() - timedelta(days=1),
    )
    assert invite.is_expired
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest users/tests/test_invites.py -v`
Expected: FAIL

**Step 3: Implement Invite model**

```python
# Add to backend/users/models.py
import secrets

class Invite(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name="invites")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="created_invites")
    code = models.CharField(max_length=32, unique=True, default="")
    expires_at = models.DateTimeField()
    used_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="used_invites")

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = secrets.token_urlsafe(16)
        super().save(*args, **kwargs)
```

**Step 4: Migrate and run tests**

```bash
cd backend && python manage.py makemigrations && python manage.py migrate
pytest users/tests/test_invites.py -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add backend/users/
git commit -m "feat: add Invite model with auto-generated codes"
```

---

### Task 9: IsHouseholdMember permission class

**Files:**
- Create: `backend/users/tests/test_permissions.py`
- Create: `backend/users/permissions.py`

**Step 1: Write failing tests**

```python
# backend/users/tests/test_permissions.py
import pytest
from django.test import RequestFactory
from django.contrib.auth import get_user_model
from users.models import Household, HouseholdMember
from users.permissions import IsHouseholdMember

User = get_user_model()

@pytest.mark.django_db
def test_permission_denied_no_household():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    factory = RequestFactory()
    request = factory.get("/")
    request.user = user
    perm = IsHouseholdMember()
    assert not perm.has_permission(request, None)

@pytest.mark.django_db
def test_permission_granted_with_household():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    factory = RequestFactory()
    request = factory.get("/")
    request.user = user
    perm = IsHouseholdMember()
    assert perm.has_permission(request, None)
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest users/tests/test_permissions.py -v`
Expected: FAIL

**Step 3: Implement permission class**

```python
# backend/users/permissions.py
from rest_framework.permissions import BasePermission

class IsHouseholdMember(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if not request.user.active_household:
            return False
        return request.user.household_memberships.filter(
            household=request.user.active_household
        ).exists()
```

**Step 4: Run tests**

Run: `cd backend && pytest users/tests/test_permissions.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/users/permissions.py backend/users/tests/
git commit -m "feat: add IsHouseholdMember permission class"
```

---

### Task 10: User and Household API endpoints

**Files:**
- Create: `backend/users/serializers.py`
- Create: `backend/users/views.py`
- Create: `backend/users/urls.py`
- Create: `backend/users/tests/test_api.py`
- Modify: `backend/cookless/urls.py`

**Step 1: Write failing API tests**

Test: GET `/api/v1/users/me/`, PATCH `/api/v1/users/me/`, POST/GET households, POST switch, POST invites, POST accept invite.

Use `APIClient` with `force_authenticate`.

**Step 2: Run tests to verify they fail**

Run: `cd backend && pytest users/tests/test_api.py -v`
Expected: FAIL

**Step 3: Implement serializers**

- `UserSerializer` (email, preferred_language, settings, active_household)
- `HouseholdSerializer` (id, name, members)
- `HouseholdMemberSerializer` (user email, role)
- `InviteSerializer` (code, expires_at)

**Step 4: Implement views**

- `UserMeView` (RetrieveUpdateAPIView)
- `HouseholdViewSet` (list, create, partial_update)
- `HouseholdSwitchView` (POST - sets active_household)
- `InviteCreateView` (POST - creates invite, OWNER only)
- `InviteAcceptView` (POST - joins household via code)
- `HouseholdMemberDeleteView` (DELETE - OWNER only)

**Step 5: Wire up URLs**

```python
# backend/users/urls.py
urlpatterns = [
    path("users/me/", UserMeView.as_view()),
    path("households/", HouseholdListCreateView.as_view()),
    path("households/<uuid:pk>/", HouseholdUpdateView.as_view()),
    path("households/<uuid:pk>/switch/", HouseholdSwitchView.as_view()),
    path("households/<uuid:pk>/invites/", InviteCreateView.as_view()),
    path("households/<uuid:pk>/members/<int:member_pk>/", HouseholdMemberDeleteView.as_view()),
    path("invites/<str:code>/accept/", InviteAcceptView.as_view()),
]

# backend/cookless/urls.py
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("users.urls")),
]
```

**Step 6: Run tests**

Run: `cd backend && pytest users/tests/test_api.py -v`
Expected: PASS

**Step 7: Commit**

```bash
git add backend/users/ backend/cookless/urls.py
git commit -m "feat: add User and Household API endpoints"
```

---

### Task 11: Apple Sign-In authentication

**Files:**
- Create: `backend/users/tests/test_auth.py`
- Modify: `backend/cookless/settings.py` (allauth config)
- Create: `backend/users/auth.py`

**Step 1: Configure django-allauth for Apple**

Add to settings.py:
```python
INSTALLED_APPS += [
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.apple",
]

SOCIALACCOUNT_PROVIDERS = {
    "apple": {
        "APP": {
            "client_id": os.environ.get("APPLE_CLIENT_ID", ""),
            "secret": os.environ.get("APPLE_SECRET_KEY", ""),
            "key": os.environ.get("APPLE_KEY_ID", ""),
        },
        "CERTIFICATE_KEY": os.environ.get("APPLE_CERTIFICATE_KEY", ""),
    }
}
```

**Step 2: Write auth endpoint tests**

Test the Apple callback creates a user and sets session cookie (frontend) or returns token (API).

**Step 3: Implement auth views**

- `AppleLoginView` - handles Apple OAuth callback, creates/gets user, returns session or token based on request header
- `LogoutView` - clears session
- `TokenRefreshView` - for API token auth

**Step 4: Add auth URLs**

```python
path("auth/apple/", AppleLoginView.as_view()),
path("auth/logout/", LogoutView.as_view()),
```

**Step 5: Run tests and commit**

```bash
cd backend && pytest users/tests/test_auth.py -v
git add backend/
git commit -m "feat: add Apple Sign-In authentication"
```
