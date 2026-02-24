from django.contrib.auth import logout

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class AppleLoginView(APIView):
    """
    Handle Apple OAuth callback.
    In production, this will validate the Apple identity token and create/get user.
    For now, this is a placeholder that will be fully implemented when
    the Apple Developer account is configured.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        # Placeholder - will integrate with allauth Apple provider
        # Expected flow:
        # 1. Frontend sends Apple identity token
        # 2. Backend validates token with Apple
        # 3. Creates or gets user based on Apple subject ID
        # 4. Returns session cookie (frontend) or token (API)
        return Response(
            {"detail": "Apple Sign-In not yet configured. Set APPLE_CLIENT_ID env var."},
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )


class LogoutView(APIView):
    """Clear the user's session."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"detail": "Successfully logged out."}, status=status.HTTP_200_OK)
