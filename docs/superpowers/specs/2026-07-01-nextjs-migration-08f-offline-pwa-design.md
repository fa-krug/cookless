# Plan 8f — Offline PWA — Design

**Predecessor:** Plan 8e (planner fidelity). Final plan of the Section B parity roadmap in `docs/superpowers/plans/2026-06-27-nextjs-migration-08-cutover.md`.

**Audit item:** C2 (offline PWA). The old app shipped offline shopping-toggle queuing + runtime read caching via a Workbox service worker; the Next.js app currently has a manifest (installable) but **no service worker at all**.

## Goal

Restore the two offline capabilities lost in the migration:

1. **Offline shopping-toggle queue** — toggling shopping items while offline succeeds optimistically, is queued locally, and replays to the server on reconnect.
2. **Runtime read caching** — `/shopping`, `/plan`, and recipe read pages remain viewable while offline.

Plus one intentional improvement over the old app's fully-silent behavior: a **subtle offline indicator**.

## Why this is not a line-by-line port

The old app was a SPA calling a Django REST API. Its service worker intercepted `PATCH /api/v1/shopping-lists/items/{id}/toggle/` — a clean, replayable REST request — queued it in IndexedDB when offline, returned a synthetic `200`, and replayed on the browser `online` event (`useOnlineSync` → SW `REPLAY_PENDING` → SW `SYNC_COMPLETE` → query invalidation).

The Next.js app mutates through **Server Actions** (`toggleShoppingItemAction`, `uncheckAllShoppingAction`): POSTs to the route carrying an opaque per-build action ID, returning an RSC stream. These cannot be reliably intercepted or replayed by a service worker. Reads are RSC payloads, not JSON.

So the mechanism is re-architected: introduce a real JSON endpoint for the write, keep the queue in testable app code, and use a hand-rolled runtime-caching service worker for reads.

## Locked decisions (AskUserQuestion, 2026-07-01)

- **Queue location:** client-side module (`lib/offline/`) + `useOnlineSync` hook — fully unit-testable in Vitest. The service worker does read caching only.
- **SW tooling:** hand-rolled runtime-only `public/sw.js` — no build-time precache manifest, no PWA build dependency. Matches the codebase's dependency-light, hand-rolled style.
- **Offline read scope:** `/shopping` + `/plan` + recipes (parity with the old app).
- **Offline UX:** add a subtle offline indicator (the one deliberate improvement over the old app's silent behavior); adds new i18n keys.

## Architecture — four units

Each unit has one clear purpose, a defined interface, and is independently testable where practical.

### 1. Toggle Route Handler

`app/api/shopping/toggle/route.ts` — a `POST` handler that is the clean, replayable write path the Server Actions cannot be.

- Body is discriminated: `{ kind: "toggle", itemId }` or `{ kind: "uncheck-all", itemIds }`.
- Reuses `toggleShoppingItem` / `setShoppingItemsChecked` from `lib/shopping/items.ts` unchanged.
- Auth via `requireHousehold()` from `@/lib/auth/session`; `AuthError → { message }` + status, mirroring `app/api/recipes/route.ts`.
- Returns JSON: `{ checked: boolean }` for a toggle, `{ count: number }` for uncheck-all.

Consumed by: the shopping client components (online path) and `drainQueue` (replay path).

### 2. Queue module

`lib/offline/queue.ts` — a pure IndexedDB wrapper. No React, no fetch.

- `enqueue(op): Promise<void>`, `all(): Promise<QueuedOp[]>`, `remove(id): Promise<void>`, `count(): Promise<number>`, `clear(): Promise<void>`.
- `QueuedOp = { id: number; kind: "toggle" | "uncheck-all"; payload: unknown; ts: number }` (autoincrement `id`, insertion order preserved).
- DB name `cookless-offline`, store `pending-ops`, version 1 (distinct from the old app's `pending-toggles` store; no migration from the old app).
- Unit-tested with `fake-indexeddb`.

### 3. Sync engine + hook

`lib/offline/sync.ts` — `drainQueue(fetchImpl = fetch): Promise<{ drained: number; remaining: number }>`. Pure and injectable:

- Reads `all()`, replays each op in insertion order via a `POST` to the Route Handler.
- On per-op success → `remove(id)`. On first failure (network or non-2xx) → **stop**, leaving that op and the rest for the next attempt (matches old app's stop-on-failure replay).
- Unit-tested with a stub `fetchImpl`.

`lib/offline/use-online-sync.ts` — client hook: drains on mount and on the `online` event; after a fully-successful drain calls `router.refresh()` to re-pull the shopping RSC (App Router equivalent of the old query invalidation). Exposes queue count so the indicator can react.

### 4. Service worker

`public/sw.js` — hand-rolled, runtime-caching only (served at root scope `/sw.js`; plain JS, no build step).

- **CacheFirst:** `/_next/static/*`, images, fonts (content-hashed / long-lived).
- **NetworkFirst:** navigation requests (`request.mode === "navigate"`) and RSC fetches (`RSC` header / `?_rsc=`) for `/shopping`, `/plan`, `/recipes` and recipe detail — falling back to cache when offline. The cache key is **normalized to strip the `_rsc` query param** so RSC hits don't miss on the varying hash.
- **Never caches** non-GET requests (Route Handler POST, Server Action POSTs).
- **Versioning:** cache names carry a version constant; `activate` deletes caches from other versions.
- **`CLEAR_CACHES` message:** deletes all runtime caches (fired on logout).
- Registration: a small `<ServiceWorkerRegistration/>` client component calls `navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })` in an effect.

## Wiring / mount points

- `<ServiceWorkerRegistration/>`, `useOnlineSync()`, and `<OfflineIndicator/>` mount inside `components/providers.tsx` — the existing client boundary wrapping the authenticated shell.
- Logout (`app/(app)/settings/account-section.tsx`, already a client component) posts `CLEAR_CACHES` to the active SW and calls `queue.clear()` before `logoutAction()`, preventing cross-account cache/queue leakage on shared devices.

## Toggle client change

`components/shopping/shopping-category.tsx` and `components/shopping/shopping-actions.tsx` switch from the Server Action to a helper (`submitToggle` / `submitUncheckAll` in `lib/offline/`):

- Apply optimistic UI (unchanged from today).
- `fetch` the Route Handler. On `ok` → done. On **network failure** (offline) → `enqueue(op)` and **keep** the optimistic state (mirrors the old synthetic-`200`). On **HTTP error while online** → revert optimistic state + toast (`common.errorRetry`).

The Server Actions `toggleShoppingItemAction` and `uncheckAllShoppingAction` have no other callers (verified) and are **removed** in this plan.

## Offline indicator

`components/offline/offline-indicator.tsx` — client component subscribed to `online`/`offline` events and the queue count from `useOnlineSync`:

- Offline → slim banner: "You're offline — changes will sync when you reconnect."
- Reconnecting with a non-empty queue → brief "Syncing…" state, cleared on drain.
- New i18n keys `offline.banner` and `offline.syncing` in both `lib/i18n/locales/en.json` and `de.json`.

## Data flow — offline toggle → reconnect

1. User taps a checkbox offline → optimistic strike-through applied immediately.
2. `fetch` to the Route Handler rejects (offline) → op enqueued in IndexedDB; indicator shows "offline".
3. User reconnects → `online` fires → `useOnlineSync` runs `drainQueue` → each op POSTs to the Route Handler → server updates the DB.
4. Full drain success → `router.refresh()` re-pulls the shopping RSC → UI reconciles with server truth; indicator clears.

## Testing

- `lib/offline/queue.test.ts` (fake-indexeddb): enqueue/all/remove/count/clear, insertion ordering, autoincrement ids.
- `lib/offline/sync.test.ts` (stub `fetchImpl`): full drain removes all; mid-failure stops and keeps the remainder; empty queue no-ops; non-2xx treated as failure.
- `app/api/shopping/toggle/route.test.ts` (in-memory SQLite via `@/lib/test/db`, mirrors `app/api/recipes/route.ts` tests): toggle flips checked state; bulk uncheck; 401 unauthenticated; 404 for a foreign/unknown item.
- Service worker, the `useOnlineSync` hook wiring, and the indicator: manually verified and documented (consistent with the old app, which had no automated SW coverage). Any non-trivial logic is extracted into the tested pure functions above.
- Verification per task: `npx vitest run` + `npm run typecheck` + `npm run build`. No eslint step (Next 16).

## Scope boundaries

- **New devDependency:** `fake-indexeddb`. **No runtime dependencies added** (hand-rolled SW).
- **Out of scope:** Background Sync API (keep the online-event replay for parity/simplicity); offline *creation/editing* of recipes or plans (only shopping toggles queue, matching the old app); a build-time precache manifest / PWA build integration.

## Risks & mitigations

- **RSC cache-key variance** — the `_rsc` query param changes per navigation; caching by full URL would miss offline. Mitigation: normalize the SW cache key by stripping `_rsc`.
- **Cross-account cache leakage** on shared devices — cached authed RSC/pages could outlive a session. Mitigation: `CLEAR_CACHES` message + `queue.clear()` on logout.
- **Service-worker staleness** — a stale SW script would pin old behavior. Mitigation: versioned cache names purged on `activate`; register with `updateViaCache: "none"`.
