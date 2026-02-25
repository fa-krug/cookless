from django.conf import settings
from django.http import HttpRequest

from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)


def get_rp_id_for_request(request: HttpRequest) -> str:
    """Derive the WebAuthn RP ID from the request host, validated against allowed RP IDs."""
    host = request.get_host().split(":")[0]  # strip port
    if host in settings.WEBAUTHN_RP_ID:
        return host
    # Fallback to first configured RP ID
    return settings.WEBAUTHN_RP_ID[0]


def get_registration_options(
    user_id: str, user_email: str, existing_credentials: list[bytes], rp_id: str
):
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_id=user_id.encode(),
        user_name=user_email,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=cred_id) for cred_id in existing_credentials
        ],
    )
    return options


def verify_registration(credential_json: str, challenge: bytes, rp_id: str):
    return verify_registration_response(
        credential=credential_json,
        expected_challenge=challenge,
        expected_rp_id=rp_id,
        expected_origin=settings.WEBAUTHN_ORIGIN,
    )


def get_authentication_options(credential_ids: list[bytes], rp_id: str):
    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=[PublicKeyCredentialDescriptor(id=cred_id) for cred_id in credential_ids],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return options


def verify_authentication(
    credential_json: str,
    challenge: bytes,
    credential_public_key: bytes,
    credential_current_sign_count: int,
    rp_id: str,
):
    return verify_authentication_response(
        credential=credential_json,
        expected_challenge=challenge,
        expected_rp_id=rp_id,
        expected_origin=settings.WEBAUTHN_ORIGIN,
        credential_public_key=credential_public_key,
        credential_current_sign_count=credential_current_sign_count,
    )
