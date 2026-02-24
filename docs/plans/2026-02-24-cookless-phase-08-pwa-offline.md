# Cookless Phase 8: PWA & Offline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization.

**Architecture:** Django + DRF backend serving a React PWA via WhiteNoise in a single container. Cookie auth for frontend, token auth for programmatic API. Multi-user with households and Sign in with Apple.

**Tech Stack:** Python 3.13, Django 5.x, DRF, React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, react-i18next, Workbox

---

## Phase 8: PWA & Offline

### Task 32: Service worker and offline support

**Files:**
- Modify: `frontend/vite.config.ts` (PWA plugin config)
- Create: `frontend/src/sw.ts`

**Step 1: Configure Workbox via vite-plugin-pwa**

Runtime caching strategies:
- API responses for current meal plan and shopping list: StaleWhileRevalidate
- Static assets: CacheFirst
- Recipe list: NetworkFirst

**Step 2: Add offline sync for shopping list**

When offline, shopping list check/uncheck stored in IndexedDB. On reconnect, sync pending changes to API.

**Step 3: Add install prompt**

Detect `beforeinstallprompt` event. Show "Add to Home Screen" banner.

**Step 4: Commit**

```bash
git commit -m "feat: add service worker with offline caching and sync"
```
