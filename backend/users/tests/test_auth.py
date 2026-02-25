import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

User = get_user_model()


@pytest.mark.django_db
def test_logout_clears_session():
    client = Client()
    user = User.objects.create_user(email="test@example.com")
    client.force_login(user)
    response = client.post("/api/v1/auth/logout/")
    assert response.status_code == 200
    assert response.json()["detail"] == "Successfully logged out."


@pytest.mark.django_db
def test_logout_requires_authentication():
    client = Client()
    response = client.post("/api/v1/auth/logout/")
    assert response.status_code in (401, 403)


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


# ── Password Login ──────────────────────────────────────────────────


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


# ── Password Registration ───────────────────────────────────────────

from datetime import timedelta

from django.utils import timezone

from users.models import Household, HouseholdMember, Invite

_invite_counter = 0


def _create_invite():
    global _invite_counter
    _invite_counter += 1
    owner = User.objects.create_user(email=f"owner-{_invite_counter}@example.com")
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
