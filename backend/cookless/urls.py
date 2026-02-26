"""
URL configuration for cookless project.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, re_path
from django.views.generic import TemplateView

from cookless.api import api


def health_check(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", health_check, name="health-check"),
    path("api/v1/", api.urls),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Catch-all for SPA routing - must be last
urlpatterns += [
    re_path(r"^(?!api/|media/).*$", TemplateView.as_view(template_name="index.html")),
]
