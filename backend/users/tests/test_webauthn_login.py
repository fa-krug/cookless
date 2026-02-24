import json
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from users.models import PasskeyCredential

User = get_user_model()


@pytest.fixture
def user_with_passkey(db):
    user = User.objects.create_user(email="alice@example.com")
    PasskeyCredential.objects.create(
        user=user,
        credential_id=b"\x01\x02\x03\x04",
        public_key=b"\x05\x06\x07\x08",
        sign_count=0,
        device_name="Test Device",
    )
    return user


@pytest.mark.django_db
def test_login_begin_returns_challenge(user_with_passkey):
    client = Client()
    resp = client.post(
        "/api/v1/auth/login/begin/",
        json.dumps({"email": "alice@example.com"}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "challenge" in data
    assert "allowCredentials" in data


@pytest.mark.django_db
def test_login_begin_unknown_email():
    client = Client()
    resp = client.post(
        "/api/v1/auth/login/begin/",
        json.dumps({"email": "nobody@example.com"}),
        content_type="application/json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_login_complete_authenticates_user(user_with_passkey):
    client = Client()
    # Begin
    resp = client.post(
        "/api/v1/auth/login/begin/",
        json.dumps({"email": "alice@example.com"}),
        content_type="application/json",
    )
    assert resp.status_code == 200

    # Build a realistic credential JSON with the correct base64url credential_id
    # b"\x01\x02\x03\x04" in base64url is "AQIDBA"
    credential_json = json.dumps(
        {
            "id": "AQIDBA",
            "rawId": "AQIDBA",
            "response": {},
            "type": "public-key",
        }
    )

    # Mock verification
    mock_verification = MagicMock()
    mock_verification.credential_id = b"\x01\x02\x03\x04"
    mock_verification.new_sign_count = 1

    with patch("users.api.verify_authentication", return_value=mock_verification):
        resp = client.post(
            "/api/v1/auth/login/complete/",
            json.dumps({"credential": credential_json}),
            content_type="application/json",
        )
    assert resp.status_code == 200
    assert resp.json()["email"] == "alice@example.com"

    # Verify session works
    resp = client.get("/api/v1/users/me/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_login_complete_fails_without_begin():
    client = Client()
    resp = client.post(
        "/api/v1/auth/login/complete/",
        json.dumps({"credential": "{}"}),
        content_type="application/json",
    )
    assert resp.status_code == 400
