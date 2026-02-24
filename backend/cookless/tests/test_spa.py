from django.test import override_settings

import pytest

TEMPLATES_WITH_SPA = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


@pytest.mark.django_db
class TestSPACatchAll:
    """Tests for the SPA catch-all route that serves index.html."""

    def test_root_serves_index_html(self, client, tmp_path):
        """Root URL should serve index.html via the catch-all."""
        index = tmp_path / "index.html"
        index.write_text("<html><body>SPA</body></html>")
        templates = [{**TEMPLATES_WITH_SPA[0], "DIRS": [str(tmp_path)]}]

        with override_settings(TEMPLATES=templates):
            response = client.get("/")
            assert response.status_code == 200
            assert b"SPA" in response.content

    def test_spa_route_serves_index_html(self, client, tmp_path):
        """Arbitrary SPA routes should serve index.html."""
        index = tmp_path / "index.html"
        index.write_text("<html><body>SPA</body></html>")
        templates = [{**TEMPLATES_WITH_SPA[0], "DIRS": [str(tmp_path)]}]

        with override_settings(TEMPLATES=templates):
            response = client.get("/recipes/123")
            assert response.status_code == 200
            assert b"SPA" in response.content

    def test_nested_spa_route_serves_index_html(self, client, tmp_path):
        """Deeply nested SPA routes should serve index.html."""
        index = tmp_path / "index.html"
        index.write_text("<html><body>SPA</body></html>")
        templates = [{**TEMPLATES_WITH_SPA[0], "DIRS": [str(tmp_path)]}]

        with override_settings(TEMPLATES=templates):
            response = client.get("/settings/household/members")
            assert response.status_code == 200
            assert b"SPA" in response.content

    def test_api_routes_not_caught_by_spa(self, client):
        """API routes should not be caught by the SPA catch-all."""
        response = client.get("/api/v1/health/")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_api_v1_docs_not_caught_by_spa(self, client):
        """API docs should not be caught by the SPA catch-all."""
        response = client.get("/api/v1/docs")
        assert response.status_code in (200, 301, 302)
