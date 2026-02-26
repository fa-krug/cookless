import json
import uuid
from datetime import timedelta
from uuid import UUID

from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from ninja import Router
from ninja.errors import HttpError
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url, options_to_json

from users.models import Household, HouseholdMember, Invite, PasskeyCredential
from users.permissions import require_household_owner
from users.schemas import (
    HouseholdCreateIn,
    HouseholdOut,
    HouseholdSettingsUpdateIn,
    HouseholdUpdateIn,
    InviteOut,
    InviteValidationOut,
    LoginBeginIn,
    LoginCompleteIn,
    LoginPasswordIn,
    MessageOut,
    PasskeyOut,
    RegisterBeginIn,
    RegisterCompleteIn,
    RegisterPasswordIn,
    RemovePasswordIn,
    SetPasswordIn,
    UserOut,
    UserUpdateIn,
    VerifyGeminiKeyIn,
)
from users.webauthn import (
    get_authentication_options,
    get_registration_options,
    get_rp_id_for_request,
    verify_authentication,
    verify_registration,
)

User = get_user_model()

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


@router.post("/users/me/password/", response=MessageOut, tags=["users"])
def set_password(request, payload: SetPasswordIn):
    user = request.user
    if user.has_usable_password():
        if not payload.current_password:
            raise HttpError(400, "Current password is required.")
        if not user.check_password(payload.current_password):
            raise HttpError(400, "Current password is incorrect.")
    try:
        validate_password(payload.new_password, user=user)
    except ValidationError as e:
        raise HttpError(400, " ".join(e.messages)) from None
    user.set_password(payload.new_password)
    if user.onboarding_step == "CHANGE_PASSWORD":
        user.onboarding_step = "ADD_PASSKEY"
    user.save()
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return {"detail": "Password updated."}


@router.post("/users/me/skip-passkey/", response=MessageOut, tags=["users"])
def skip_passkey(request):
    user = request.user
    if user.onboarding_step != "ADD_PASSKEY":
        raise HttpError(400, "Not at the passkey step.")
    user.onboarding_step = "CREATE_HOUSEHOLD"
    user.save()
    return {"detail": "Passkey step skipped."}


@router.delete("/users/me/password/", response=MessageOut, tags=["users"])
def remove_password(request, payload: RemovePasswordIn):
    user = request.user
    if not user.has_usable_password():
        raise HttpError(400, "No password is set.")
    if not user.check_password(payload.current_password):
        raise HttpError(400, "Current password is incorrect.")
    if not user.has_passkey:
        raise HttpError(400, "Cannot remove password without at least one passkey.")
    user.set_unusable_password()
    user.save()
    return {"detail": "Password removed."}


# ── AI / Gemini ─────────────────────────────────────────────────────


@router.post("/users/me/verify-gemini-key/", response=MessageOut, tags=["users"])
def verify_gemini_key(request, payload: VerifyGeminiKeyIn):
    import urllib.request

    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={payload.api_key}"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                return {"detail": "API key is valid."}
    except urllib.error.HTTPError as e:
        if e.code == 400:
            raise HttpError(400, "Invalid API key.") from None
        raise HttpError(400, "Could not verify API key.") from None
    except Exception:
        raise HttpError(400, "Could not reach Gemini API.") from None
    raise HttpError(400, "Could not verify API key.")


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
    if request.user.onboarding_step == "CREATE_HOUSEHOLD":
        request.user.onboarding_step = "COMPLETED"
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


@router.patch("/households/{household_id}/settings/", response=HouseholdOut, tags=["households"])
def update_household_settings(request, household_id: UUID, payload: HouseholdSettingsUpdateIn):
    household = get_object_or_404(
        Household.objects.filter(members__user=request.user), pk=household_id
    )
    require_household_owner(request, household)
    household.settings = payload.settings
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


@router.delete("/households/{household_id}/", response={204: None}, tags=["households"])
def delete_household(request, household_id: UUID):
    household = get_object_or_404(
        Household.objects.filter(members__user=request.user), pk=household_id
    )
    require_household_owner(request, household)
    member_count = household.members.count()
    if member_count > 1:
        raise HttpError(409, "Remove all other members before deleting.")
    # Switch active household BEFORE deleting (avoids stale state from CASCADE SET_NULL)
    if request.user.active_household_id == household_id:
        next_membership = (
            request.user.household_memberships.exclude(household=household)
            .select_related("household")
            .first()
        )
        request.user.active_household = next_membership.household if next_membership else None
        request.user.save()
    household.delete()
    return None


@router.post("/households/{household_id}/leave/", response=MessageOut, tags=["households"])
def leave_household(request, household_id: UUID):
    household = get_object_or_404(
        Household.objects.filter(members__user=request.user), pk=household_id
    )
    membership = HouseholdMember.objects.get(household=household, user=request.user)
    if membership.role == HouseholdMember.Role.OWNER and household.members.count() > 1:
        raise HttpError(409, "Transfer ownership before leaving.")
    # Switch active household BEFORE deleting membership
    if request.user.active_household_id == household_id:
        next_membership = (
            request.user.household_memberships.exclude(household=household)
            .select_related("household")
            .first()
        )
        request.user.active_household = next_membership.household if next_membership else None
        request.user.save()
    membership.delete()
    return {"detail": "Left household."}


@router.post(
    "/households/{household_id}/members/{member_pk}/transfer-ownership/",
    response=MessageOut,
    tags=["households"],
)
def transfer_ownership(request, household_id: UUID, member_pk: int):
    household = get_object_or_404(
        Household.objects.filter(members__user=request.user), pk=household_id
    )
    require_household_owner(request, household)
    target_member = get_object_or_404(HouseholdMember, pk=member_pk, household=household)
    if target_member.user == request.user:
        raise HttpError(400, "Cannot transfer ownership to yourself.")
    # Demote current owner, promote target (atomic to prevent inconsistency)
    current_membership = HouseholdMember.objects.get(household=household, user=request.user)
    with transaction.atomic():
        current_membership.role = HouseholdMember.Role.MEMBER
        current_membership.save()
        target_member.role = HouseholdMember.Role.OWNER
        target_member.save()
    return {"detail": "Ownership transferred."}


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


@router.get("/invites/{code}/", auth=None, response=InviteValidationOut, tags=["invites"])
def get_invite(request, code: str):
    invite = get_object_or_404(Invite, code=code)
    if invite.is_expired:
        raise HttpError(400, "This invite has expired.")
    if invite.used_by is not None:
        raise HttpError(400, "This invite has already been used.")
    return {"household_name": invite.household.name, "expires_at": invite.expires_at}


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


# ── Passkey Management ───────────────────────────────────────────────


@router.get("/users/me/passkeys/", response=list[PasskeyOut], tags=["passkeys"])
def list_passkeys(request):
    return PasskeyCredential.objects.filter(user=request.user).order_by("-created_at")


@router.delete("/users/me/passkeys/{passkey_id}/", response={204: None}, tags=["passkeys"])
def delete_passkey(request, passkey_id: UUID):
    credential = get_object_or_404(PasskeyCredential, id=passkey_id, user=request.user)
    is_last_passkey = PasskeyCredential.objects.filter(user=request.user).count() <= 1
    if is_last_passkey and not request.user.has_usable_password():
        raise HttpError(400, "Cannot delete your only passkey without a password set.")
    credential.delete()
    return None


@router.post("/users/me/passkeys/add/begin/", tags=["passkeys"])
def add_passkey_begin(request):
    existing = [bytes(c.credential_id) for c in PasskeyCredential.objects.filter(user=request.user)]
    options = get_registration_options(
        user_id=str(request.user.id),
        user_email=request.user.email,
        existing_credentials=existing,
        rp_id=get_rp_id_for_request(request),
    )
    request.session["webauthn_add_challenge"] = bytes_to_base64url(options.challenge)
    return json.loads(options_to_json(options))


@router.post("/users/me/passkeys/add/complete/", response=PasskeyOut, tags=["passkeys"])
def add_passkey_complete(request, payload: RegisterCompleteIn):
    challenge_b64 = request.session.get("webauthn_add_challenge")
    if not challenge_b64:
        raise HttpError(400, "No pending passkey addition.")

    challenge = base64url_to_bytes(challenge_b64)
    try:
        verification = verify_registration(
            payload.credential, challenge, rp_id=get_rp_id_for_request(request)
        )
    except Exception as e:
        raise HttpError(400, f"Verification failed: {e}") from None

    credential = PasskeyCredential.objects.create(
        user=request.user,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        device_name=payload.device_name,
    )
    request.session.pop("webauthn_add_challenge", None)
    if request.user.onboarding_step == "ADD_PASSKEY":
        request.user.onboarding_step = "CREATE_HOUSEHOLD"
        request.user.save()
    return credential


# ── Auth ─────────────────────────────────────────────────────────────


@router.post("/auth/login/password/", auth=None, response=UserOut, tags=["auth"])
def login_password(request, payload: LoginPasswordIn):
    user = User.objects.filter(email=payload.email).first()
    if not user or not user.check_password(payload.password):
        raise HttpError(401, "Invalid email or password.")
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return user


@router.post("/auth/register/password/", auth=None, response=UserOut, tags=["auth"])
def register_password(request, payload: RegisterPasswordIn):
    invite = Invite.objects.filter(code=payload.invite_code).first()
    if not invite:
        raise HttpError(400, "Invalid invite code.")
    if invite.is_expired:
        raise HttpError(400, "This invite has expired.")
    if invite.used_by is not None:
        raise HttpError(400, "This invite has already been used.")
    if User.objects.filter(email=payload.email).exists():
        raise HttpError(409, "A user with this email already exists.")
    try:
        validate_password(payload.password)
    except ValidationError as e:
        raise HttpError(400, " ".join(e.messages)) from None
    user = User.objects.create_user(email=payload.email)
    user.set_password(payload.password)
    user.save()
    role = HouseholdMember.Role.MEMBER
    if not invite.created_by.is_active:
        role = HouseholdMember.Role.OWNER
    HouseholdMember.objects.create(household=invite.household, user=user, role=role)
    user.active_household = invite.household
    user.onboarding_step = "COMPLETED"
    user.save()
    invite.used_by = user
    invite.save()
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return user


@router.post("/auth/register/", auth=None, tags=["auth"])
def register_begin(request, payload: RegisterBeginIn):
    # Validate invite
    invite = Invite.objects.filter(code=payload.invite_code).first()
    if not invite:
        raise HttpError(400, "Invalid invite code.")
    if invite.is_expired:
        raise HttpError(400, "This invite has expired.")
    if invite.used_by is not None:
        raise HttpError(400, "This invite has already been used.")

    # Check email not taken
    if User.objects.filter(email=payload.email).exists():
        raise HttpError(409, "A user with this email already exists.")

    # Generate a temporary user_id for the registration ceremony
    temp_user_id = str(uuid.uuid4())

    # Generate WebAuthn registration options
    options = get_registration_options(
        user_id=temp_user_id,
        user_email=payload.email,
        existing_credentials=[],
        rp_id=get_rp_id_for_request(request),
    )

    # Serialize options to JSON
    options_json = options_to_json(options)

    # Store challenge + context in session
    request.session["webauthn_register_challenge"] = bytes_to_base64url(options.challenge)
    request.session["webauthn_register_email"] = payload.email
    request.session["webauthn_register_invite_code"] = payload.invite_code
    request.session["webauthn_register_user_id"] = temp_user_id

    return json.loads(options_json)


@router.post("/auth/passkey/register/complete/", auth=None, response=UserOut, tags=["auth"])
def register_complete(request, payload: RegisterCompleteIn):
    # Retrieve session data
    challenge_b64 = request.session.get("webauthn_register_challenge")
    email = request.session.get("webauthn_register_email")
    invite_code = request.session.get("webauthn_register_invite_code")

    if not challenge_b64 or not email or not invite_code:
        raise HttpError(400, "No registration in progress. Call register begin first.")

    # Decode challenge
    challenge = base64url_to_bytes(challenge_b64)

    # Verify the WebAuthn credential
    try:
        verification = verify_registration(
            credential_json=payload.credential,
            challenge=challenge,
            rp_id=get_rp_id_for_request(request),
        )
    except Exception as e:
        raise HttpError(400, f"WebAuthn verification failed: {e}") from None

    # Re-validate invite
    invite = Invite.objects.filter(code=invite_code).first()
    if not invite or invite.is_expired or invite.used_by is not None:
        raise HttpError(400, "Invite is no longer valid.")

    # Check email still not taken
    if User.objects.filter(email=email).exists():
        raise HttpError(409, "A user with this email already exists.")

    # Create user
    user = User.objects.create_user(email=email)

    # Store PasskeyCredential
    PasskeyCredential.objects.create(
        user=user,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        device_name=payload.device_name,
    )

    # If the invite creator is inactive (bootstrap), promote to OWNER
    role = HouseholdMember.Role.MEMBER
    if not invite.created_by.is_active:
        role = HouseholdMember.Role.OWNER

    HouseholdMember.objects.create(
        household=invite.household,
        user=user,
        role=role,
    )

    # Set active household
    user.active_household = invite.household
    user.onboarding_step = "COMPLETED"
    user.save()

    # Consume invite
    invite.used_by = user
    invite.save()

    # Log user in
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")

    # Clear session registration data
    for key in [
        "webauthn_register_challenge",
        "webauthn_register_email",
        "webauthn_register_invite_code",
        "webauthn_register_user_id",
    ]:
        request.session.pop(key, None)

    return user


@router.post("/auth/login/begin/", auth=None, tags=["auth"])
def login_begin(request, payload: LoginBeginIn):
    user = User.objects.filter(email=payload.email).first()
    if not user:
        raise HttpError(400, "No account found with this email.")

    credentials = PasskeyCredential.objects.filter(user=user)
    if not credentials.exists():
        raise HttpError(400, "No passkeys registered for this account.")

    credential_ids = [bytes(c.credential_id) for c in credentials]
    options = get_authentication_options(credential_ids, rp_id=get_rp_id_for_request(request))

    options_json = options_to_json(options)

    request.session["webauthn_login_challenge"] = bytes_to_base64url(options.challenge)
    request.session["webauthn_login_email"] = payload.email

    return json.loads(options_json)


@router.post("/auth/login/complete/", auth=None, response=UserOut, tags=["auth"])
def login_complete(request, payload: LoginCompleteIn):
    challenge_b64 = request.session.get("webauthn_login_challenge")
    email = request.session.get("webauthn_login_email")

    if not challenge_b64 or not email:
        raise HttpError(400, "No login in progress. Call login begin first.")

    challenge = base64url_to_bytes(challenge_b64)

    # Parse credential JSON to extract credential ID
    try:
        credential_data = json.loads(payload.credential)
        raw_id_b64 = credential_data.get("rawId") or credential_data.get("id")
        if not raw_id_b64:
            raise HttpError(400, "Missing credential ID in response.")
        credential_id = base64url_to_bytes(raw_id_b64)
    except (json.JSONDecodeError, Exception) as e:
        raise HttpError(400, f"Invalid credential data: {e}") from None

    # Look up stored credential
    stored_credential = PasskeyCredential.objects.filter(credential_id=credential_id).first()
    if not stored_credential:
        raise HttpError(400, "Credential not recognized.")

    # Verify email matches
    if stored_credential.user.email != email:
        raise HttpError(400, "Credential does not belong to this user.")

    # Verify authentication
    try:
        verification = verify_authentication(
            credential_json=payload.credential,
            challenge=challenge,
            credential_public_key=bytes(stored_credential.public_key),
            credential_current_sign_count=stored_credential.sign_count,
            rp_id=get_rp_id_for_request(request),
        )
    except Exception as e:
        raise HttpError(400, f"WebAuthn verification failed: {e}") from None

    # Update sign count
    stored_credential.sign_count = verification.new_sign_count
    stored_credential.save()

    # Log user in
    user = stored_credential.user
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")

    # Clear session login data
    request.session.pop("webauthn_login_challenge", None)
    request.session.pop("webauthn_login_email", None)

    return user


@router.post("/auth/logout/", response=MessageOut, tags=["auth"])
def logout_view(request):
    logout(request)
    return {"detail": "Successfully logged out."}
