from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import Household, HouseholdMember, Invite
from users.serializers import (
    HouseholdSerializer,
    InviteSerializer,
    UserSerializer,
)

# ── Helpers ──────────────────────────────────────────────────────────


def _is_owner(user, household):
    return HouseholdMember.objects.filter(
        household=household, user=user, role=HouseholdMember.Role.OWNER
    ).exists()


def _is_member(user, household):
    return HouseholdMember.objects.filter(household=household, user=user).exists()


# ── User Me ──────────────────────────────────────────────────────────


class UserMeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


# ── Households ───────────────────────────────────────────────────────


class HouseholdListCreateView(generics.ListCreateAPIView):
    serializer_class = HouseholdSerializer

    def get_queryset(self):
        return Household.objects.filter(members__user=self.request.user)

    def perform_create(self, serializer):
        household = serializer.save()
        HouseholdMember.objects.create(
            household=household,
            user=self.request.user,
            role=HouseholdMember.Role.OWNER,
        )
        user = self.request.user
        user.active_household = household
        user.save()


class HouseholdUpdateView(generics.UpdateAPIView):
    serializer_class = HouseholdSerializer
    queryset = Household.objects.all()

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if not _is_owner(request.user, obj):
            self.permission_denied(request)


class HouseholdSwitchView(APIView):
    def post(self, request, pk):
        household = get_object_or_404(Household, pk=pk)
        if not _is_member(request.user, household):
            return Response(
                {"detail": "You are not a member of this household."},
                status=status.HTTP_403_FORBIDDEN,
            )
        request.user.active_household = household
        request.user.save()
        return Response({"detail": "Switched active household."})


# ── Invites ──────────────────────────────────────────────────────────


class InviteCreateView(generics.CreateAPIView):
    serializer_class = InviteSerializer

    def create(self, request, pk):
        household = get_object_or_404(Household, pk=pk)
        if not _is_owner(request.user, household):
            return Response(
                {"detail": "Only household owners can create invites."},
                status=status.HTTP_403_FORBIDDEN,
            )
        invite = Invite.objects.create(
            household=household,
            created_by=request.user,
            expires_at=timezone.now() + timedelta(days=7),
        )
        serializer = self.get_serializer(invite)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class InviteAcceptView(APIView):
    def post(self, request, code):
        invite = get_object_or_404(Invite, code=code)

        if invite.is_expired:
            return Response(
                {"detail": "This invite has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if invite.used_by is not None:
            return Response(
                {"detail": "This invite has already been used."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if _is_member(request.user, invite.household):
            return Response(
                {"detail": "You are already a member of this household."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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

        return Response({"detail": "Joined household."})


# ── Member removal ───────────────────────────────────────────────────


class HouseholdMemberDeleteView(generics.DestroyAPIView):
    queryset = HouseholdMember.objects.all()

    def get_object(self):
        return get_object_or_404(
            HouseholdMember,
            pk=self.kwargs["member_pk"],
            household_id=self.kwargs["pk"],
        )

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if not _is_owner(request.user, obj.household):
            self.permission_denied(request)

    def destroy(self, request, *args, **kwargs):
        member = self.get_object()
        self.check_object_permissions(request, member)
        if member.user == request.user:
            return Response(
                {"detail": "Cannot remove yourself from the household."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
