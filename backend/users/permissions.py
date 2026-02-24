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
