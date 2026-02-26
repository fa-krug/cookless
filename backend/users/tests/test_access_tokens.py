import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from users.models import PersonalAccessToken
from users.token_utils import hash_token

User = get_user_model()

VALID_SCOPES = ["recipes:read", "recipes:write"]


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(email="alice@example.com")
    client = Client()
    client.force_login(user)
    return client, user


@pytest.mark.django_db
def test_create_token(auth_client):
    client, user = auth_client
    resp = client.post(
        "/api/v1/users/me/tokens/",
        json.dumps({"name": "My Token", "scopes": VALID_SCOPES}),
        content_type="application/json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My Token"
    assert data["token"].startswith("ckls_")
    assert data["scopes"] == VALID_SCOPES
    assert data["expires_at"] is None
    assert PersonalAccessToken.objects.filter(user=user).count() == 1


@pytest.mark.django_db
def test_create_token_with_duration_preset(auth_client):
    client, user = auth_client
    resp = client.post(
        "/api/v1/users/me/tokens/",
        json.dumps({"name": "Short", "scopes": VALID_SCOPES, "duration_preset": "30d"}),
        content_type="application/json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["expires_at"] is not None


@pytest.mark.django_db
def test_create_token_invalid_scope(auth_client):
    client, _ = auth_client
    resp = client.post(
        "/api/v1/users/me/tokens/",
        json.dumps({"name": "Bad", "scopes": ["invalid:scope"]}),
        content_type="application/json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_token_empty_name(auth_client):
    client, _ = auth_client
    resp = client.post(
        "/api/v1/users/me/tokens/",
        json.dumps({"name": "", "scopes": VALID_SCOPES}),
        content_type="application/json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_list_tokens(auth_client):
    client, user = auth_client
    PersonalAccessToken.objects.create(
        user=user,
        name="Token 1",
        token_hash=hash_token("ckls_fake1"),
        token_prefix="ckls_fake1"[:14],
        scopes="recipes:read",
    )
    resp = client.get("/api/v1/users/me/tokens/")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Token 1"
    assert "token" not in data[0]
    assert "token_hash" not in data[0]


@pytest.mark.django_db
def test_list_tokens_excludes_other_users(auth_client):
    client, user = auth_client
    other = User.objects.create_user(email="bob@example.com")
    PersonalAccessToken.objects.create(
        user=other,
        name="Bob's Token",
        token_hash=hash_token("ckls_bobs"),
        token_prefix="ckls_bobs"[:14],
        scopes="recipes:read",
    )
    resp = client.get("/api/v1/users/me/tokens/")
    assert resp.status_code == 200
    assert len(resp.json()) == 0


@pytest.mark.django_db
def test_delete_token(auth_client):
    client, user = auth_client
    token = PersonalAccessToken.objects.create(
        user=user,
        name="To Delete",
        token_hash=hash_token("ckls_delete"),
        token_prefix="ckls_delete"[:14],
        scopes="recipes:read",
    )
    resp = client.delete(f"/api/v1/users/me/tokens/{token.id}/")
    assert resp.status_code == 204
    assert not PersonalAccessToken.objects.filter(id=token.id).exists()


@pytest.mark.django_db
def test_delete_other_users_token(auth_client):
    client, _ = auth_client
    other = User.objects.create_user(email="bob@example.com")
    token = PersonalAccessToken.objects.create(
        user=other,
        name="Bob's Token",
        token_hash=hash_token("ckls_other"),
        token_prefix="ckls_other"[:14],
        scopes="recipes:read",
    )
    resp = client.delete(f"/api/v1/users/me/tokens/{token.id}/")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_unauthenticated_access():
    client = Client()
    assert client.get("/api/v1/users/me/tokens/").status_code in (401, 403)
