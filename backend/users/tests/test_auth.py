from django.contrib.auth import get_user_model
from django.test import Client

import pytest
from rest_framework.authtoken.models import Token

User = get_user_model()


@pytest.mark.django_db
def test_logout_clears_session():
    client = Client()
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
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
def test_token_auth():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    token = Token.objects.create(user=user)
    client = Client()
    response = client.get("/api/v1/users/me/", HTTP_AUTHORIZATION=f"Bearer {token.key}")
    assert response.status_code == 200
    assert response.json()["email"] == "test@example.com"


@pytest.mark.django_db
def test_apple_login_endpoint_exists():
    client = Client()
    response = client.post("/api/v1/auth/apple/", content_type="application/json")
    assert response.status_code != 404
    assert response.status_code == 501
