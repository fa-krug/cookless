# Production Cutover Runbook — Django → Next.js

**Branch:** `design/nextjs-migration`  
**Cutover type:** offline (brief maintenance window; no dual-write)  
**Reversible:** yes — the old Django DB is never mutated

---

## Prerequisites

- Deploy host has Docker and Docker Compose available.
- `.env` file (or shell environment) contains:
  - `AUTH_SECRET` — required; generate with `openssl rand -base64 32`
  - `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN`
- Git worktree is on the migration branch (`design/nextjs-migration`) with all Plan 8 commits present.
- A backup location (e.g. `/backup`) is available on the deploy host.

---

## Dry Run

The migration pipeline has been validated **end-to-end at the script level** (Task 8):

- Ran from `web/` against a copy of `backend/db.sqlite3`.
- Command sequence: `SOURCE_DB=<old db.sqlite3> DATABASE_FILE=<dest> npm run db:migrate && npm run data:import && npx tsx scripts/verify-migration.ts`
- Result: **121 recipes, 898 recipe_ingredients migrated; all `verify-migration.ts` checks PASS; no `/media/` prefixes present in image paths.**

**Remaining pre-cutover gate:** a full Docker-based dry run on a staging host (steps 4–7 below executed against a prod-copy backup). Capture the `verify-migration.ts` output (table row counts) and confirm parity with the Django source before executing against production.

---

## Step 1 — Announce Maintenance Window

Notify all users of a brief offline window. The cutover replaces the Django service; the app will be unavailable until step 6 completes.

---

## Step 2 — Backup

On the **current production host** (old Django stack), copy the database and media files to a safe location before making any changes:

```bash
# On the deploy host (adjust paths to your prod layout)
mkdir -p /backup/prod-$(date +%Y%m%d)
cp backend/db.sqlite3  /backup/prod-$(date +%Y%m%d)/db.sqlite3
cp -r backend/media/   /backup/prod-$(date +%Y%m%d)/media/
```

Verify the copies are complete before proceeding. **These files are your rollback artefacts; do not modify them.**

---

## Step 3 — Stop the Old Django Stack

```bash
docker compose -f docker-compose.production.yml down
```

> If the old stack uses a different compose file or a bare process, stop it by its appropriate method. Confirm no process is listening on the old port before continuing.

---

## Step 4 — Provision the Volume and Run Migration

`tsx` (used by the migration scripts) is a **dev dependency** that is NOT included in the slim runtime image. Migration must therefore run inside the `build` stage image which retains the full `node_modules`.

### 4a. Build the `build`-stage image

```bash
docker build --target build -t cookless-web:build ./web
```

### 4b. Run migrate + import + verify in a one-off container

Mount the backup directory as `/src` (read-only) and the named volume as `/app/data`:

```bash
docker run --rm \
  -v app-data:/app/data \
  -v /backup/prod-$(date +%Y%m%d):/src:ro \
  -e SOURCE_DB=/src/db.sqlite3 \
  -e DATABASE_FILE=/app/data/cookless.db \
  cookless-web:build \
  sh -c "npm run db:migrate && npm run data:import && npx tsx scripts/verify-migration.ts"
```

**Do not proceed if `verify-migration.ts` reports any failures.** Record the row-count output for the dry-run record.

> `npm run db:migrate` → `scripts/db-migrate.ts`  
> `npm run data:import` → `scripts/migrate-data.ts`

---

## Step 5 — Copy Images into the Volume

Recipe image files live in `backend/media/recipes/` on the old host. Copy them into the `app-data` volume at `media/recipes/`. The simplest way is a second one-off container:

```bash
docker run --rm \
  -v app-data:/app/data \
  -v /backup/prod-$(date +%Y%m%d)/media/recipes:/src:ro \
  busybox \
  sh -c "mkdir -p /app/data/media/recipes && cp -r /src/. /app/data/media/recipes/"
```

**Verify:** `recipes.image` stores relative paths (confirmed by Task 8 check #3 — no `/media/` prefixes). The new `/api/images/[...path]` route serves files directly from `MEDIA_ROOT=/app/data/media`.

---

## Step 6 — Start the New Stack

```bash
docker compose -f docker-compose.production.yml up -d --build
```

The `docker-compose.production.yml` at repo root defines a single `web` service:
- Image built from `./web/Dockerfile`
- Volume: `app-data:/app/data`
- `DATABASE_FILE=/app/data/cookless.db`, `MEDIA_ROOT=/app/data/media`
- Exposes port `3000`
- `CMD ["node", "server.js"]` (Next.js standalone output at `.next/standalone/server.js`)

Wait for the container to reach healthy/running state:

```bash
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs -f web
```

---

## Step 7 — Smoke Tests

Run each check manually after the stack is up. All must pass before the cutover is declared successful.

| # | Check | Expected |
|---|-------|----------|
| 1 | Log in with an existing passkey | Session established; dashboard visible |
| 2 | Reset one password-only user (see Step 8) then log in with new password | Login succeeds |
| 3 | Navigate to Recipes list | All recipes present |
| 4 | Open a recipe that has an image | Image renders via `/api/images/recipes/<filename>` |
| 5 | Navigate to Plan page | Migrated active iteration visible with correct meals |
| 6 | Navigate to Shopping list | Items load; toggle one item (online) — state persists on refresh |
| 7 | Navigate to AI Settings | Page loads; key shows "set" if it was configured |

---

## Step 8 — Reset Password-Only Users

The migration sets **all** user passwords to an unusable hash (Django convention for passkey-only accounts). Passkey users log in normally. Users who relied on a password and have no registered passkey have no usable credential after cutover.

**Identify password-only users** (run against the migrated DB):

```bash
docker run --rm \
  -v app-data:/app/data \
  -e DATABASE_FILE=/app/data/cookless.db \
  cookless-web:build \
  npx tsx scripts/verify-migration.ts
# Or query directly with sqlite3:
sqlite3 /path/to/cookless.db \
  "SELECT email FROM users u WHERE NOT EXISTS (SELECT 1 FROM passkey_credentials p WHERE p.user_id = u.id);"
```

**Reset each user's password** (coordinate new password out-of-band, e.g. by email or phone):

```bash
docker run --rm \
  -v app-data:/app/data \
  -e DATABASE_FILE=/app/data/cookless.db \
  cookless-web:build \
  npx tsx scripts/set-password.ts <email> <newPassword>
```

> Note: if no SMTP is configured, password reset emails are unavailable. The admin must set passwords manually via the command above and deliver them securely.

---

## Step 9 — Rollback (if needed)

If any smoke test fails:

1. Stop the new stack:
   ```bash
   docker compose -f docker-compose.production.yml down
   ```

2. Check out the old commit (the last commit on the Django stack):
   ```bash
   git checkout <old-commit-sha>
   ```

3. Restart the old Django stack:
   ```bash
   docker compose -f docker-compose.production.yml up -d
   # (or whatever command started the old stack)
   ```

4. Restore the database if it was overwritten (it should not have been — the old `backend/db.sqlite3` was never mounted into the new migration):
   ```bash
   cp /backup/prod-<date>/db.sqlite3 backend/db.sqlite3
   ```

The `app-data` Docker volume can be deleted and recreated on the next cutover attempt:
```bash
docker volume rm app-data
```

---

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | Yes | Random secret for NextAuth session signing (`openssl rand -base64 32`) |
| `DATABASE_FILE` | Yes (set in compose) | Absolute path to SQLite file inside container: `/app/data/cookless.db` |
| `MEDIA_ROOT` | Yes (set in compose) | Absolute path to media dir inside container: `/app/data/media` |
| `WEBAUTHN_RP_ID` | Yes | Relying Party ID, e.g. `cookless.example.com` |
| `WEBAUTHN_RP_NAME` | Yes | Human-readable RP name, e.g. `Cookless` |
| `WEBAUTHN_ORIGIN` | Yes | Full origin, e.g. `https://cookless.example.com` |
| `NODE_ENV` | Set in compose | `production` |

---

## Script Reference

All scripts live under `web/scripts/`:

| Script file | npm alias | Purpose |
|-------------|-----------|---------|
| `db-migrate.ts` | `npm run db:migrate` | Apply Drizzle schema migrations to destination DB |
| `migrate-data.ts` | `npm run data:import` | Import all data from Django SQLite into new schema |
| `verify-migration.ts` | _(direct)_ `npx tsx scripts/verify-migration.ts` | Assert row-count parity and data integrity |
| `set-password.ts` | _(direct)_ `npx tsx scripts/set-password.ts <email> <pw>` | Set a bcrypt password for a user without a passkey |
