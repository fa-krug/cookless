import secrets
import uuid
from typing import Any

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager["User"]):
    def create_user(self, email: str, **extra_fields: Any) -> "User":
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(
        self, email: str, password: str | None = None, **extra_fields: Any
    ) -> "User":
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(password)  # None → unusable password (safe default)
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    class OnboardingStep(models.TextChoices):
        CHANGE_PASSWORD = "CHANGE_PASSWORD", "Change Password"
        ADD_PASSKEY = "ADD_PASSKEY", "Add Passkey"
        CREATE_HOUSEHOLD = "CREATE_HOUSEHOLD", "Create Household"
        COMPLETED = "COMPLETED", "Completed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    preferred_language = models.CharField(
        max_length=2,
        choices=[("en", "English"), ("de", "Deutsch")],
        default="en",
    )
    active_household = models.ForeignKey(
        "users.Household",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="active_users",
    )
    onboarding_step = models.CharField(
        max_length=20,
        choices=OnboardingStep.choices,
        default=OnboardingStep.CHANGE_PASSWORD,
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()
    USERNAME_FIELD = "email"

    def __str__(self) -> str:
        return self.email

    @property
    def has_passkey(self) -> bool:
        return self.passkey_credentials.exists()


class Household(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    ai_enabled = models.BooleanField(default=False)
    gemini_api_key = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name


class HouseholdMember(models.Model):
    class Role(models.TextChoices):
        OWNER = "OWNER", "Owner"
        MEMBER = "MEMBER", "Member"

    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="household_memberships")
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["household", "user"],
                name="unique_household_user",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user} in {self.household} ({self.role})"


class Invite(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name="invites")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="created_invites")
    code = models.CharField(max_length=32, unique=True, default="")
    expires_at = models.DateTimeField()
    used_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="used_invites",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Invite {self.code} for {self.household}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self.code:
            self.code = secrets.token_urlsafe(16)
        super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at


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
