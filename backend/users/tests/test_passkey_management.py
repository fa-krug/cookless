from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from users.models import PasskeyCredential

User = get_user_model()


@pytest.fixture
def user_with_passkey(db):
    user = User.objects.create_user(email="alice@example.com")
    cred = PasskeyCredential.objects.create(
        user=user,
        credential_id=b"\x01\x02\x03",
        public_key=b"\x04\x05\x06",
        sign_count=0,
        device_name="MacBook Pro",
    )
    return user, cred


@pytest.mark.django_db
def test_list_passkeys(user_with_passkey):
    user, cred = user_with_passkey
    client = Client()
    client.force_login(user)
    resp = client.get("/api/v1/users/me/passkeys/")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["device_name"] == "MacBook Pro"
    assert "id" in data[0]
    assert "created_at" in data[0]


@pytest.mark.django_db
def test_delete_passkey(user_with_passkey):
    user, cred = user_with_passkey
    PasskeyCredential.objects.create(
        user=user,
        credential_id=b"\x07\x08\x09",
        public_key=b"\x0a\x0b\x0c",
        sign_count=0,
        device_name="iPhone",
    )
    client = Client()
    client.force_login(user)
    resp = client.delete(f"/api/v1/users/me/passkeys/{cred.id}/")
    assert resp.status_code == 204
    assert not PasskeyCredential.objects.filter(id=cred.id).exists()


@pytest.mark.django_db
def test_delete_last_passkey_rejected(user_with_passkey):
    user, cred = user_with_passkey
    client = Client()
    client.force_login(user)
    resp = client.delete(f"/api/v1/users/me/passkeys/{cred.id}/")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_delete_last_passkey_allowed_with_password():
    client = Client()
    user = User.objects.create_user(email="delete-last@example.com")
    user.set_password("securepassword1")
    user.save()
    credential = PasskeyCredential.objects.create(
        user=user,
        credential_id=b"cred-delete-last",
        public_key=b"key-delete-last",
        sign_count=0,
        device_name="Test",
    )
    client.force_login(user)
    response = client.delete(f"/api/v1/users/me/passkeys/{credential.id}/")
    assert response.status_code == 204


@pytest.mark.django_db
def test_list_passkeys_unauthenticated():
    client = Client()
    resp = client.get("/api/v1/users/me/passkeys/")
    assert resp.status_code in (401, 403)
