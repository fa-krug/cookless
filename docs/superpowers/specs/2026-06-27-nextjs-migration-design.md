# Next.js Migration — Design

**Date:** 2026-06-27
**Status:** Approved (design phase)

## Goal

Replace the two-service architecture (Django Ninja backend + React/Vite SPA frontend)
with a **single self-hosted Next.js (App Router) application**, removing the Django
backend entirely.

### Motivating goals (in priority order from discussion)

1. **One language / one codebase** — everything in TypeScript.
2. **Simpler deployment** — collapse two containers (Django + frontend) into one Node container.
3. **Better SSR / performance** — server-render read-heavy pages (recipes, planner, shopping).
4. **Reduce maintenance surface** — one dependency tree, one CI, one test setup.

### Explicitly acknowledged trade-offs

This is a **ground-up rewrite**, not a mechanical migration. We knowingly give up:

- Django migrations + admin UI (move to Drizzle migrations; no admin replacement).
- A mature, batteries-included auth/WebAuthn stack (re-implemented on standard libraries).
- ORM maturity for deep multi-tenant filter chains.

The #4 "less maintenance" payoff only arrives *after* the rewrite cost is absorbed.
We proceed because the architecture fit is good (self-hosted, SQLite, long-running Node,
frontend already React 19 + TS + Tailwind 4) and the consolidation is genuinely wanted.

## Constraints / decisions

- **Hosting:** self-hosted, single long-running Node container. **Not serverless.**
- **Database:** SQLite (prod already uses SQLite — no Postgres).
- **Frontend approach:** full embrace of React Server Components + server actions
  (chosen over "relocate API only" to realize the SSR/perf goal).
- **Auth scope:** passkeys + password fallback. **Personal Access Tokens dropped**
  (not used). Multi-tenant household scoping retained.

## Target stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js (App Router) | RSC + server actions |
| ORM | Drizzle | TS-native, SQL-first, lightweight; migrations fit self-hosted SQLite |
| DB driver | better-sqlite3 | Synchronous, fast, solid for a single long-running process |
| Decimal math | decimal.js | Exact quantity math for shopping aggregation (no float drift) |
| Images | Sharp | Direct Pillow replacement (resize → WebP), disk storage |
| AI | direct `fetch` to Gemini | 1:1 port of `generation.py`; NDJSON via `ReadableStream` |
| Validation | Zod | Replaces Ninja/Pydantic schemas; reuse existing `lib/schemas` |
| Sessions | cookie-based, signed httpOnly | Matches current Django session model |
| Passkeys | `@simplewebauthn/server` | The standard Node WebAuthn library (same ecosystem role as `py_webauthn`) |
| Password | argon2 | Standard hashing |

**Note on "known standard" auth:** WebAuthn crypto/ceremonies use the standard
`@simplewebauthn/server` library — not hand-rolled crypto. The only bespoke code is the
~50 lines of session glue and household scoping, which is app domain logic no framework
provides. Auth.js was rejected because passkeys-only + custom household scoping makes the
framework add more friction than it removes.

## Architecture

Single Next.js app. Server Components fetch from the DB directly (no HTTP hop); mutations
use server actions; HTTP route handlers exist **only** where HTTP is genuinely required
(Gemini NDJSON streaming, image upload/serve, WebAuthn ceremony exchange).

```
cookless/
├── app/
│   ├── (auth)/login, /onboarding
│   ├── recipes/                  # list + [id] detail — RSC (SSR win)
│   ├── planner/                  # meal plan views — RSC
│   ├── shopping/                 # list RSC; toggles = client + server action
│   ├── cooking/[id]/             # interactive — client component
│   ├── settings/
│   └── api/                      # route handlers ONLY where HTTP required:
│       ├── recipes/generate/     #   Gemini NDJSON stream
│       ├── images/[...]/         #   upload + serve disk images
│       └── auth/webauthn/        #   passkey ceremony begin/complete
├── lib/
│   ├── db/                       # Drizzle schema + better-sqlite3 client
│   ├── auth/                     # session glue + @simplewebauthn wrappers
│   ├── domain/                   # ported business logic (framework-free, unit-testable)
│   │   ├── meal-plan/            #   selection + scheduling algorithm
│   │   ├── shopping/             #   aggregation + unit conversion (decimal.js)
│   │   └── recipes/              #   scaling, validation
│   ├── ai/                       # Gemini prompt building + calls (port of generation.py)
│   ├── images/                   # Sharp resize → WebP
│   └── schemas/                  # Zod (merge with existing frontend schemas)
├── data/                         # SQLite db + uploaded images (volume-mounted)
├── drizzle/                      # generated migrations
└── Dockerfile                    # single image
```

**Key principle:** all risky business logic lives in `lib/domain/` as **pure,
framework-free TypeScript** — no Next.js or DB-session coupling. It is ported and
unit-tested in isolation against the existing Python test cases *before* being wired
into any page.

## Data layer & migration

**Schema:** all 17 models → Drizzle tables, keeping UUID PKs and existing relationships.

Special handling:
- **Decimals** (quantities, conversion factors): stored as **TEXT**, parsed via
  **decimal.js** in `lib/domain`. A quantity must never touch a JS `number`.
- **Binary** (passkey `credential_id`, `public_key`): stored as **BLOB**.

**Data migration (existing prod SQLite → new schema):** a one-time `scripts/migrate-data.ts`
reads the old Django SQLite file and inserts into the new Drizzle schema. Most tables map
1:1 (Django table names are predictable). Dropped tables (`PersonalAccessToken`) are
skipped. Verify with row counts + spot-checks before cutover. No live dual-write needed.

**Seed data:** default tags (`tag_defaults.py`) and seeded ingredients/units → `scripts/seed.ts`.

## Auth

- **Sessions:** signed, httpOnly cookie holding a session id; sessions table in SQLite.
  `lib/auth/session.ts` exposes `getSession()` (RSC + actions) and `requireHousehold()`
  returning `{ user, household }` or redirecting.
- **Passkeys:** `@simplewebauthn/server` register/login begin+complete as 4 route handlers
  under `app/api/auth/webauthn/`. Stores `credential_id`, `public_key`, `sign_count`
  (clone detection preserved).
- **Password fallback:** argon2 hashing, standard login form (recovery/backup login).
- **Multi-tenant scoping:** every domain query takes `householdId` from `requireHousehold()`.
  A thin helper enforces the filter so no query can forget it — same guarantee as the
  current Django permission layer.
- **Onboarding wizard:** ported (change password → add passkey → create household → done).

## Business logic / AI / images / testing

- **`lib/domain` ported first, test-driven.** Existing Python tests (meal-plan selection,
  leftover scheduling, shopping aggregation) become the spec — ported to Vitest and made
  green *before* wiring into pages. Highest-risk area, so it goes first.
- **AI:** `generation.py` → `lib/ai`, prompt building 1:1; NDJSON streamed from
  `app/api/recipes/generate` via `ReadableStream`.
- **Images:** Sharp replaces Pillow (resize → WebP); files on mounted `data/` volume;
  served via `app/api/images/[...]`.
- **Testing:** Vitest (domain + components); Playwright for critical flows
  (login, generate recipe, build plan → shopping list).
- **Deployment:** one multi-stage Dockerfile, one container, `data/` volume for SQLite +
  images. `docker-compose.yml` collapses from two services to one.

## Build order (de-risked)

1. Scaffold Next.js + Drizzle schema + data-migration script (prove real data loads).
2. `lib/domain` port, test-driven against existing Python tests.
3. Auth (passkeys + password + sessions + household scoping).
4. Read pages as RSC (recipes, planner, shopping).
5. Mutations as server actions.
6. AI generation + images.
7. Cutover (Dockerfile, migrate prod data, verify).

## Out of scope

- Personal Access Tokens (dropped).
- Postgres support.
- Serverless / Vercel hosting.
- A Django-admin replacement.

## Risks

- **Decimal precision** in shopping aggregation — mitigated by TEXT storage + decimal.js,
  enforced by ported tests.
- **Meal-plan algorithm fidelity** — mitigated by porting Python tests first.
- **WebAuthn correctness** — mitigated by using the standard `@simplewebauthn/server`.
- **Second-system effect** — mitigated by strict feature-parity scope (minus PATs) and a
  one-shot data migration with verification.
