from datetime import datetime
from uuid import UUID

from ninja import Schema


class HouseholdSummaryOut(Schema):
    id: UUID
    name: str
    ai_enabled: bool
    gemini_api_key: str


class HouseholdMemberOut(Schema):
    id: int
    email: str
    role: str
    joined_at: datetime

    @staticmethod
    def resolve_email(obj):
        return obj.user.email


class HouseholdOut(Schema):
    id: UUID
    name: str
    ai_enabled: bool
    gemini_api_key: str
    members: list[HouseholdMemberOut]


class HouseholdCreateIn(Schema):
    name: str


class HouseholdUpdateIn(Schema):
    name: str


class UserOut(Schema):
    id: UUID
    email: str
    preferred_language: str
    active_household: HouseholdSummaryOut | None
    onboarding_step: str
    has_password: bool
    has_passkey: bool
    is_staff: bool

    @staticmethod
    def resolve_has_password(obj):
        return obj.has_usable_password()

    @staticmethod
    def resolve_has_passkey(obj):
        return obj.has_passkey


class UserUpdateIn(Schema):
    preferred_language: str | None = None
    active_household: UUID | None = None


class HouseholdSettingsUpdateIn(Schema):
    ai_enabled: bool | None = None
    gemini_api_key: str | None = None


class InviteOut(Schema):
    code: str
    expires_at: datetime
    household: UUID

    @staticmethod
    def resolve_household(obj):
        return obj.household_id


class MessageOut(Schema):
    detail: str


class SetPasswordIn(Schema):
    current_password: str | None = None
    new_password: str


class RemovePasswordIn(Schema):
    current_password: str


class RegisterBeginIn(Schema):
    email: str
    invite_code: str


class RegisterCompleteIn(Schema):
    credential: str
    device_name: str = ""


class InviteValidationOut(Schema):
    household_name: str
    expires_at: datetime


class PasskeyOut(Schema):
    id: UUID
    device_name: str
    created_at: datetime


class LoginPasswordIn(Schema):
    email: str
    password: str


class RegisterPasswordIn(Schema):
    email: str
    password: str
    invite_code: str


class VerifyGeminiKeyIn(Schema):
    api_key: str


class LoginBeginIn(Schema):
    email: str


class LoginCompleteIn(Schema):
    credential: str
