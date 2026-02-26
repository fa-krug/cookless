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

        # Update last_used_at
        pat.last_used_at = timezone.now()
        pat.save(update_fields=["last_used_at"])

        return pat.user


auth = [SessionAuth(), BearerTokenAuth()]
