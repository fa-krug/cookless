from django.contrib.auth import get_user_model

import pytest

from users.models import PasskeyCredential

User = get_user_model()


@pytest.mark.django_db
def test_create_user():
    user = User.objects.create_user(
        email="test@example.com",
    )
    assert user.email == "test@example.com"
    assert user.preferred_language == "en"


@pytest.mark.django_db
def test_user_has_settings_defaults():
    user = User.objects.create_user(email="test@example.com")
    assert user.settings == {"default_servings": 2, "known_new_ratio": 0.7, "plan_days": 7}


@pytest.mark.django_db
def test_user_str():
    user = User.objects.create_user(email="hello@example.com")
    assert str(user) == "hello@example.com"


@pytest.mark.django_db
def test_create_superuser():
    user = User.objects.create_superuser(email="admin@example.com", password="secret123")
    assert user.is_staff is True
    assert user.is_superuser is True
    assert user.check_password("secret123")


@pytest.mark.django_db
def test_create_superuser_no_password():
    user = User.objects.create_superuser(email="admin2@example.com")
    assert user.has_usable_password() is False


@pytest.mark.django_db
def test_create_superuser_rejects_is_staff_false():
    with pytest.raises(ValueError, match="is_staff=True"):
        User.objects.create_superuser(email="bad@example.com", is_staff=False)


@pytest.mark.django_db
def test_create_superuser_rejects_is_superuser_false():
    with pytest.raises(ValueError, match="is_superuser=True"):
        User.objects.create_superuser(email="bad@example.com", is_superuser=False)


@pytest.mark.django_db
def test_user_has_passkey_false_by_default():
    user = User.objects.create_user(email="passkey-test@example.com")
    assert user.has_passkey is False


@pytest.mark.django_db
def test_user_has_passkey_true_with_credential():
    user = User.objects.create_user(email="passkey-test2@example.com")
    PasskeyCredential.objects.create(
        user=user,
        credential_id=b"test-credential-id",
        public_key=b"test-public-key",
        sign_count=0,
        device_name="Test Device",
    )
    assert user.has_passkey is True
