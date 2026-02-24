from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser
from django.http import HttpRequest

from ninja.security import HttpBearer, SessionAuth

User = get_user_model()


class TokenAuth(HttpBearer):
    def authenticate(self, request: HttpRequest, token: str) -> AbstractUser | None:
        from rest_framework.authtoken.models import Token

        try:
            token_obj = Token.objects.select_related("user").get(key=token)
            return token_obj.user
        except Token.DoesNotExist:
            return None


# Both auth methods — either one grants access
auth = [SessionAuth(), TokenAuth()]
