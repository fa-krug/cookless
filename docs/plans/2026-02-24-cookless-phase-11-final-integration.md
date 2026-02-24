# Cookless Phase 11: Final Integration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization.

**Architecture:** Django + DRF backend serving a React PWA via WhiteNoise in a single container. Cookie auth for frontend, token auth for programmatic API. Multi-user with households and Sign in with Apple.

**Tech Stack:** Python 3.13, Django 5.x, DRF, React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, react-i18next, Workbox

---

## Phase 11: Final Integration

### Task 35: End-to-end integration test

**Files:**
- Create: `backend/tests/test_integration.py`

**Step 1: Write integration test**

Full flow test:
1. Create user + household
2. Add 5 recipes with ingredients
3. Generate meal plan
4. Generate shopping list
5. Verify shopping list has aggregated ingredients
6. Check off items

**Step 2: Run all tests**

```bash
cd backend && pytest -v
cd frontend && npm run test
```

**Step 3: Commit**

```bash
git commit -m "test: add end-to-end integration test"
```

---

### Task 36: Final cleanup and README

**Files:**
- Create: `CLAUDE.md`
- Create: `README.md`
- Create: `.gitignore`

**Step 1: Create CLAUDE.md**

Project conventions, how to run, test commands, architecture overview for AI assistants.

**Step 2: Create README.md**

Project description, setup instructions, development workflow, deployment.

**Step 3: Create .gitignore**

Python + Node + Django defaults.

**Step 4: Final commit**

```bash
git add .
git commit -m "docs: add README, CLAUDE.md, and .gitignore"
```
