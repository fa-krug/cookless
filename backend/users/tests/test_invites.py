from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

import pytest

from users.models import Household, Invite

User = get_user_model()


@pytest.mark.django_db
def test_create_invite():
    user = User.objects.create_user(email="owner@example.com")
    household = Household.objects.create(name="Home")
    invite = Invite.objects.create(
        household=household,
        created_by=user,
        expires_at=timezone.now() + timedelta(days=7),
    )
    assert invite.code  # auto-generated
    assert invite.used_by is None


@pytest.mark.django_db
def test_invite_is_expired():
    user = User.objects.create_user(email="owner@example.com")
    household = Household.objects.create(name="Home")
    invite = Invite.objects.create(
        household=household,
        created_by=user,
        expires_at=timezone.now() - timedelta(days=1),
    )
    assert invite.is_expired
