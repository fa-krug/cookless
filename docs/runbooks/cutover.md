# Production Cutover Runbook — Django → Next.js

**Branch:** `design/nextjs-migration`
**Cutover type:** one-command, self-migrating (brief availability gap while the container restarts; no dual-write)
**Reversible:** yes — the old Django DB (`/app/data/db.sqlite3`) is never mutated

---

## How it works

The published `sascha384/cookless` image migrates itself on startup via `web/docker-entrypoint.sh`:

1. **Schema migrations (always).** Drizzle migrations are applied to `DATABASE_FILE` (default `/app/data/cookless.db`) on every boot. Idempotent — this is also how future releases pick up new migrations.
2. **One-time data import (guarded).** If the `users` table has `0` rows **and** `/app/data/db.sqlite3` (the old Django DB) exists in the mounted volume, the entrypoint imports it (`migrate-data.ts`) and immediately runs `verify-migration.ts`. Row-count/integrity mismatches, or any failure in either step, exit the container non-zero. On subsequent boots the guard is already false (`users > 0`), so import is skipped — it no-ops silently and only the schema-migrate step runs.
3. **Serve.** Only after 1–2 succeed does the entrypoint `exec node server.js`.

Because the old Django DB and media both live in the same `cookless_data` volume that the new container mounts at `/app/data`, no file copying is needed: the new app's `MEDIA_ROOT=/app/data/media` already points at the existing media, and the new DB (`cookless.db`) is a separate file from the untouched Django DB (`db.sqlite3`).

**Failure mode:** any migration/import/verify error → the container exits non-zero and refuses to start. Traefik/GitOps keeps the previous container running until a healthy one replaces it. No half-migrated database is ever served.

---

## Prerequisites

- `AUTH_SECRET` is set in the shell/GitOps env (generate with `openssl rand -base64 32`).
- The new `sascha384/cookless:latest` image has been published.
- The compose file points `volumes: - cookless_data:/app/data` at the **same** volume the old Django stack used (so the old DB is present for auto-import).

---

## Cutover

1. **(Optional, belt-and-suspenders) Back up the volume.** The old DB is never mutated by the new app, but a backup costs little:
   ```bash
   docker run --rm -v cookless_data:/d -v "$PWD":/b busybox cp /d/db.sqlite3 /b/db.sqlite3.bak
   ```
2. **Publish the new image** via the normal CI/release flow (`sascha384/cookless:latest`).
3. **Apply the compose file** — replace `docker-compose.production.yml` with the version at the repo root (see below); ensure `AUTH_SECRET` is set.
4. **Deploy:**
   ```bash
   docker compose -f docker-compose.production.yml up -d
   ```
   (or let GitOps redeploy on the new image/compose). The container self-migrates: schema-migrate → detect old DB + empty `users` → import → verify → serve.
5. **Log in with a passkey.** Passkey auth is unaffected by the migration. Reset any password-only users (see below).

### `docker-compose.production.yml`

```yaml
# docker-compose.production.yml — Next.js single-container app, self-migrating on startup.
services:
  web:
    image: sascha384/cookless:latest
    container_name: cookless
    restart: always
    expose:
      - "8000"
    environment:
      - AUTH_SECRET=${AUTH_SECRET:?set AUTH_SECRET}
      - WEBAUTHN_RP_ID=cookless.fa-krug.de
      - WEBAUTHN_RP_NAME=Cookless
      - WEBAUTHN_ORIGIN=https://cookless.fa-krug.de
      - PORT=8000
      # DATABASE_FILE=/app/data/cookless.db and MEDIA_ROOT=/app/data/media are image defaults.
    volumes:
      - cookless_data:/app/data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:8000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - default
    labels:
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

**Every release after this cutover** is just a new image push — the entrypoint reapplies schema migrations (import stays a no-op) and boots. No manual steps.

---

## Reset password-only users

The migration sets **all** user passwords to an unusable hash (Django convention for passkey-only accounts). Passkey users log in normally; users who relied on a password and have no registered passkey have no usable credential after cutover.

**Identify password-only users** — query the migrated DB directly:

```bash
sqlite3 /path/to/cookless.db \
  "SELECT email FROM users u WHERE NOT EXISTS (SELECT 1 FROM passkey_credentials p WHERE p.user_id = u.id);"
```

**Reset each user's password** (coordinate the new password out-of-band, e.g. by email or phone). Run inside a container built from the image (it carries the full toolchain):

```bash
docker run --rm \
  -v cookless_data:/app/data \
  -e DATABASE_FILE=/app/data/cookless.db \
  sascha384/cookless:latest \
  ./node_modules/.bin/tsx scripts/set-password.ts <email> <newPassword>
```

> Note: no SMTP is configured in this deployment, so there is no self-service "forgot my password" flow. The admin must set passwords manually via the command above and deliver them securely.

---

## Rollback

If the new container fails its healthcheck or a smoke test fails:

1. Revert the compose file's `image` and environment variables to the old Django values and redeploy (or let GitOps roll back to the previous known-good revision).
2. `/app/data/db.sqlite3` (the Django DB) was never written by the new app — it is intact and the old stack resumes from where it left off.
3. To re-arm a fresh auto-import on the next cutover attempt, delete the new DB from the volume so the `users == 0` guard fires again:
   ```bash
   docker run --rm -v cookless_data:/app/data busybox rm -f /app/data/cookless.db
   ```

---

## Dry-run record

The migration pipeline has been validated **at the script level** against a real production DB copy:

- Ran from `web/` against a copy of `backend/db.sqlite3`.
- Command sequence: `SOURCE_DB=<old db.sqlite3> DATABASE_FILE=<dest> npm run db:migrate && npm run data:import && npx tsx scripts/verify-migration.ts`
- Result: **121 recipes, 898 recipe_ingredients migrated; all `verify-migration.ts` checks PASS; no `/media/` prefixes present in image paths.**

**Remaining pre-cutover gate:** a full Docker-level dry run of the self-migrating image against a copy of the real `cookless_data` volume (fresh-boot import+verify+serve, then a second boot confirming the no-op guard) has not yet been executed in this environment — no Docker daemon is available here. Before cutover, run it on a host with Docker and paste the two result lines here:

```
[fresh boot]  <paste the verify-migration.ts PASS/row-count line>
[second boot] [entrypoint] no import needed (users=<N>, old DB present: yes)
```
