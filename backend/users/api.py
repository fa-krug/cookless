import json
from datetime import timedelta
from uuid import UUID

from django.contrib.auth import logout
from django.shortcuts import get_object_or_404
from django.utils import timezone

from ninja import Router
from ninja.errors import HttpError

from users.models import Household, HouseholdMember, Invite
from users.permissions import require_household_owner
from users.schemas import (
    HouseholdCreateIn,
    HouseholdOut,
    HouseholdUpdateIn,
    InviteOut,
    MessageOut,
    UserOut,
    UserUpdateIn,
)

router = Router()

# ── User Me ──────────────────────────────────────────────────────────


@router.get("/users/me/", response=UserOut, tags=["users"])
def get_me(request):
    return request.user


@router.patch("/users/me/", response=UserOut, tags=["users"])
def update_me(request, payload: UserUpdateIn):
    user = request.user
    if payload.preferred_language is not None:
        user.preferred_language = payload.preferred_language
    if payload.settings is not None:
        user.settings = payload.settings
    if payload.active_household is not None:
        household = Household.objects.filter(pk=payload.active_household).first()
        if not household:
            raise HttpError(400, "Household not found.")
        if not HouseholdMember.objects.filter(household=household, user=user).exists():
            raise HttpError(400, "You are not a member of this household.")
        user.active_household = household
    else:
        # Check if explicit null was sent in the body
        try:
            body = json.loads(request.body)
            if "active_household" in body and body["active_household"] is None:
                user.active_household = None
        except (json.JSONDecodeError, AttributeError):
            pass
    user.save()
    return user


# ── Households ───────────────────────────────────────────────────────


@router.get("/households/", response=list[HouseholdOut], tags=["households"])
def list_households(request):
    return (
        Household.objects.filter(members__user=request.user)
        .prefetch_related("members__user")
        .distinct()
    )


@router.post("/households/", response={201: HouseholdOut}, tags=["households"])
def create_household(request, payload: HouseholdCreateIn):
    household = Household.objects.create(name=payload.name)
    HouseholdMember.objects.create(
        household=household,
        user=request.user,
        role=HouseholdMember.Role.OWNER,
    )
    if not request.user.active_household:
        request.user.active_household = household
        request.user.save()
    return household


@router.patch("/households/{household_id}/", response=HouseholdOut, tags=["households"])
def update_household(request, household_id: UUID, payload: HouseholdUpdateIn):
    household = get_object_or_404(
        Household.objects.filter(members__user=request.user), pk=household_id
    )
    require_household_owner(request, household)
    household.name = payload.name
    household.save()
    return household


@router.post("/households/{household_id}/switch/", response=MessageOut, tags=["households"])
def switch_household(request, household_id: UUID):
    household = get_object_or_404(Household, pk=household_id)
    if not HouseholdMember.objects.filter(household=household, user=request.user).exists():
        raise HttpError(403, "You are not a member of this household.")
    request.user.active_household = household
    request.user.save()
    return {"detail": "Switched active household."}


# ── Invites ──────────────────────────────────────────────────────────


@router.post("/households/{household_id}/invites/", response={201: InviteOut}, tags=["invites"])
def create_invite(request, household_id: UUID):
    household = get_object_or_404(
        Household.objects.filter(members__user=request.user), pk=household_id
    )
    require_household_owner(request, household)
    invite = Invite.objects.create(
        household=household,
        created_by=request.user,
        expires_at=timezone.now() + timedelta(days=7),
    )
    return invite


@router.post("/invites/{code}/accept/", response=MessageOut, tags=["invites"])
def accept_invite(request, code: str):
    invite = get_object_or_404(Invite, code=code)
    if invite.is_expired:
        raise HttpError(400, "This invite has expired.")
    if invite.used_by is not None:
        raise HttpError(400, "This invite has already been used.")
    if HouseholdMember.objects.filter(household=invite.household, user=request.user).exists():
        raise HttpError(400, "You are already a member of this household.")
    HouseholdMember.objects.create(
        household=invite.household,
        user=request.user,
        role=HouseholdMember.Role.MEMBER,
    )
    invite.used_by = request.user
    invite.save()
    if request.user.active_household is None:
        request.user.active_household = invite.household
        request.user.save()
    return {"detail": "Joined household."}


# ── Member removal ───────────────────────────────────────────────────


@router.delete(
    "/households/{household_id}/members/{member_pk}/",
    response={204: None},
    tags=["households"],
)
def delete_member(request, household_id: UUID, member_pk: int):
    household = get_object_or_404(
        Household.objects.filter(members__user=request.user), pk=household_id
    )
    require_household_owner(request, household)
    member = get_object_or_404(HouseholdMember, pk=member_pk, household=household)
    if member.user == request.user:
        raise HttpError(400, "Cannot remove yourself from the household.")
    member.delete()
    return None


# ── Auth ─────────────────────────────────────────────────────────────


@router.post("/auth/apple/", auth=None, response=MessageOut, tags=["auth"])
def apple_login(request):
    raise HttpError(501, "Apple Sign-In not yet configured. Set APPLE_CLIENT_ID env var.")


@router.post("/auth/logout/", response=MessageOut, tags=["auth"])
def logout_view(request):
    logout(request)
    return {"detail": "Successfully logged out."}
