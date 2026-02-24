from rest_framework.permissions import BasePermission


class IsHouseholdMember(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if not request.user.active_household:
            return False
        return request.user.household_memberships.filter(
            household=request.user.active_household
        ).exists()
