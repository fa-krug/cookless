from django.contrib.auth import get_user_model

import pytest

from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.mark.django_db
def test_create_household():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    household = Household.objects.create(name="Test Family")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    assert household.members.count() == 1
    member = household.members.first()
    assert member is not None
    assert member.user == user


@pytest.mark.django_db
def test_user_can_belong_to_multiple_households():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    h1 = Household.objects.create(name="Home")
    h2 = Household.objects.create(name="Office")
    HouseholdMember.objects.create(household=h1, user=user, role="OWNER")
    HouseholdMember.objects.create(household=h2, user=user, role="MEMBER")
    assert user.household_memberships.count() == 2
