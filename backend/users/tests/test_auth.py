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
