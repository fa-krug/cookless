from django.contrib.auth import get_user_model
from django.db import IntegrityError

import pytest

from users.models import PasskeyCredential

User = get_user_model()


@pytest.mark.django_db
def test_create_passkey_credential():
    user = User.objects.create_user(email="test@example.com")
    credential = PasskeyCredential.objects.create(
        user=user,
        credential_id=b"\x01\x02\x03",
        public_key=b"\x04\x05\x06",
        sign_count=0,
        device_name="MacBook Pro",
    )
    assert credential.user == user
    assert credential.credential_id == b"\x01\x02\x03"
    assert credential.sign_count == 0
    assert credential.device_name == "MacBook Pro"
    assert credential.id is not None


@pytest.mark.django_db
def test_passkey_credential_str():
    user = User.objects.create_user(email="test@example.com")
    credential = PasskeyCredential.objects.create(
        user=user,
        credential_id=b"\x01\x02\x03",
        public_key=b"\x04\x05\x06",
        sign_count=0,
        device_name="iPhone",
    )
    assert str(credential) == "test@example.com — iPhone"


@pytest.mark.django_db
def test_passkey_credential_id_is_unique():
    user = User.objects.create_user(email="test@example.com")
    PasskeyCredential.objects.create(
        user=user,
        credential_id=b"\x01\x02\x03",
        public_key=b"\x04\x05\x06",
        sign_count=0,
        device_name="Device 1",
    )
    with pytest.raises(IntegrityError):
        PasskeyCredential.objects.create(
            user=user,
            credential_id=b"\x01\x02\x03",
            public_key=b"\x07\x08\x09",
            sign_count=0,
            device_name="Device 2",
        )
