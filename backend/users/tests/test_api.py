import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client
from django.utils import timezone

import pytest

from users.models import Household, HouseholdMember, Invite

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(email="alice@example.com", apple_id="apple_a")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(email="bob@example.com", apple_id="apple_b")


@pytest.fixture
def api_client():
    return Client()


@pytest.fixture
def household(db, user):
    h = Household.objects.create(name="Alice's Kitchen")
    HouseholdMember.objects.create(household=h, user=user, role=HouseholdMember.Role.OWNER)
    user.active_household = h
    user.save()
    return h


# ── GET /api/v1/users/me/ ──────────────────────────────────────────


@pytest.mark.django_db
class TestUserMe:
    def test_get_me_unauthenticated(self, api_client):
        resp = api_client.get("/api/v1/users/me/")
        assert resp.status_code in (401, 403)

    def test_get_me(self, api_client, user):
        api_client.force_login(user)
        resp = api_client.get("/api/v1/users/me/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "alice@example.com"
        assert data["preferred_language"] == "en"
        assert data["settings"] == {"default_servings": 2, "known_new_ratio": 0.7, "plan_days": 7}
        assert data["active_household"] is None

    def test_get_me_with_active_household(self, api_client, user, household):
        api_client.force_login(user)
        resp = api_client.get("/api/v1/users/me/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["active_household"]["name"] == "Alice's Kitchen"

    def test_patch_me_language(self, api_client, user):
        api_client.force_login(user)
        resp = api_client.patch(
            "/api/v1/users/me/",
            json.dumps({"preferred_language": "de"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        user.refresh_from_db()
        assert user.preferred_language == "de"

    def test_patch_me_settings(self, api_client, user):
        api_client.force_login(user)
        new_settings = {"default_servings": 4, "known_new_ratio": 0.5, "plan_days": 5}
        resp = api_client.patch(
            "/api/v1/users/me/",
            json.dumps({"settings": new_settings}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        user.refresh_from_db()
        assert user.settings == new_settings

    def test_patch_me_active_household_by_uuid(self, api_client, user, household):
        api_client.force_login(user)
        user.active_household = None
        user.save()
        resp = api_client.patch(
            "/api/v1/users/me/",
            json.dumps({"active_household": str(household.pk)}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        user.refresh_from_db()
        assert user.active_household == household

    def test_patch_me_active_household_non_member_rejected(self, api_client, user, other_user):
        """Users cannot set active_household to a household they are not a member of."""
        h = Household.objects.create(name="Not Mine")
        HouseholdMember.objects.create(
            household=h, user=other_user, role=HouseholdMember.Role.OWNER
        )
        api_client.force_login(user)
        resp = api_client.patch(
            "/api/v1/users/me/",
            json.dumps({"active_household": str(h.pk)}),
            content_type="application/json",
        )
        assert resp.status_code == 400


# ── Household CRUD ──────────────────────────────────────────────────


@pytest.mark.django_db
class TestHouseholdListCreate:
    def test_create_household(self, api_client, user):
        api_client.force_login(user)
        resp = api_client.post(
            "/api/v1/households/",
            json.dumps({"name": "New Home"}),
            content_type="application/json",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Home"
        h = Household.objects.get(pk=data["id"])
        membership = HouseholdMember.objects.get(household=h, user=user)
        assert membership.role == HouseholdMember.Role.OWNER
        user.refresh_from_db()
        assert user.active_household == h

    def test_create_household_does_not_overwrite_active(self, api_client, user, household):
        api_client.force_login(user)
        resp = api_client.post(
            "/api/v1/households/",
            json.dumps({"name": "Second Home"}),
            content_type="application/json",
        )
        assert resp.status_code == 201
        user.refresh_from_db()
        assert user.active_household == household

    def test_list_households(self, api_client, user, household):
        api_client.force_login(user)
        resp = api_client.get("/api/v1/households/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Alice's Kitchen"

    def test_list_households_only_own(self, api_client, user, other_user):
        h1 = Household.objects.create(name="H1")
        HouseholdMember.objects.create(household=h1, user=user, role=HouseholdMember.Role.OWNER)
        h2 = Household.objects.create(name="H2")
        HouseholdMember.objects.create(
            household=h2, user=other_user, role=HouseholdMember.Role.OWNER
        )
        api_client.force_login(user)
        resp = api_client.get("/api/v1/households/")
        names = [h["name"] for h in resp.json()]
        assert "H1" in names
        assert "H2" not in names


@pytest.mark.django_db
class TestHouseholdUpdate:
    def test_update_household_name_owner(self, api_client, user, household):
        api_client.force_login(user)
        resp = api_client.patch(
            f"/api/v1/households/{household.pk}/",
            json.dumps({"name": "Renamed Kitchen"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        household.refresh_from_db()
        assert household.name == "Renamed Kitchen"

    def test_update_household_name_member_forbidden(self, api_client, other_user, household):
        HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        api_client.force_login(other_user)
        resp = api_client.patch(
            f"/api/v1/households/{household.pk}/",
            json.dumps({"name": "Nope"}),
            content_type="application/json",
        )
        assert resp.status_code == 403

    def test_update_household_name_non_member_not_found(self, api_client, other_user, household):
        api_client.force_login(other_user)
        resp = api_client.patch(
            f"/api/v1/households/{household.pk}/",
            json.dumps({"name": "Nope"}),
            content_type="application/json",
        )
        assert resp.status_code == 404


@pytest.mark.django_db
class TestHouseholdSwitch:
    def test_switch_active_household(self, api_client, user, household):
        h2 = Household.objects.create(name="Second Home")
        HouseholdMember.objects.create(household=h2, user=user, role=HouseholdMember.Role.MEMBER)
        api_client.force_login(user)
        resp = api_client.post(f"/api/v1/households/{h2.pk}/switch/")
        assert resp.status_code == 200
        user.refresh_from_db()
        assert user.active_household == h2

    def test_switch_to_non_member_household_forbidden(self, api_client, user, household):
        h2 = Household.objects.create(name="Not Mine")
        api_client.force_login(user)
        resp = api_client.post(f"/api/v1/households/{h2.pk}/switch/")
        assert resp.status_code == 403


@pytest.mark.django_db
class TestInviteCreate:
    def test_create_invite_owner(self, api_client, user, household):
        api_client.force_login(user)
        resp = api_client.post(f"/api/v1/households/{household.pk}/invites/")
        assert resp.status_code == 201
        data = resp.json()
        assert "code" in data
        assert "expires_at" in data
        invite = Invite.objects.get(code=data["code"])
        assert invite.household == household
        assert invite.created_by == user
        assert invite.expires_at > timezone.now() + timedelta(days=6)

    def test_create_invite_member_forbidden(self, api_client, other_user, household):
        HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/households/{household.pk}/invites/")
        assert resp.status_code == 403

    def test_create_invite_non_member_not_found(self, api_client, other_user, household):
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/households/{household.pk}/invites/")
        assert resp.status_code == 404


@pytest.mark.django_db
class TestInviteAccept:
    def test_accept_invite(self, api_client, user, household, other_user):
        invite = Invite.objects.create(
            household=household,
            created_by=user,
            expires_at=timezone.now() + timedelta(days=7),
        )
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/invites/{invite.code}/accept/")
        assert resp.status_code == 200
        assert HouseholdMember.objects.filter(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        ).exists()
        invite.refresh_from_db()
        assert invite.used_by == other_user
        other_user.refresh_from_db()
        assert other_user.active_household == household

    def test_accept_invite_does_not_overwrite_active_household(
        self, api_client, user, household, other_user
    ):
        other_h = Household.objects.create(name="Other")
        HouseholdMember.objects.create(
            household=other_h, user=other_user, role=HouseholdMember.Role.OWNER
        )
        other_user.active_household = other_h
        other_user.save()
        invite = Invite.objects.create(
            household=household,
            created_by=user,
            expires_at=timezone.now() + timedelta(days=7),
        )
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/invites/{invite.code}/accept/")
        assert resp.status_code == 200
        other_user.refresh_from_db()
        assert other_user.active_household == other_h

    def test_accept_expired_invite(self, api_client, user, household, other_user):
        invite = Invite.objects.create(
            household=household,
            created_by=user,
            expires_at=timezone.now() - timedelta(days=1),
        )
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/invites/{invite.code}/accept/")
        assert resp.status_code == 400

    def test_accept_used_invite(self, api_client, user, household, other_user):
        third = User.objects.create_user(email="carol@example.com", apple_id="apple_c")
        invite = Invite.objects.create(
            household=household,
            created_by=user,
            expires_at=timezone.now() + timedelta(days=7),
            used_by=third,
        )
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/invites/{invite.code}/accept/")
        assert resp.status_code == 400

    def test_accept_invite_already_member(self, api_client, user, household):
        invite = Invite.objects.create(
            household=household,
            created_by=user,
            expires_at=timezone.now() + timedelta(days=7),
        )
        api_client.force_login(user)
        resp = api_client.post(f"/api/v1/invites/{invite.code}/accept/")
        assert resp.status_code == 400

    def test_accept_invite_not_found(self, api_client, user):
        api_client.force_login(user)
        resp = api_client.post("/api/v1/invites/nonexistent/accept/")
        assert resp.status_code == 404


@pytest.mark.django_db
class TestHouseholdMemberDelete:
    def test_owner_removes_member(self, api_client, user, household, other_user):
        membership = HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        api_client.force_login(user)
        resp = api_client.delete(f"/api/v1/households/{household.pk}/members/{membership.pk}/")
        assert resp.status_code == 204
        assert not HouseholdMember.objects.filter(pk=membership.pk).exists()

    def test_owner_cannot_remove_self(self, api_client, user, household):
        owner_membership = HouseholdMember.objects.get(household=household, user=user)
        api_client.force_login(user)
        resp = api_client.delete(
            f"/api/v1/households/{household.pk}/members/{owner_membership.pk}/"
        )
        assert resp.status_code == 400

    def test_member_cannot_remove_others(self, api_client, user, household, other_user):
        HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        third = User.objects.create_user(email="carol@example.com", apple_id="apple_c")
        third_membership = HouseholdMember.objects.create(
            household=household, user=third, role=HouseholdMember.Role.MEMBER
        )
        api_client.force_login(other_user)
        resp = api_client.delete(
            f"/api/v1/households/{household.pk}/members/{third_membership.pk}/"
        )
        assert resp.status_code == 403

    def test_non_member_cannot_remove(self, api_client, household, other_user):
        owner_membership = HouseholdMember.objects.get(household=household)
        api_client.force_login(other_user)
        resp = api_client.delete(
            f"/api/v1/households/{household.pk}/members/{owner_membership.pk}/"
        )
        assert resp.status_code == 404
