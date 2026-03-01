"""
URL configuration for cookless project.
"""

from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, re_path
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.generic import TemplateView
from django.views.static import serve

from cookless.api import api


def health_check(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", health_check, name="health-check"),
    path("api/v1/", api.urls),
]

# Serve media files (low volume, no CDN needed)
urlpatterns += [
    re_path(
        r"^media/(?P<path>.*)$",
        serve,
        {"document_root": settings.MEDIA_ROOT},
    ),
]

# Catch-all for SPA routing - must be last
# ensure_csrf_cookie so the frontend can read the CSRF token for API requests
spa_view = ensure_csrf_cookie(TemplateView.as_view(template_name="index.html"))
urlpatterns += [
    re_path(r"^(?!api/|media/).*$", spa_view),
]
