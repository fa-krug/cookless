from django.contrib.auth import get_user_model

import pytest

User = get_user_model()


@pytest.mark.django_db
def test_create_user_with_apple_id():
    user = User.objects.create_user(
        email="test@example.com",
        apple_id="apple_123",
    )
    assert user.email == "test@example.com"
    assert user.apple_id == "apple_123"
    assert user.preferred_language == "en"


@pytest.mark.django_db
def test_user_has_settings_defaults():
    user = User.objects.create_user(email="test@example.com", apple_id="apple_123")
    assert user.settings == {"default_servings": 2, "known_new_ratio": 0.7, "plan_days": 7}
