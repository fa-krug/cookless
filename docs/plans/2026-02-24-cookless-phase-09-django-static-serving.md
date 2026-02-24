# Cookless Phase 9: Django Static File Serving

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization.

**Architecture:** Django + DRF backend serving a React PWA via WhiteNoise in a single container. Cookie auth for frontend, token auth for programmatic API. Multi-user with households and Sign in with Apple.

**Tech Stack:** Python 3.13, Django 5.x, DRF, React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, react-i18next, Workbox

---

## Phase 9: Django Static File Serving

### Task 33: Serve React build from Django

**Files:**
- Modify: `backend/cookless/settings.py`
- Modify: `backend/cookless/urls.py`

**Step 1: Configure WhiteNoise to serve frontend build**

```python
# settings.py
STATICFILES_DIRS = [BASE_DIR / "frontend_dist"]
STATIC_ROOT = BASE_DIR / "staticfiles"

# urls.py - catch-all for React Router (SPA)
from django.views.generic import TemplateView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("users.urls")),
    path("api/v1/", include("recipes.urls")),
    path("api/v1/", include("planner.urls")),
    path("api/v1/", include("shopping.urls")),
]

# Catch-all for SPA routing - must be last
urlpatterns += [
    re_path(r"^(?!api/).*$", TemplateView.as_view(template_name="index.html")),
]
```

**Step 2: Verify production build serves correctly**

```bash
cd frontend && npm run build
cp -r dist/ ../backend/frontend_dist/
cd ../backend && python manage.py collectstatic --noinput
python manage.py runserver
```
Visit localhost:8000 - React app should load.

**Step 3: Commit**

```bash
git commit -m "feat: serve React PWA build via Django WhiteNoise"
```
