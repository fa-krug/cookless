# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The application is a single Next.js app under `web/`. Run all commands from that directory.

## Common Commands

```bash
cd web
npm run dev           # Next.js dev server on http://localhost:3000
npm run build         # production build (standalone output)
npm test              # Vitest
npm run typecheck     # tsc --noEmit
npm run db:generate   # generate a Drizzle migration from lib/db/schema.ts changes
npm run db:migrate    # apply pending Drizzle migrations
npm run db:seed       # load unit + ingredient seed data
```

### Docker
```bash
docker-compose up                                   # dev, builds ./web, port 3000
docker-compose -f docker-compose.production.yml up  # production (sascha384/cookless image)
```

## Architecture Overview

**Meal planning PWA** -- a single Next.js 16 (App Router) application in `web/`.

- **Framework:** Next.js 16, React 19, TypeScript.
- **Styling:** Tailwind CSS 4 with Radix UI primitives (`components/ui/`).
- **Data:** Drizzle ORM over SQLite via `better-sqlite3`. Schema in `lib/db/schema.ts`; migrations in `drizzle/`.
- **Auth:** WebAuthn passkeys + email/password, signed session cookies (`lib/auth/`). No Django/session-server dependency.
- **Multi-tenant:** all data is scoped to the user's active household.

### Directory layout (`web/`)

- `app/` -- App Router. Route groups: `(app)` (recipes, plan, shopping, cook, settings), `(account)`, `(auth)`; `api/` route handlers (auth, images, recipes, shopping, health); `onboarding/`.
- `components/` -- React components plus `ui/` primitives.
- `lib/` -- server + domain logic: `db/`, `auth/`, `recipes/`, `meal-plan/`, `shopping/`, `households/`, `ai/`, `images/`, `i18n/`, `offline/`, `queries/`, `actions/`.
- `drizzle/` -- generated SQL migrations.
- `scripts/` -- `db-migrate.ts`, `seed.ts`, and the `set-password.ts` admin helper.

### Deployment

The published `sascha384/cookless` image runs `web/docker-entrypoint.sh`, which applies Drizzle schema migrations on every boot, then serves the Next.js standalone server (`server.js`) on port 8000.

### Environment Variables

`AUTH_SECRET` (signs session cookies), `DATABASE_FILE` (default `/app/data/cookless.db`), `MEDIA_ROOT` (default `/app/data/media`), WebAuthn settings (`WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN` -- comma-separated lists supported), `PORT`.
