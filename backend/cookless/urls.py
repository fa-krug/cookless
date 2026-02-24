"""
URL configuration for cookless project.
"""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import path

from cookless.api import api


def health_check(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health_check, name="health-check"),
    path("api/v1/", api.urls),
]
