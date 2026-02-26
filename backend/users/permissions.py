from ninja.errors import HttpError

from users.models import HouseholdMember


def require_household_member(request):
    """Raises HttpError if user is not an authenticated member of their active household."""
    if not request.user.is_authenticated:
        raise HttpError(401, "Authentication required")
    if not request.user.active_household_id:
        raise HttpError(403, "No active household")
    if not request.user.household_memberships.filter(
        household=request.user.active_household
    ).exists():
        raise HttpError(403, "Not a member of active household")


def require_household_owner(request, household):
    """Raises HttpError if user is not an OWNER of the given household."""
    if not HouseholdMember.objects.filter(
        household=household, user=request.user, role=HouseholdMember.Role.OWNER
    ).exists():
        raise HttpError(403, "Owner access required")


def require_scope(request, scope: str) -> None:
    """Raises HttpError if the request was made via PAT and lacks the required scope.

    Session-authenticated requests are always allowed (no scope restriction).
    """
    scopes = getattr(request, "auth_scopes", None)
    if scopes is None:
        return  # Session auth — no scope restriction
    if scope not in scopes:
        raise HttpError(403, f"Token missing required scope: {scope}")
