import json
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import Client
from django.utils import timezone

import pytest

from users.models import Household, HouseholdMember, Invite, PasskeyCredential

User = get_user_model()


@pytest.fixture
def api_client():
    return Client()


@pytest.fixture
def owner(db):
    return User.objects.create_user(email="owner@example.com")


@pytest.fixture
def household(owner):
    h = Household.objects.create(name="Test Kitchen")
    HouseholdMember.objects.create(household=h, user=owner, role=HouseholdMember.Role.OWNER)
    owner.active_household = h
    owner.save()
    return h


@pytest.fixture
def valid_invite(household, owner):
    return Invite.objects.create(
        household=household,
        created_by=owner,
        expires_at=timezone.now() + timedelta(days=7),
    )


# ── GET /api/v1/invites/{code}/ ──────────────────────────────────────


@pytest.mark.django_db
def test_get_invite_returns_household_info(valid_invite):
    client = Client()
    resp = client.get(f"/api/v1/invites/{valid_invite.code}/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["household_name"] == "Test Kitchen"
    assert "expires_at" in data


@pytest.mark.django_db
def test_get_invite_invalid_code():
    client = Client()
    resp = client.get("/api/v1/invites/badcode/")
    assert resp.status_code == 404


# ── POST /api/v1/auth/register/ (begin) ─────────────────────────────


@pytest.mark.django_db
def test_register_begin_returns_challenge(api_client, valid_invite):
    resp = api_client.post(
        "/api/v1/auth/register/",
        json.dumps({"email": "newuser@example.com", "invite_code": valid_invite.code}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "challenge" in data
    assert "rp" in data
    assert "user" in data


@pytest.mark.django_db
def test_register_begin_rejects_duplicate_email(api_client, valid_invite):
    User.objects.create_user(email="existing@example.com")
    resp = api_client.post(
        "/api/v1/auth/register/",
        json.dumps({"email": "existing@example.com", "invite_code": valid_invite.code}),
        content_type="application/json",
    )
    assert resp.status_code == 409


@pytest.mark.django_db
def test_register_begin_rejects_invalid_invite(api_client):
    resp = api_client.post(
        "/api/v1/auth/register/",
        json.dumps({"email": "newuser@example.com", "invite_code": "nonexistent"}),
        content_type="application/json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_register_begin_rejects_expired_invite(api_client, household, owner):
    expired_invite = Invite.objects.create(
        household=household,
        created_by=owner,
        expires_at=timezone.now() - timedelta(days=1),
    )
    resp = api_client.post(
        "/api/v1/auth/register/",
        json.dumps({"email": "newuser@example.com", "invite_code": expired_invite.code}),
        content_type="application/json",
    )
    assert resp.status_code == 400


# ── POST /api/v1/auth/passkey/register/complete/ ────────────────────


@pytest.mark.django_db
def test_register_complete_creates_user_and_credential(api_client, valid_invite):
    # Step 1: Begin registration to set up session
    resp = api_client.post(
        "/api/v1/auth/register/",
        json.dumps({"email": "newuser@example.com", "invite_code": valid_invite.code}),
        content_type="application/json",
    )
    assert resp.status_code == 200

    # Step 2: Mock verify_registration and complete
    mock_verification = MagicMock()
    mock_verification.credential_id = b"\x01\x02\x03\x04"
    mock_verification.credential_public_key = b"\x05\x06\x07\x08"
    mock_verification.sign_count = 0

    with patch("users.api.verify_registration", return_value=mock_verification):
        resp = api_client.post(
            "/api/v1/auth/passkey/register/complete/",
            json.dumps({"credential": '{"id":"test","response":{}}', "device_name": "My Phone"}),
            content_type="application/json",
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "newuser@example.com"

    # Verify user was created
    user = User.objects.get(email="newuser@example.com")
    assert not user.has_usable_password()

    # Verify passkey credential was stored
    cred = PasskeyCredential.objects.get(user=user)
    assert bytes(cred.credential_id) == b"\x01\x02\x03\x04"
    assert bytes(cred.public_key) == b"\x05\x06\x07\x08"
    assert cred.device_name == "My Phone"

    # Verify invite was consumed
    valid_invite.refresh_from_db()
    assert valid_invite.used_by == user

    # Verify user joined household as MEMBER
    assert HouseholdMember.objects.filter(
        household=valid_invite.household, user=user, role=HouseholdMember.Role.MEMBER
    ).exists()

    # Verify active_household was set
    user.refresh_from_db()
    assert user.active_household == valid_invite.household

    # Verify user is logged in (session works)
    me_resp = api_client.get("/api/v1/users/me/")
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "newuser@example.com"


@pytest.mark.django_db
def test_register_complete_fails_without_begin(api_client):
    resp = api_client.post(
        "/api/v1/auth/passkey/register/complete/",
        json.dumps({"credential": '{"id":"test","response":{}}', "device_name": "My Phone"}),
        content_type="application/json",
    )
    assert resp.status_code == 400
