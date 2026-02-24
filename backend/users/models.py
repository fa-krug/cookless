import uuid
from typing import Any

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager["User"]):
    def create_user(self, email: str, apple_id: str, **extra_fields: Any) -> "User":
        email = self.normalize_email(email)
        user = self.model(email=email, apple_id=apple_id, **extra_fields)
        user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, **extra_fields: Any) -> "User":
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
    preferred_language = models.CharField(
        max_length=2,
        choices=[("en", "English"), ("de", "Deutsch")],
        default="en",
    )
    # active_household will be added in Task 7 when Household model is created
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
