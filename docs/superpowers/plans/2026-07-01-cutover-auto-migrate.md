# One-Command Prod Cutover with Startup Auto-Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the published `sascha384/cookless` image migrate itself on startup so the Django→Next.js prod cutover is one image push + one compose edit, and every future release is just an image push.

**Architecture:** The runtime image gains a startup entrypoint that (1) always applies Drizzle schema migrations, (2) on a fresh DB with the old Django `db.sqlite3` present in the shared `cookless_data` volume, runs the one-time data import + verify, then (3) execs the Next.js server. Because prod pulls a prebuilt image via GitOps (no host build step), the migration toolchain (`tsx`, full `node_modules`, TS sources, `drizzle/`) is baked into the image. The old DB and media stay in the same volume, so images need no copying and the old DB is an untouched rollback artefact.

**Tech Stack:** Next.js standalone output · better-sqlite3 · Drizzle ORM + migrator · tsx · Docker + docker-compose · Traefik.

## Global Constraints

- Old Django data lives in the `cookless_data` volume: DB at `/app/data/db.sqlite3`, media at `/app/data/media` (verbatim from `backend/cookless/settings.py:166,202`).
- New app: `DATABASE_FILE=/app/data/cookless.db`, `MEDIA_ROOT=/app/data/media` (image defaults). New DB is a **separate file** — never overwrite `/app/data/db.sqlite3`.
- App must listen on `PORT=8000` (Traefik label `server.port=8000` is unchanged).
- On **any** migration/import/verify failure the container must **exit non-zero** (refuse to start). Serve only after all steps succeed.
- Data-import guard: run the one-time import **iff** `users` row-count `== 0` **and** `/app/data/db.sqlite3` exists.
- Do not modify the migration scripts' logic (`db-migrate.ts`, `migrate-data.ts`, `verify-migration.ts`) — they are dry-run-proven. This plan only orchestrates and packages them.
- `next.config.ts` already sets `output: "standalone"`.

---

### Task 1: Health route for the container healthcheck

**Files:**
- Create: `web/app/api/health/route.ts`
- Test: `web/app/api/health/route.test.ts`

**Interfaces:**
- Produces: `GET(): Response` returning `200 {"status":"ok"}`. Consumed by the compose healthcheck (Task 4) at `http://localhost:8000/api/health`.

- [ ] **Step 1: Write the failing test**

```ts
// web/app/api/health/route.test.ts
import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns 200 with ok status", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run app/api/health/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Write the route**

```ts
// web/app/api/health/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run app/api/health/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the build sees the route**

Run: `cd web && npm run build 2>&1 | grep -E "/api/health|Compiled successfully|✓"`
Expected: build succeeds and lists `/api/health` among routes.

- [ ] **Step 6: Commit**

```bash
git add web/app/api/health/route.ts web/app/api/health/route.test.ts
git commit -m "feat(web): add /api/health route for container healthcheck"
```

---

### Task 2: Startup entrypoint script

**Files:**
- Create: `web/docker-entrypoint.sh`

**Interfaces:**
- Consumes (at runtime, provided by Task 3's image): `./node_modules/.bin/tsx`, `scripts/db-migrate.ts`, `scripts/migrate-data.ts`, `scripts/verify-migration.ts`, `drizzle/` (all relative to WORKDIR `/app`), env `DATABASE_FILE` (default `/app/data/cookless.db`), `better-sqlite3` resolvable from `node_modules`.
- Produces: an executable entrypoint that runs schema-migrate → guarded import+verify → `exec node server.js`. Referenced by the Dockerfile `ENTRYPOINT` in Task 3.

- [ ] **Step 1: Write the entrypoint script**

```sh
#!/bin/sh
# web/docker-entrypoint.sh — startup auto-migration, then serve.
# Any failure exits non-zero so the container refuses to start (no half-migrated DB served).
set -e
cd /app

TSX=./node_modules/.bin/tsx
: "${DATABASE_FILE:=/app/data/cookless.db}"
export DATABASE_FILE
OLD_DJANGO_DB=/app/data/db.sqlite3

echo "[entrypoint] applying schema migrations to ${DATABASE_FILE}"
"$TSX" scripts/db-migrate.ts

# One-time Django import: only when the new DB has no users AND the old Django DB is present.
USERS=$(node -e "const d=require('better-sqlite3')(process.env.DATABASE_FILE,{readonly:true});const t=d.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='users'\").get();if(!t){console.log(0);process.exit(0);}console.log(d.prepare('SELECT count(*) n FROM users').get().n);")

if [ -f "$OLD_DJANGO_DB" ] && [ "$USERS" = "0" ]; then
  echo "[entrypoint] fresh DB + old Django DB found → importing data"
  SOURCE_DB="$OLD_DJANGO_DB" "$TSX" scripts/migrate-data.ts
  echo "[entrypoint] verifying migration"
  "$TSX" scripts/verify-migration.ts
  echo "[entrypoint] import + verify complete"
else
  echo "[entrypoint] no import needed (users=${USERS}, old DB present: $([ -f "$OLD_DJANGO_DB" ] && echo yes || echo no))"
fi

echo "[entrypoint] starting server on port ${PORT:-8000}"
exec node server.js
```

- [ ] **Step 2: Make it executable and syntax-check it**

```bash
chmod +x web/docker-entrypoint.sh
sh -n web/docker-entrypoint.sh && echo "syntax ok"
```

Expected: `syntax ok` (no output from `sh -n` means valid).

- [ ] **Step 3: Commit**

```bash
git add web/docker-entrypoint.sh
git commit -m "feat(web): startup entrypoint — schema migrate + guarded one-time import"
```

> Note: full behavioural proof (fresh-import vs no-op vs failure-refuses-start) happens in the Docker dry-run in Task 4; there is no meaningful unit test for a container entrypoint without building the image.

---

### Task 3: Bake the migration toolchain into the runtime image

**Files:**
- Modify: `web/Dockerfile`

**Interfaces:**
- Consumes: `web/docker-entrypoint.sh` (Task 2).
- Produces: an image whose WORKDIR `/app` contains `server.js` (standalone), a **full** `node_modules` (incl. `tsx` + drizzle migrator), `lib/`, `scripts/`, `drizzle/`, `tsconfig.json`, `package.json`, the entrypoint, and `ENV PORT=8000`; `ENTRYPOINT` runs the entrypoint, `CMD ["node","server.js"]`.

- [ ] **Step 1: Rewrite the runtime stage**

Replace the `runtime` stage of `web/Dockerfile` (keep `deps` and `build` stages as-is) with:

```dockerfile
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Next standalone server + assets.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Migration toolchain: full deps (incl. tsx + drizzle migrator) OVERRIDE the pruned
# standalone node_modules, plus the TS sources the scripts import.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/data/media
ENV DATABASE_FILE=/app/data/cookless.db
ENV MEDIA_ROOT=/app/data/media
ENV PORT=8000
EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
```

- [ ] **Step 2: Build the image**

Run: `docker build -t cookless-web:autotest ./web`
Expected: build completes; no COPY errors (confirms `lib/`, `scripts/`, `tsconfig.json`, `drizzle/`, entrypoint all exist at the expected paths).

- [ ] **Step 3: Confirm the toolchain is present in the image**

Run:
```bash
docker run --rm cookless-web:autotest sh -c 'test -x ./node_modules/.bin/tsx && node -e "require(\"drizzle-orm/better-sqlite3/migrator\")" && node -e "require(\"better-sqlite3\")" && echo TOOLCHAIN_OK'
```
Expected: `TOOLCHAIN_OK` (proves tsx binary, drizzle migrator submodule, and native better-sqlite3 all resolve — the three things standalone pruning would have dropped).

- [ ] **Step 4: Commit**

```bash
git add web/Dockerfile
git commit -m "feat(web): carry migration toolchain + entrypoint in runtime image; listen on 8000"
```

---

### Task 4: End-to-end Docker dry-run against a copy of the real prod data

This is the integration gate. It proves the whole auto-migration on a **copy** of the real `cookless_data` volume — never the live one.

**Files:** none (verification task).

**Interfaces:**
- Consumes: image `cookless-web:autotest` (Task 3).
- Produces: recorded proof that fresh boot imports+verifies+serves, a second boot no-ops the import, and images render.

- [ ] **Step 1: Snapshot the real prod volume into a throwaway test volume**

> Run on the deploy host (or any host with the `cookless_data` volume). Adjust the source volume name if different.

```bash
docker volume create cookless_data_dryrun
docker run --rm \
  -v cookless_data:/src:ro \
  -v cookless_data_dryrun:/dst \
  busybox sh -c 'cp -a /src/. /dst/ && ls -la /dst && echo COPIED'
```
Expected: `COPIED`, and `/dst` lists `db.sqlite3` (+ `media/`). Confirm `cookless.db` is **absent** (fresh target).

- [ ] **Step 2: First boot — expect import + verify + serve**

```bash
docker run --rm --name cookless_dry \
  -e AUTH_SECRET=dryrun-not-secret \
  -e WEBAUTHN_RP_ID=localhost -e WEBAUTHN_RP_NAME=Cookless -e WEBAUTHN_ORIGIN=http://localhost:8000 \
  -v cookless_data_dryrun:/app/data \
  -p 8000:8000 \
  cookless-web:autotest
```
Watch the logs. Expected sequence:
- `[entrypoint] applying schema migrations`
- `[entrypoint] fresh DB + old Django DB found → importing data`
- migrate-data output, then `verify-migration` lines ending `ALL CHECKS PASSED`
- `[entrypoint] starting server on port 8000`, then Next ready.

If verify prints `SOME CHECKS FAILED`, the container exits non-zero and never serves — that is the intended failure gate. Stop here and investigate before touching prod.

- [ ] **Step 3: Smoke the running container**

In another shell:
```bash
curl -sf http://localhost:8000/api/health && echo " HEALTH_OK"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/login   # expect 200
```
Expected: `{"status":"ok"} HEALTH_OK` and `200`. Optionally open `http://localhost:8000` and confirm login + a recipe image loads via `/api/images/recipes/...`. Then `Ctrl-C` to stop.

- [ ] **Step 4: Second boot — expect NO re-import (idempotent)**

```bash
docker run --rm --name cookless_dry2 \
  -e AUTH_SECRET=dryrun-not-secret \
  -e WEBAUTHN_RP_ID=localhost -e WEBAUTHN_RP_NAME=Cookless -e WEBAUTHN_ORIGIN=http://localhost:8000 \
  -v cookless_data_dryrun:/app/data \
  -p 8000:8000 \
  cookless-web:autotest
```
Expected: `[entrypoint] applying schema migrations` then `[entrypoint] no import needed (users=<N>, old DB present: yes)` (N>0), then server starts. No migrate-data output. `Ctrl-C` to stop.

- [ ] **Step 5: Tear down the throwaway volume**

```bash
docker volume rm cookless_data_dryrun
echo "dry-run volume removed"
```

- [ ] **Step 6: Record the result**

Append the Step-2 `verify-migration` row-count line and the Step-4 no-op line to the cutover runbook's dry-run record (updated in Task 5). No code commit for this task.

---

### Task 5: Rewrite the production compose + update the runbook/release notes

**Files:**
- Modify: `docker-compose.production.yml`
- Modify: `docs/runbooks/cutover.md`
- Modify: `docs/RELEASE-NOTES-nextjs-cutover.md`

**Interfaces:**
- Consumes: the image and health route from Tasks 1–3; the dry-run proof from Task 4.
- Produces: the exact prod compose the user applies, plus a runbook describing the one-command flow.

- [ ] **Step 1: Replace `docker-compose.production.yml` with the prod-shaped service**

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

- [ ] **Step 2: Validate the compose file**

Run: `docker compose -f docker-compose.production.yml config >/dev/null && echo COMPOSE_OK`
Expected: `COMPOSE_OK` (valid YAML + interpolation; `AUTH_SECRET` must be set in the shell/env for this check, e.g. `AUTH_SECRET=x docker compose ... config`).

- [ ] **Step 3: Rewrite `docs/runbooks/cutover.md` to the one-command flow**

Replace the step-by-step manual procedure with:
- **Prereqs:** `AUTH_SECRET` set; new image published; compose points at the same `cookless_data` volume.
- **Cutover:** (1) optional volume backup one-liner; (2) publish the new image; (3) apply the compose from Step 1; (4) `docker compose -f docker-compose.production.yml up -d` (or let GitOps redeploy); the container self-migrates. (5) log in with a passkey; reset any password-only users via `set-password.ts`.
- **How auto-migration works:** entrypoint runs schema migrations every deploy; imports the Django DB once when `users==0` and `/app/data/db.sqlite3` exists; verify failure → container refuses to start.
- **Rollback:** revert compose `image`/env to the Django values and redeploy; `/app/data/db.sqlite3` is untouched; delete `/app/data/cookless.db` from the volume to re-arm a fresh auto-import.
- **Dry-run record:** paste the Task-4 Step-2 verify line and Step-4 no-op line.
- Keep the per-user `set-password.ts` reset command (unchanged).

- [ ] **Step 4: Update `docs/RELEASE-NOTES-nextjs-cutover.md`**

Add a short "Cutover mechanics" note: single self-migrating container reusing the `cookless_data` volume; sessions are invalidated (everyone re-logs in); all passwords reset (passkey users unaffected; password-only users need an admin reset).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.production.yml docs/runbooks/cutover.md docs/RELEASE-NOTES-nextjs-cutover.md
git commit -m "feat: one-command self-migrating prod compose + cutover runbook rewrite"
```

---

## Self-Review

**Spec coverage:**
- Self-contained auto-migrating image → Tasks 2, 3. ✓
- Schema-migrate-always + guarded one-time import + verify gate + refuse-to-start → Task 2 (`set -e`, guard, verify). ✓
- Reuse `cookless_data` volume, images co-located (no copy), old DB untouched → Tasks 4, 5 (compose mounts same volume; new DB is separate file). ✓
- Health route + healthcheck → Tasks 1, 5. ✓
- `PORT=8000`, Traefik label unchanged → Tasks 3, 5. ✓
- One-time compose edit (env swap, drop Django vars, drop static volume) → Task 5. ✓
- Failure mode = refuse to start; verify after import → Task 2 + Task 4 Step 2. ✓
- Residual password-only reset → Task 5 runbook. ✓
- Dry-run against a copy of the real volume → Task 4. ✓

**Placeholder scan:** No TBD/TODO; every code/config/command step shows full content. ✓

**Type/name consistency:** `/api/health` GET shape matches healthcheck URL; `DATABASE_FILE`/`SOURCE_DB`/`OLD_DJANGO_DB` consistent across entrypoint and scripts; `./node_modules/.bin/tsx` path matches the full-node_modules copy in Task 3. ✓
