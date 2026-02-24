from django.urls import path

from users.auth import AppleLoginView, LogoutView
from users.views import (
    HouseholdListCreateView,
    HouseholdMemberDeleteView,
    HouseholdSwitchView,
    HouseholdUpdateView,
    InviteAcceptView,
    InviteCreateView,
    UserMeView,
)

urlpatterns = [
    path("users/me/", UserMeView.as_view(), name="user-me"),
    path("households/", HouseholdListCreateView.as_view(), name="household-list-create"),
    path("households/<uuid:pk>/", HouseholdUpdateView.as_view(), name="household-update"),
    path("households/<uuid:pk>/switch/", HouseholdSwitchView.as_view(), name="household-switch"),
    path("households/<uuid:pk>/invites/", InviteCreateView.as_view(), name="invite-create"),
    path(
        "households/<uuid:pk>/members/<int:member_pk>/",
        HouseholdMemberDeleteView.as_view(),
        name="household-member-delete",
    ),
    path("invites/<str:code>/accept/", InviteAcceptView.as_view(), name="invite-accept"),
    path("auth/apple/", AppleLoginView.as_view(), name="apple-login"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
]
