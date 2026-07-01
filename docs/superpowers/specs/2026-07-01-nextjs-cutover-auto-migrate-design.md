# Design — One-Command Prod Cutover with Auto-Migration

**Date:** 2026-07-01
**Branch:** `design/nextjs-migration`
**Supersedes:** the manual multi-step procedure in `docs/runbooks/cutover.md` (kept as fallback/reference)

## Goal

Collapse the Django → Next.js production cutover to: **publish the new image, apply one compose edit, let GitOps redeploy.** The container migrates itself on startup. Every release after cutover is just a new image push — no manual migration steps, ever.

## Production reality (what the design must fit)

Prod (`cookless.fa-krug.de`) runs a **prebuilt image** `sascha384/cookless:latest`, pulled and redeployed via GitOps (compose `network: gitops_default external: true`), behind Traefik. There is **no build step on the host.** Therefore the migration capability must be **baked into the published image and run at container startup** — an init-container / build-stage approach is not available.

Old data lives inside the **`cookless_data` Docker volume** (`DATA_DIR=/app/data`):

- Django SQLite DB → `/app/data/db.sqlite3` (`settings.py:166`)
- Django media → `/app/data/media` (`settings.py:202`)

The new app uses `DATABASE_FILE=/app/data/cookless.db` and `MEDIA_ROOT=/app/data/media`.

**Key consequence:** if the new container keeps the **same `cookless_data` volume** mounted at `/app/data`:

- The old Django DB is present at `/app/data/db.sqlite3` for auto-import.
- The new DB (`cookless.db`) is a **separate file** — the old DB is never touched, so it remains a clean rollback artefact.
- `MEDIA_ROOT` resolves to the **same directory** the old media already occupies → **images need zero copying.** The data-import script stores relative image paths (`recipes/x.webp`) and `/api/images/[...path]` serves them from `MEDIA_ROOT`, matching Django's on-disk layout.

## Decisions (locked)

- **Import automation:** fully automatic on first boot (guarded), reusing the same volume.
- **Failure mode:** on any migration/import/verify failure the entrypoint **exits non-zero → container refuses to start.** Traefik keeps the previous container until the new one is healthy. No half-migrated DB is ever served.
- **Verify gate:** `verify-migration.ts` runs immediately after the one-time import; a row-count/integrity mismatch blocks startup.
- **Sessions:** invalidation is acceptable (user confirmed). New `AUTH_SECRET`; everyone re-logs in. No session continuity to preserve.

## Architecture

### 1. Self-contained auto-migrating image

The runtime image gains a startup **entrypoint** (`web/docker-entrypoint.sh`, set as the image `ENTRYPOINT`, with `CMD ["node","server.js"]` preserved as the final exec). Startup sequence:

1. **Schema migrations (always).** Apply Drizzle migrations to `/app/data/cookless.db`. Idempotent — this is the every-release auto-migrate. Failure → exit non-zero.
2. **One-time data import (guarded).** If `users` row-count `== 0` **and** `/app/data/db.sqlite3` exists → run the Django data import (`SOURCE_DB=/app/data/db.sqlite3`, `DATABASE_FILE=/app/data/cookless.db`), then run `verify-migration.ts`. Any failure → exit non-zero. Media requires no action (co-located in the same volume).
3. **Serve.** `exec node server.js`.

The guard (`users == 0`) makes the import fire exactly once and silently no-op on every subsequent deploy. It also correctly handles a genuinely fresh install with no old DB present (skips import; the existing `/setup` first-run flow takes over).

**Runtime image self-sufficiency.** Because there is no host build step, the runtime stage must carry what the scripts need at startup:

- the migration scripts (`web/scripts/*.ts`) and the `lib/` sources they import,
- `drizzle/` migrations (already copied today),
- `tsx` to execute the TypeScript scripts,
- `tsconfig.json` so `tsx` resolves the `@/*` path alias.

The app's traced `node_modules` (standalone) already provides `drizzle-orm`, `better-sqlite3`, and `argon2` that the scripts use. Implementation decides the exact minimal-footprint mechanism (bundle `tsx` + sources, or precompile the two scripts) during planning; the design requirement is only that **the published image can run schema-migrate + data-import + verify unaided.**

### 2. Health route

The old healthcheck hits Django's `/api/v1/health/`, which the new app does not serve. Add a trivial `web/app/api/health/route.ts` returning `200 {status:"ok"}`. The compose healthcheck targets `http://localhost:8000/api/health`.

### 3. Port

The new app listens on `PORT=8000` (Next standalone honours `PORT`) so the existing Traefik label (`server.port=8000`) and `expose: 8000` are unchanged. `PORT=8000` is set as an image default and/or in compose.

## The one-time compose edit

```yaml
services:
  web:
    image: sascha384/cookless:latest
    container_name: cookless
    restart: always
    expose:
      - "8000"
    environment:
      - AUTH_SECRET=${AUTH_SECRET:?set AUTH_SECRET}   # replaces SECRET_KEY
      - WEBAUTHN_RP_ID=cookless.fa-krug.de            # unchanged
      - WEBAUTHN_RP_NAME=Cookless
      - WEBAUTHN_ORIGIN=https://cookless.fa-krug.de
      - PORT=8000
      # DATABASE_FILE=/app/data/cookless.db and MEDIA_ROOT=/app/data/media are image defaults → omit
      # dropped Django-only vars: DEBUG, SECRET_KEY, ALLOWED_HOSTS, DATABASE_ENGINE, BASE_URL,
      #   SUPERUSER_*, EMAIL_*, DEFAULT_FROM_EMAIL, SERVER_EMAIL, ADMIN_EMAIL, DATA_DIR
    volumes:
      - cookless_data:/app/data            # SAME volume → old DB auto-imported, media co-located
      # cookless_static removed — Next serves its own static assets
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - default
    labels:                                # unchanged — still routes to port 8000
      - "traefik.enable=true"
      - "traefik.http.routers.cookless.rule=Host(`cookless.fa-krug.de`)"
      - "traefik.http.routers.cookless.entrypoints=web"
      - "traefik.http.services.cookless.loadbalancer.server.port=8000"
volumes:
  cookless_data:
networks:
  default:
    name: gitops_default
    external: true
```

Requires `curl` in the runtime image for the healthcheck (add if absent).

## Cutover procedure (what the user actually does)

1. **(Optional but wise) Back up the volume** — e.g. `docker run --rm -v cookless_data:/d -v $PWD:/b busybox cp /d/db.sqlite3 /b/`. The old DB is never mutated, so this is belt-and-suspenders.
2. **Publish the new image** via the normal CI release flow (`sascha384/cookless:latest`).
3. **Apply the compose edit above** (set `AUTH_SECRET`).
4. **Let GitOps redeploy** (or `docker compose up -d`). The container: schema-migrate → detect old DB + empty users → import → verify → serve. If anything fails it exits non-zero and Traefik keeps the old container.
5. **Log in with a passkey.** Reset any password-only-no-passkey users once via `set-password.ts` (likely none in practice).

**Every release after this:** push a new image. The entrypoint applies schema migrations (import already no-ops) and boots. Nothing else.

## Rollback

Revert the compose `image`/env to the old Django values and redeploy. The old `/app/data/db.sqlite3` is intact (never written by the new app); `cookless.db` simply sits unused in the volume. Delete `cookless.db` from the volume to re-arm a fresh auto-import on the next attempt.

## Residual manual step (unavoidable)

Password-only users (no passkey) have an unusable password after import (security property of the Django hash → argon2 boundary). They need `set-password.ts` run once each, delivered out-of-band. The new app has no SMTP/password-reset-email flow.

## Out of scope

- No dual-write / zero-downtime migration (brief window is acceptable).
- No change to the migration scripts' logic (already dry-run-proven end-to-end).
- No preservation of Django sessions or static-files volume.

## Testing

- Entrypoint logic (guard: fresh vs already-migrated vs no-old-DB; non-zero exit on failure) — shell-level, verified against a scratch volume.
- Health route — unit/route test + `next build`.
- Full Docker dry run against a **copy of the real `cookless_data` volume**: fresh boot imports + verifies + serves; second boot no-ops the import; images render via `/api/images`.
- Existing `verify-migration.ts` remains the row-count/integrity oracle.
