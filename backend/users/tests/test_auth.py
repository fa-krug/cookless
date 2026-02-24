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
