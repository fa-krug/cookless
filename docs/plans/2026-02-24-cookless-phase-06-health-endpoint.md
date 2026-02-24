# Cookless Phase 6: Health Endpoint

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization.

**Architecture:** Django + Django Ninja backend serving a React PWA via WhiteNoise in a single container. Cookie auth for frontend, Bearer token auth for programmatic API. Multi-user with households and Sign in with Apple.

**Tech Stack:** Python 3.13, Django 5.x, Django Ninja, Pydantic, React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, react-i18next, Workbox

---

## Phase 6: Health Endpoint

### Task 21: Health check endpoint

**Files:**
- Modify: `backend/cookless/urls.py`

**Step 1: Add simple health endpoint**

```python
# In cookless/urls.py
from django.http import JsonResponse

def health_check(request):
    return JsonResponse({"status": "ok"})

urlpatterns = [
    path("api/v1/health/", health_check),
    ...
]
```

**Step 2: Test and commit**

```bash
cd backend && python manage.py test --pattern="*" -v 0  # quick sanity
git commit -m "feat: add health check endpoint"
```
