from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client
from django.utils import timezone

import pytest

from users.models import Household, HouseholdMember, PersonalAccessToken
from users.token_utils import generate_token

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
