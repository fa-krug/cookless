from datetime import datetime
from uuid import UUID

from ninja import Schema


class HouseholdSummaryOut(Schema):
    id: UUID
    name: str


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
    members: list[HouseholdMemberOut]


class HouseholdCreateIn(Schema):
    name: str


class HouseholdUpdateIn(Schema):
    name: str


class UserOut(Schema):
    id: UUID
    email: str
    preferred_language: str
    settings: dict
    active_household: HouseholdSummaryOut | None
    has_password: bool
    has_passkey: bool

    @staticmethod
    def resolve_has_password(obj):
        return obj.has_usable_password()

    @staticmethod
    def resolve_has_passkey(obj):
        return obj.has_passkey


class UserUpdateIn(Schema):
    preferred_language: str | None = None
    settings: dict | None = None
    active_household: UUID | None = None


class InviteOut(Schema):
    code: str
    expires_at: datetime
    household: UUID

    @staticmethod
    def resolve_household(obj):
        return obj.household_id


class MessageOut(Schema):
    detail: str


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


class LoginBeginIn(Schema):
    email: str


class LoginCompleteIn(Schema):
    credential: str
