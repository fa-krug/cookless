from django.conf import settings

from webauthn import generate_registration_options, verify_registration_response
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)


def get_registration_options(user_id: str, user_email: str, existing_credentials: list[bytes]):
    options = generate_registration_options(
        rp_id=settings.WEBAUTHN_RP_ID,
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


def verify_registration(credential_json: str, challenge: bytes):
    return verify_registration_response(
        credential=credential_json,
        expected_challenge=challenge,
        expected_rp_id=settings.WEBAUTHN_RP_ID,
        expected_origin=settings.WEBAUTHN_ORIGIN,
    )
