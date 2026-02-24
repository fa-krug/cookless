from django.contrib.auth import get_user_model
from django.test import RequestFactory

import pytest
from ninja.errors import HttpError

from users.models import Household, HouseholdMember
from users.permissions import require_household_member

User = get_user_model()


@pytest.mark.django_db
def test_permission_denied_no_household():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    factory = RequestFactory()
    request = factory.get("/")
    request.user = user
    with pytest.raises(HttpError) as exc_info:
        require_household_member(request)
    assert exc_info.value.status_code == 403


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
    # Should not raise
    require_household_member(request)
