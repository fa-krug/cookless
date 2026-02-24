import secrets
import uuid
from typing import Any

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


def _default_user_settings() -> dict:
    return {"default_servings": 2, "known_new_ratio": 0.7, "plan_days": 7}


class UserManager(BaseUserManager["User"]):
    def create_user(self, email: str, apple_id: str, **extra_fields: Any) -> "User":
        email = self.normalize_email(email)
        user = self.model(email=email, apple_id=apple_id, **extra_fields)
        user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(
        self, email: str, password: str | None = None, **extra_fields: Any
    ) -> "User":
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("apple_id", "")

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(password)  # None → unusable password (safe default)
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    apple_id = models.CharField(max_length=255, blank=True, default="")
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
    settings = models.JSONField(default=_default_user_settings)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()
    USERNAME_FIELD = "email"

    def __str__(self) -> str:
        return self.email


class Household(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
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

    def __str__(self) -> str:
        return f"Invite {self.code} for {self.household}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self.code:
            self.code = secrets.token_urlsafe(16)
        super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at
