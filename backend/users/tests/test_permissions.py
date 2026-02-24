from django.contrib.auth import get_user_model
from django.test import RequestFactory

import pytest

from users.models import Household, HouseholdMember
from users.permissions import IsHouseholdMember

User = get_user_model()


@pytest.mark.django_db
def test_permission_denied_no_household():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    factory = RequestFactory()
    request = factory.get("/")
    request.user = user
    perm = IsHouseholdMember()
    assert not perm.has_permission(request, None)


@pytest.mark.django_db
def test_permission_granted_with_household():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    factory = RequestFactory()
    request = factory.get("/")
    request.user = user
    perm = IsHouseholdMember()
    assert perm.has_permission(request, None)
