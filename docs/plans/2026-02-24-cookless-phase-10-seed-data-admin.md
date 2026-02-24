# Cookless Phase 10: Seed Data & Admin

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization.

**Architecture:** Django + Django Ninja backend serving a React PWA via WhiteNoise in a single container. Cookie auth for frontend, Bearer token auth for programmatic API. Multi-user with households and Sign in with Apple.

**Tech Stack:** Python 3.13, Django 5.x, Django Ninja, Pydantic, React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, react-i18next, Workbox

---

## Phase 10: Seed Data & Admin

### Task 34: Django admin and seed data

**Files:**
- Modify: `backend/recipes/admin.py`
- Modify: `backend/users/admin.py`
- Modify: `backend/planner/admin.py`
- Modify: `backend/shopping/admin.py`
- Create: `backend/recipes/management/commands/seed_units.py`

**Step 1: Register all models in Django admin**

Inline editing for RecipeIngredient and CookingStep on Recipe admin.

**Step 2: Create seed_units management command**

Seeds common units: g, kg, ml, l, Stk/pcs, EL/tbsp, TL/tsp, Prise/pinch with conversion factors.

**Step 3: Run and commit**

```bash
cd backend && python manage.py seed_units
git commit -m "feat: add Django admin config and seed units command"
```
