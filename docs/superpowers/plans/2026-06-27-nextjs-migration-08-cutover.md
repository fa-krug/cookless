# Plan 8 — Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the Django backend + React/Vite frontend and ship the Next.js `web/` app as the single production deployment — by closing the cutover-blocking data/security/packaging gaps, then migrating prod data into the new schema and verifying it.

**Architecture:** One multi-stage `web/Dockerfile` produces a single Next.js standalone container; `data/` volume holds the SQLite DB + images. The Django `db.sqlite3` is migrated once via the existing `web/scripts/migrate-data.ts` (extended for a forced password reset), verified by row counts + FK check + spot-checks, then the old stack is decommissioned. Parity gaps the audit surfaced that are **not** cutover-blockers are split into focused follow-on plans (§B roadmap) — this plan ships a working, deployable app on its own.

**Tech Stack:** Next.js 16 (standalone output) · Drizzle + better-sqlite3 · Docker multi-stage · tsx scripts · Vitest · `@simplewebauthn/server` · argon2.

## Background — why this plan is more than "Docker + migrate + verify"

A full old-vs-new feature audit (2026-06-27) found the data layer, domain algorithms, auth core, and AI pipeline are faithfully ported, but several **cutover-blocking** issues exist. Verified hands-on:

- **Password migration breaks every existing login.** The migration copies the Django `password` hash verbatim (`web/scripts/lib/table-map.ts:20`). The new verifier is argon2 (`web/lib/auth/password.ts:15-21`): a Django `pbkdf2_sha256$…` hash makes `argon2.verify` throw → login fails. And `hasUsablePassword` is `hash !== ""` (`password.ts:7-8`), so a Django unusable `!…` hash reads as a *real* password → migrated passkey-only users can delete their last passkey and lock themselves out.
- **No deployment artifacts for `web/`.** Root `Dockerfile` + both `docker-compose*.yml` still build the old Django+Vite stack.
- **CSRF removed** on the WebAuthn route handlers (`web/app/api/auth/webauthn/add/*`).
- **Password change never invalidates sessions** (`deleteUserSessions` in `session-store.ts:39` is implemented but never called).
- **No PWA** (manifest/icons absent; `web/public/` holds only default Next.js SVGs).
- **`db:seed` is broken** — `web/package.json` points at `scripts/seed.ts`, which does not exist.

## Decisions (locked 2026-06-27)

1. **Plan scope:** Split. This Plan 8 = lean cutover (data/security fixes + Docker + verify) in full detail; feature-parity gaps become follow-on plans 8a–8f (§B).
2. **Password migration:** **Force password reset.** Map every Django password value → unusable (`""`) at migration. Passkey users keep working; password-only users get a new credential via the email-free admin set-password script (Task 9). This single rule also fixes the `!…`-hash bug.
3. **PWA/offline:** **Installable only.** Add manifest + icons + theme color so the app installs (Task 7). The offline shopping-toggle queue is **deferred** to Plan 8f.
4. **Personal Access Tokens:** **Confirmed dropped** (matches the migration design spec out-of-scope list). Release note required (Task 11).

## Global Constraints

- **Working directory:** all commands run from `web/` unless stated. The new app lives entirely under `web/`.
- **No new runtime deps** beyond what `web/package.json` already declares, except where a task explicitly adds one. PWA is hand-rolled (static manifest) — do **not** add `next-pwa`/`serwist` for the installable-only scope.
- **Verification per task:** `npm test` (vitest), `npm run typecheck` (`tsc --noEmit`), and for tasks touching pages/routes/config `npm run build`. There is NO `lint` script in `web/` (ESLint runs via pre-commit).
- **Test DB helper:** `createTestDb()` from `@/lib/test/db` (in-memory SQLite, `foreign_keys = ON`, migrations applied).
- **Decimals/dates/binary:** preserve existing conventions — decimals as TEXT, `DateField` as `YYYY-MM-DD` TEXT, datetimes as epoch-second integers, binary as BLOB. Do not change `transformValue`'s existing date/decimal behavior.
- **Unusable password marker:** `UNUSABLE_PASSWORD = ""` (`web/lib/auth/password.ts:5`) is the single source of truth; reference it, never hardcode `""`.
- **Env var names (new app):** `AUTH_SECRET` (required in prod), `DATABASE_FILE` (SQLite path), `MEDIA_ROOT` (image dir, default `data/media`), `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` / `WEBAUTHN_ORIGIN` (same names as old). `SOURCE_DB` is used only by the one-shot data import.
- **Cutover is one-shot:** no live dual-write. The prod migration (Task 10) runs against a copy of prod `db.sqlite3` with the old stack stopped.

---

## File Structure

**Modified (cutover-blocking code):**
- `web/scripts/lib/table-map.ts` — no structural change; password forced-reset handled in the transform.
- `web/scripts/migrate-data.ts` — extend `transformValue` to force-reset `password`.
- `web/scripts/lib/table-map.test.ts` *(create if absent)* / `web/scripts/migrate-data.test.ts` — test the password transform.
- `web/app/api/auth/webauthn/add/begin/route.ts`, `add/complete/route.ts`, `login/begin/route.ts`, `login/complete/route.ts`, `register/begin/route.ts`, `register/complete/route.ts` — same-origin guard.
- `web/lib/auth/origin.ts` *(create)* — `assertSameOrigin(request)` helper + test.
- `web/lib/auth/password-management.ts` — call `deleteUserSessions` on password set/remove.

**Created (packaging / PWA / ops):**
- `web/public/manifest.webmanifest`, `web/public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `web/public/apple-touch-icon.png`.
- `web/app/layout.tsx` — add `metadata`/`viewport` (manifest link, theme color). *(modify)*
- `web/Dockerfile` — multi-stage standalone build.
- `web/.dockerignore`.
- `web/next.config.ts` — `output: "standalone"`. *(modify)*
- `docker-compose.yml` *(repo root, replace)* — single `web` service, dev.
- `docker-compose.production.yml` *(repo root, replace)* — single `web` service, prod.
- `web/scripts/seed.ts` — seed default tags/units/ingredients (fixes broken `db:seed`).
- `web/scripts/set-password.ts` — email-free admin password reset.
- `web/scripts/verify-migration.ts` — post-import spot-check report.
- `docs/RELEASE-NOTES-nextjs-cutover.md` — user-facing breaking-change notes.
- `docs/runbooks/cutover.md` — the ordered production cutover runbook.

---

## SECTION A — Cutover-blocking work

## Task 1: Force password reset in the data migration

Implements decision #2. Every migrated `password` value becomes unusable; password users reset later (Task 9), passkey users are unaffected. Also eliminates the `!…`-hash-reads-as-usable bug.

**Files:**
- Modify: `web/scripts/migrate-data.ts` (the `transformValue` function, ~line 22)
- Test: `web/scripts/migrate-data.test.ts` (create)

**Interfaces:**
- Produces: `transformValue(destCol: string, value: unknown): unknown` — when `destCol === "password"`, returns `""` for any non-null input.

- [ ] **Step 1: Write the failing test**

```ts
// web/scripts/migrate-data.test.ts
import { describe, it, expect } from "vitest";
import { transformValue } from "./migrate-data";

describe("transformValue password reset", () => {
  it("maps a Django pbkdf2 hash to the unusable marker", () => {
    expect(transformValue("password", "pbkdf2_sha256$870000$abc$def==")).toBe("");
  });
  it("maps a Django unusable (!) hash to the unusable marker", () => {
    expect(transformValue("password", "!someRandomUnusableMarker")).toBe("");
  });
  it("leaves null untouched", () => {
    expect(transformValue("password", null)).toBeNull();
  });
  it("does not alter non-password columns", () => {
    expect(transformValue("email", "a@b.test")).toBe("a@b.test");
  });
});
```

- [ ] **Step 2: Make `transformValue` importable, then run the test to see it fail**

`migrate-data.ts` currently runs top-level side effects on import (opens DBs). Guard the runner so importing the module for tests does not execute the migration: wrap the import-time DB work in `if (process.env.VITEST !== "true")` (Vitest sets `VITEST=true`), and add `export` to `transformValue`.

Run: `npx vitest run scripts/migrate-data.test.ts`
Expected: FAIL — the pbkdf2 case returns the original hash, not `""`.

- [ ] **Step 3: Implement the forced reset**

In `transformValue`, before the existing timestamp/decimal branches:

```ts
import { UNUSABLE_PASSWORD } from "../lib/auth/password";
// ...
function transformValue(destCol: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (destCol === "password") return UNUSABLE_PASSWORD; // forced reset: all hashes invalidated
  // ...existing TIMESTAMP_DEST_COLS / DECIMAL_DEST_COLS branches unchanged...
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/migrate-data.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add web/scripts/migrate-data.ts web/scripts/migrate-data.test.ts
git commit -m "feat(web): force password reset during data migration (Plan 8 Task 1)"
```

---

## Task 2: Same-origin guard on WebAuthn route handlers

Closes the CSRF regression (audit C5). Server Actions get framework origin checks; the raw `app/api/auth/webauthn/*` route handlers do not. Add an `Origin`/`Sec-Fetch-Site` check.

**Files:**
- Create: `web/lib/auth/origin.ts`
- Create: `web/lib/auth/origin.test.ts`
- Modify: all six `web/app/api/auth/webauthn/**/route.ts` handlers

**Interfaces:**
- Produces: `assertSameOrigin(request: Request): void` — throws `AuthError(403, "Cross-origin request rejected")` when the request's `Origin` host is not in the allowed origins (reuse `getAllowedOrigins()` from `@/lib/auth/config`), allowing same-origin and missing-Origin same-site navigations via `Sec-Fetch-Site: same-origin`.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/auth/origin.test.ts
import { describe, it, expect } from "vitest";
import { assertSameOrigin } from "./origin";

const req = (headers: Record<string, string>) =>
  new Request("https://app.example.test/api/auth/webauthn/add/begin", { method: "POST", headers });

describe("assertSameOrigin", () => {
  it("allows same Sec-Fetch-Site", () => {
    expect(() => assertSameOrigin(req({ "sec-fetch-site": "same-origin" }))).not.toThrow();
  });
  it("rejects a cross-site Origin", () => {
    expect(() => assertSameOrigin(req({ origin: "https://evil.test", "sec-fetch-site": "cross-site" }))).toThrow(/Cross-origin/);
  });
});
```

Set `WEBAUTHN_ORIGIN=https://app.example.test` in the test (or stub `getAllowedOrigins`) so the allowlist is deterministic.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/auth/origin.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `assertSameOrigin`**

```ts
// web/lib/auth/origin.ts
import { AuthError } from "./errors";
import { getAllowedOrigins } from "./config";

export function assertSameOrigin(request: Request): void {
  const site = request.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return; // same-tab navigation / direct
  const origin = request.headers.get("origin");
  if (origin && getAllowedOrigins().includes(origin)) return;
  throw new AuthError(403, "Cross-origin request rejected");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/auth/origin.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the guard into all six handlers**

At the top of each `POST` in `web/app/api/auth/webauthn/{register,login,add}/{begin,complete}/route.ts`, before any body parsing:

```ts
import { assertSameOrigin } from "@/lib/auth/origin";
// inside POST(request):
try {
  assertSameOrigin(request);
} catch (e) {
  if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
  throw e;
}
```

Match each handler's existing error-shaping convention (some may already catch `AuthError` centrally — reuse that path rather than duplicating).

- [ ] **Step 6: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add web/lib/auth/origin.ts web/lib/auth/origin.test.ts web/app/api/auth/webauthn
git commit -m "feat(web): same-origin guard on WebAuthn route handlers (Plan 8 Task 2)"
```

---

## Task 3: Invalidate sessions on password change/removal

Closes audit C6. Old Django rotated the session on `set_password`; the new code never calls the already-implemented `deleteUserSessions`.

**Files:**
- Modify: `web/lib/auth/password-management.ts`
- Test: `web/lib/auth/password-management.test.ts` (extend)

**Interfaces:**
- Consumes: `deleteUserSessions(db, userId)` from `@/lib/auth/session-store` (already exists, `session-store.ts:39`).

- [ ] **Step 1: Write the failing test**

```ts
// add to web/lib/auth/password-management.test.ts
it("deletes other sessions when a password is set", async () => {
  const db = createTestDb();
  const now = nowSeconds();
  db.insert(users).values({ id: "u1", email: "a@x.test", password: await hashPassword("OldP4ss!word"), onboardingStep: "COMPLETED", createdAt: now }).run();
  db.insert(sessions).values({ id: "s1", userId: "u1", expiresAt: now + 1000, createdAt: now }).run();
  await setPassword(db, "u1", { currentPassword: "OldP4ss!word", newPassword: "Newp4ss!word2" });
  const remaining = db.select().from(sessions).where(eq(sessions.userId, "u1")).all();
  expect(remaining.length).toBe(0);
});
```

(Import `sessions`, `eq`, `nowSeconds` consistent with the file's existing imports.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/auth/password-management.test.ts`
Expected: FAIL — session row still present.

- [ ] **Step 3: Implement**

In `setPassword` and `removePassword`, after the `.set({...}).run()` update, add:

```ts
deleteUserSessions(db, userId);
```

Decide whether the *current* session should survive: for parity with Django's "stay logged in after changing your own password," the caller (the server action) should re-issue the current session after calling `setPassword`. Document this in the action: call `deleteUserSessions` (inside `setPassword`) then `createSession` + `setSessionCookie` for the acting user. For `removePassword`, keep the current session too. Keep the domain function pure (just delete); re-issue in the action layer.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/auth/password-management.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify + commit**

```bash
npm test && npm run typecheck
git add web/lib/auth/password-management.ts web/lib/auth/password-management.test.ts
git commit -m "fix(web): invalidate sessions on password change/removal (Plan 8 Task 3)"
```

---

## Task 4: `output: "standalone"` + production Dockerfile

**Files:**
- Modify: `web/next.config.ts`
- Create: `web/Dockerfile`, `web/.dockerignore`

- [ ] **Step 1: Enable standalone output**

```ts
// web/next.config.ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "standalone" };
export default nextConfig;
```

- [ ] **Step 2: Verify the build emits the standalone server**

Run: `npm run build`
Expected: build succeeds and `web/.next/standalone/server.js` exists.

- [ ] **Step 3: Write `.dockerignore`**

```
node_modules
.next
data
*.db
.env*
```

- [ ] **Step 4: Write the multi-stage Dockerfile**

```dockerfile
# web/Dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# better-sqlite3 + sharp ship prebuilt binaries; no build toolchain needed at runtime.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Drizzle migrations + scripts needed to init/import a fresh volume.
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /app/data/media
ENV DATABASE_FILE=/app/data/cookless.db
ENV MEDIA_ROOT=/app/data/media
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
```

> Note: `node_modules` (with `tsx`, drizzle-kit, better-sqlite3) is not copied into `runtime` because `standalone` traces only the prod deps the server needs. The `db:migrate`/`data:import` scripts use `tsx`, which is a devDependency — run them via the `build` stage image or a one-off `npm ci` sidecar during cutover (see runbook, Task 10), not from the slim runtime image.

- [ ] **Step 5: Build the image**

Run: `docker build -t cookless-web:cutover -f web/Dockerfile web`
Expected: image builds; `docker run --rm -e AUTH_SECRET=dev -e DATABASE_FILE=/tmp/x.db cookless-web:cutover node -e "console.log('ok')"` prints `ok`.

- [ ] **Step 6: Commit**

```bash
git add web/next.config.ts web/Dockerfile web/.dockerignore
git commit -m "build(web): standalone output + production Dockerfile (Plan 8 Task 4)"
```

---

## Task 5: Single-container docker-compose (dev + prod)

Replaces the old two-service Django compose files with one `web` service. Old files target `frontend/`+`backend/`+gunicorn.

**Files:**
- Replace: `docker-compose.yml` (repo root)
- Replace: `docker-compose.production.yml` (repo root)

- [ ] **Step 1: Write the prod compose**

```yaml
# docker-compose.production.yml
services:
  web:
    build:
      context: ./web
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      AUTH_SECRET: ${AUTH_SECRET:?set AUTH_SECRET}
      DATABASE_FILE: /app/data/cookless.db
      MEDIA_ROOT: /app/data/media
      WEBAUTHN_RP_ID: ${WEBAUTHN_RP_ID}
      WEBAUTHN_RP_NAME: ${WEBAUTHN_RP_NAME}
      WEBAUTHN_ORIGIN: ${WEBAUTHN_ORIGIN}
      NODE_ENV: production
    volumes:
      - app-data:/app/data
volumes:
  app-data:
```

- [ ] **Step 2: Write the dev compose**

```yaml
# docker-compose.yml
services:
  web:
    build:
      context: ./web
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      AUTH_SECRET: dev-only-not-secret
      DATABASE_FILE: /app/data/cookless.db
      MEDIA_ROOT: /app/data/media
      WEBAUTHN_RP_ID: localhost
      WEBAUTHN_RP_NAME: Cookless
      WEBAUTHN_ORIGIN: http://localhost:3000
    volumes:
      - app-data-dev:/app/data
volumes:
  app-data-dev:
```

- [ ] **Step 3: Validate compose config**

Run: `docker compose -f docker-compose.production.yml config` and `docker compose config`
Expected: both render without error (set a dummy `AUTH_SECRET` env for the prod one).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml docker-compose.production.yml
git commit -m "build: single-container docker-compose for Next.js app (Plan 8 Task 5)"
```

---

## Task 6: Seed script (fix broken `db:seed`)

`web/package.json` declares `db:seed` → `scripts/seed.ts`, which does not exist. A fresh (non-migrated) DB needs default tags/units/ingredients to be usable.

**Files:**
- Create: `web/scripts/seed.ts`
- Test: `web/scripts/seed.test.ts`

**Interfaces:**
- Consumes: `seedDefaultTags(db, householdId)` from `@/lib/recipes/tags` (already exists, used by `resetTags`); seeded units/ingredients source — reuse the data the old `tag_defaults.py`/seed used. If a units/ingredients seed list does not yet exist in `web/lib`, port it from the Django seed/fixtures into `web/lib/recipes/seed-data.ts` as part of this task.
- Produces: `seed(db): void` — idempotent (safe to re-run; uses upsert/`onConflictDoNothing`).

- [ ] **Step 1: Write the failing test**

```ts
// web/scripts/seed.test.ts
import { describe, it, expect } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { units, ingredients } from "@/lib/db/schema";
import { seed } from "./seed";

describe("seed", () => {
  it("inserts default units and ingredients and is idempotent", () => {
    const db = createTestDb();
    seed(db);
    const u1 = db.select().from(units).all().length;
    const i1 = db.select().from(ingredients).all().length;
    expect(u1).toBeGreaterThan(0);
    expect(i1).toBeGreaterThan(0);
    seed(db); // second run must not duplicate
    expect(db.select().from(units).all().length).toBe(u1);
    expect(db.select().from(ingredients).all().length).toBe(i1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/seed.test.ts`
Expected: FAIL — `./seed` not found.

- [ ] **Step 3: Implement `seed.ts`**

Export a pure `seed(db)` that inserts the canonical units + ingredients (from `seed-data.ts`) with `onConflictDoNothing`, then a runner guarded by `if (process.env.VITEST !== "true")` that opens `DATABASE_FILE` and calls `seed`. Default tags are per-household (seeded on household creation), so `seed.ts` covers only the global units + ingredients catalog. Confirm the exact default lists match the old app by cross-checking the Django seed source.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify + commit**

```bash
npm test && npm run typecheck
git add web/scripts/seed.ts web/scripts/seed.test.ts web/lib/recipes/seed-data.ts
git commit -m "feat(web): seed script for default units/ingredients (Plan 8 Task 6)"
```

---

## Task 7: PWA — installable manifest + icons (offline deferred)

Implements decision #3 (installable only). No service worker, no offline queue.

**Files:**
- Create: `web/public/manifest.webmanifest`, `web/public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `web/public/apple-touch-icon.png`
- Modify: `web/app/layout.tsx`

- [ ] **Step 1: Add icons**

Generate PNG icons from the existing brand mark (old assets in `frontend/public/pwa-192x192.png` / `pwa-512x512.png` can be reused directly). Place 192, 512, maskable-512, and a 180×180 `apple-touch-icon.png`.

- [ ] **Step 2: Write the manifest**

```json
{
  "name": "Cookless",
  "short_name": "Cookless",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#f97316",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

(`theme_color` `#f97316` matches the old manifest.)

- [ ] **Step 3: Reference manifest + theme in the root layout**

In `web/app/layout.tsx`, add Next metadata exports:

```ts
import type { Metadata, Viewport } from "next";
export const metadata: Metadata = {
  title: "Cookless",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Cookless" },
  icons: { apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#f97316" };
```

- [ ] **Step 4: Verify**

Run: `npm run build`, then `npm start` and load `http://localhost:3000`. In Chrome DevTools → Application → Manifest, confirm no errors and the install icon appears.
Expected: manifest parses; app is installable.

- [ ] **Step 5: Commit**

```bash
git add web/public/manifest.webmanifest web/public/icons web/public/apple-touch-icon.png web/app/layout.tsx
git commit -m "feat(web): installable PWA manifest + icons (Plan 8 Task 7)"
```

---

## Task 8: Migration verification script

A repeatable spot-check beyond `migrate-data.ts`'s built-in row-count + FK check: confirms password reset applied, decimals are well-formed, and image paths are relative (audit flagged the `/media/` → `/api/images/` scheme change).

**Files:**
- Create: `web/scripts/verify-migration.ts`

- [ ] **Step 1: Implement the verifier**

A `tsx` script that opens `DATABASE_FILE` and asserts, printing a PASS/FAIL line each:
1. `SELECT count(*) FROM users WHERE password != ''` is `0` (force-reset applied).
2. `PRAGMA foreign_key_check` returns no rows.
3. No `recipes.image` value starts with `/media/` or `http` (must be relative, e.g. `recipes/<id>.webp`) — these are served by `/api/images/[...path]`.
4. Every `recipe_ingredients.quantity` / `shopping_list_items.quantity` / `meal_plans.known_ratio` parses as a finite number.
5. Per-table row counts printed for eyeball comparison against the Django DB.

Exit non-zero if any assertion fails.

- [ ] **Step 2: Run against a migrated test DB**

```bash
# build a migrated DB from a copy of the old db, then verify
SOURCE_DB=../backend/db.sqlite3 DATABASE_FILE=/tmp/cutover-test.db npm run db:migrate   # apply schema
SOURCE_DB=../backend/db.sqlite3 DATABASE_FILE=/tmp/cutover-test.db npm run data:import
DATABASE_FILE=/tmp/cutover-test.db npx tsx scripts/verify-migration.ts
```

Expected: all checks PASS (image-path check may surface real `/media/`-prefixed rows — if so, fix by stripping the prefix in `migrate-data.ts`'s transform for the `image` column and re-run).

- [ ] **Step 3: Commit**

```bash
git add web/scripts/verify-migration.ts
git commit -m "feat(web): post-migration verification script (Plan 8 Task 8)"
```

---

## Task 9: Email-free admin password reset

Implements the password-only-user reset path for decision #2 (no SMTP is configured in the new app). Replaces the old `SUPERUSER_EMAIL`/`SUPERUSER_PASSWORD` bootstrap.

**Files:**
- Create: `web/scripts/set-password.ts`

- [ ] **Step 1: Implement**

A `tsx` script: `npx tsx scripts/set-password.ts <email> <newPassword>` that opens `DATABASE_FILE`, looks up the user by email (error if absent), runs `validatePassword(newPassword, { email })`, sets `password = await hashPassword(newPassword)`, and prints confirmation. Reuse `@/lib/auth/password`.

- [ ] **Step 2: Verify against a test DB**

```bash
DATABASE_FILE=/tmp/cutover-test.db npx tsx scripts/set-password.ts known@user.test "Br4nd!newpass"
# then confirm login works via a quick node check or the login page against that DB
```

Expected: row updated; `verifyPassword` returns true for the new password.

- [ ] **Step 3: Commit**

```bash
git add web/scripts/set-password.ts
git commit -m "feat(web): admin set-password script (email-free reset) (Plan 8 Task 9)"
```

---

## Task 10: Production cutover runbook + dry run

Codifies the one-shot cutover so it is repeatable and reversible.

**Files:**
- Create: `docs/runbooks/cutover.md`

- [ ] **Step 1: Write the runbook**

Document, in order:
1. **Announce** maintenance window; the cutover is offline (no dual-write).
2. **Backup**: copy prod `backend/db.sqlite3` and `backend/media/` to a safe location.
3. **Stop** the old Django stack (`docker compose -f docker-compose.production.yml down` on the *old* commit, or stop the old service).
4. **Provision the volume**: on the new commit, create the `app-data` volume; copy migrated `cookless.db` + media into it. Migration runs in a one-off container that has dev deps (use the `build` stage: `docker build --target build -t cookless-web:build web`, then `docker run --rm -v app-data:/app/data -e SOURCE_DB=/src/db.sqlite3 -e DATABASE_FILE=/app/data/cookless.db -v /backup:/src cookless-web:build sh -c "npm run db:migrate && npm run data:import && npx tsx scripts/verify-migration.ts"`).
5. **Copy images**: `backend/media/recipes/*` → volume `media/recipes/` (verify Task 8 check #3 passed; if any `/media/` prefixes existed they were stripped).
6. **Start** the new stack: `docker compose -f docker-compose.production.yml up -d --build`.
7. **Smoke test** (Step 2 list below).
8. **Reset password-only users**: for each user without a passkey who needs access, run `scripts/set-password.ts` (Task 9). Identify them: `SELECT u.email FROM users u WHERE NOT EXISTS (SELECT 1 FROM passkey_credentials p WHERE p.user_id = u.id)`.
9. **Rollback**: if smoke tests fail, `down` the new stack, restart the old stack against the untouched backup. (The old DB was never mutated.)

- [ ] **Step 2: Define the smoke-test checklist**

In the runbook, list the manual post-cutover checks (these exercise the migrated data end to end):
- Log in with an existing passkey.
- Reset one password user via Task 9 and log in with the new password.
- Recipes list loads; open a recipe; image renders via `/api/images/...`.
- Plan page shows the migrated active iteration.
- Shopping list loads and an item toggles (online).
- AI settings page loads (key shows as "set" if it was configured).

- [ ] **Step 3: Execute a full dry run against a prod copy**

Run the entire runbook against a *copy* of the prod DB on a staging host. Record row-count parity (old Django table counts vs `verify-migration.ts` output) in the runbook.
Expected: every smoke-test item passes on staging.

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/cutover.md
git commit -m "docs: production cutover runbook (Plan 8 Task 10)"
```

---

## Task 11: Release notes for breaking changes

**Files:**
- Create: `docs/RELEASE-NOTES-nextjs-cutover.md`

- [ ] **Step 1: Write the notes**

User-facing breaking changes from the migration:
- **Password reset required.** For security, all passwords were reset during the platform upgrade. Log in with your passkey, or contact an admin to set a new password. (No self-service email reset — SMTP is not configured.)
- **Personal Access Tokens removed.** Programmatic/API-token access is no longer available (the API is session-cookie only).
- **Offline shopping toggles temporarily unavailable.** The app is installable, but checking items off without a connection is deferred (tracked in Plan 8f).
- **Known parity gaps** (link to §B roadmap): household management UI, machine/program step display + screen-wake in cook mode, multi-list shopping access, full-collection recipe sort/pagination.

- [ ] **Step 2: Commit**

```bash
git add docs/RELEASE-NOTES-nextjs-cutover.md
git commit -m "docs: cutover release notes (Plan 8 Task 11)"
```

---

## SECTION B — Parity-gap roadmap (follow-on plans)

These are **not** cutover-blockers (the app ships and runs without them) but are real regressions from the audit. Per decision #1 each becomes its own focused plan in `docs/superpowers/plans/`, written with the writing-plans skill and executed independently. Listed in recommended priority order. Ship Section A first; sequence B by user impact.

### Plan 8a — Household management UI *(highest impact)*
Audit M1/M2. All server actions exist and are tested (`web/app/(account)/actions.ts`) but **no UI imports them** (verified: 0 importers for the 9 household actions). Build a `/settings/household` (or `/household`) surface wiring: rename, delete, leave, **switch**, member list + removal, transfer ownership, and **invite create/share**. Also add a logged-in **accept-invite path** so existing users can join a second household (M2). Add nav entry (`web/components/nav/app-nav.tsx` currently links only `/settings`). Fix the delete/leave behavior to reassign active household to the user's next membership instead of nulling it (audit M-household behavioral diffs), and make `transferOwnership` atomic with a self-target guard.

### Plan 8b — Cooking-mode parity
Audit M3/M4/M5. Restore in `web/components/cooking/cooking-view.tsx`: screen **wake-lock** (port `useWakeLock`), **machine/program step parameters** display (temperature/duration/speed/direction/weight/turbo — port `ProgramStepDisplay`), and **swipe + jump-to-step** navigation. High impact for machine/Thermomix recipes (currently unusable in cook mode).

### Plan 8c — Shopping multi-list access + correctness
Audit M7/A3/A4. Add a list switcher (or `/shopping/[id]` route) so all segments of a multi-shopping-day plan are reachable (currently only the latest list shows). Fix generation to scale by **per-entry servings** (currently uses one plan-level value, `generate.ts:61`) and decide on empty-segment list creation (A4). Display the segment `shoppingDate`.

### Plan 8d — Recipe list full-collection sort & pagination
Audit M6/A6/A7. Make sort operate over the whole collection (currently the DB always orders by `title` and `sortItems` only reorders the visible 20). Make "load more" accumulate instead of navigate-and-replace, or switch to proper server-side ordered pagination keyed on the selected sort. Order ingredient autocomplete by name (A6), and pass the locale to `localeCompare` (A7).

### Plan 8e — Planner algorithm fidelity
Audit A1/A2. Fix gap-fill to pull *other* household recipes for variety (the `setup.ts:130` "Django parity" comment is wrong — it currently repeats the selected set). Reconcile renew exclusion semantics with the old date-previous-iteration behavior, and port the missing `test_avoids_previous_iteration_recipes` coverage. Also surface an **edit-config** trigger on the populated plan page (audit M13 — `GeneratePlanDrawer` is only mounted in the empty state).

### Plan 8f — Offline PWA (deferred from Task 7)
Audit C2. Re-implement the offline shopping-toggle queue (old: Workbox SW + IndexedDB queue + `useOnlineSync` replay) for the Next.js app, plus runtime caching of read pages for offline viewing. Largest single deferred feature; schedule after the higher-impact UI gaps.

### Smaller follow-ups (fold into the nearest plan above)
- Gemini key verification on save (M9) → 8a (AI settings lives near household).
- Password change/remove UI in settings (M8) → 8a.
- Passkey management UI reachability (M10) → 8a.
- Ingredient auto-create dedup (A5) → 8d.
- `/welcome` post-onboarding page (M11) → 8a or drop.
- Self-referential FK constraints for `units.base_unit_id` / `meal_plan_entries.source_entry_id` (A9) → schema hardening, fold into 8c/8e.

---

## Self-Review

**Spec coverage (against the audit's cutover-blocking set):**
- Password migration (C3/C4) → Task 1 ✓ · CSRF (C5) → Task 2 ✓ · session invalidation (C6) → Task 3 ✓ · Dockerfile (C1) → Task 4 ✓ · compose (C1) → Task 5 ✓ · broken seed → Task 6 ✓ · PWA installable (decision 3) → Task 7 ✓ · migration verify → Task 8 ✓ · email-free reset (decision 2) → Task 9 ✓ · cutover process + data migration + verify (original Plan 8 goal) → Task 10 ✓ · PATs dropped note (decision 4) → Task 11 ✓.
- All non-blocking parity gaps from the audit are assigned to §B plans (8a–8f) — none dropped silently.

**Placeholder scan:** No "TBD/handle edge cases" left. Two tasks intentionally reference porting existing data (seed lists in Task 6, icons in Task 7) from named old-app sources rather than inlining large blobs — paths are given.

**Type consistency:** `transformValue` (Task 1), `assertSameOrigin` (Task 2), `deleteUserSessions` (Task 3, pre-existing), `seed` (Task 6), `UNUSABLE_PASSWORD` (Tasks 1/9) referenced consistently.

**Open risk to confirm during execution:** "Force password reset" + no SMTP means a password-only user with no passkey depends entirely on an admin running Task 9. The runbook (Task 10 Step 8) identifies these users explicitly. If that operational burden is unacceptable, revisit decision #2 (rehash-on-login) before executing Task 1.
