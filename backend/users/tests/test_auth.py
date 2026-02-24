from django.contrib.auth import get_user_model

import pytest
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

User = get_user_model()


@pytest.mark.django_db
def test_logout_clears_session():
    client = APIClient()
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    client.force_authenticate(user=user)
    response = client.post("/api/v1/auth/logout/")
    assert response.status_code == 200
    assert response.data["detail"] == "Successfully logged out."


@pytest.mark.django_db
def test_logout_requires_authentication():
    client = APIClient()
    response = client.post("/api/v1/auth/logout/")
    assert response.status_code in (401, 403)


@pytest.mark.django_db
def test_token_auth():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    token = Token.objects.create(user=user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    response = client.get("/api/v1/users/me/")
    assert response.status_code == 200
    assert response.data["email"] == "test@example.com"


@pytest.mark.django_db
def test_apple_login_endpoint_exists():
    client = APIClient()
    # POST without valid Apple token should return 501 (not configured), not 404
    response = client.post("/api/v1/auth/apple/", {})
    assert response.status_code != 404
    assert response.status_code == 501
