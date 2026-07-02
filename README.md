# Cookless

A meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization. Built with Next.js.

## Features

- **Recipe management** -- organize recipes into Known and To Try lists with bilingual ingredient support (English/German)
- **Meal plan generation** -- balances familiar and new recipes while optimizing ingredient overlap across meals
- **Shopping list generation** -- aggregates ingredients across planned meals with unit conversion
- **Cooking view** -- step-by-step cooking guide with screen wake lock
- **Multi-user households** -- owner/member roles with a code-based invite system
- **Onboarding wizard** -- guided setup for new users (set password, add passkey, create household)
- **AI support** -- optional Gemini integration per household (toggle + API key in settings)
- **PWA** -- installable on iOS and Android
- **i18n** -- English and German

## Tech Stack

| Layer    | Technology                                                     |
|----------|----------------------------------------------------------------|
| Framework| Next.js 16 (App Router), React 19, TypeScript                  |
| Styling  | Tailwind CSS 4, Radix UI primitives                            |
| Data     | Drizzle ORM over SQLite (`better-sqlite3`)                     |
| Auth     | WebAuthn passkeys + email/password, signed session cookies     |
| Deploy   | Docker single-container (Next.js standalone), Traefik          |

## Prerequisites

- Node.js 22.4+
- Docker and Docker Compose (for containerized setup)

## Setup

```bash
cd web
npm install
npm run db:migrate    # apply Drizzle schema migrations to the SQLite DB
npm run db:seed       # load unit + ingredient seed data
npm run dev           # Next.js dev server on http://localhost:3000
```

### Bootstrap (first deployment)

On a fresh install (no users yet), open the app in a browser. The first visitor
is guided through creating the first account (passkey or password) and their
household — becoming its OWNER. Once a user exists, registration is invite-only.

### Environment Variables

Configure via `.env` in `web/` or export directly.

| Variable            | Default                    | Description                                   |
|---------------------|----------------------------|-----------------------------------------------|
| `AUTH_SECRET`       | --                         | Secret used to sign session cookies (required)|
| `DATABASE_FILE`     | `./data/cookless.db`       | Path to the SQLite database file              |
| `MEDIA_ROOT`        | `./data/media`             | Directory for uploaded + AI-generated images  |
| `WEBAUTHN_RP_ID`    | --                         | WebAuthn relying party ID                     |
| `WEBAUTHN_RP_NAME`  | --                         | WebAuthn relying party name                   |
| `WEBAUTHN_ORIGIN`   | --                         | WebAuthn allowed origin(s), comma-separated   |
| `PORT`              | `8000` (image) / `3000`    | Port the server listens on                    |

## Development

```bash
cd web
npm test          # Vitest
npm run typecheck # tsc --noEmit
```

### Database migrations

```bash
cd web
npm run db:generate   # generate a new Drizzle migration from schema.ts changes
npm run db:migrate    # apply pending migrations
```

## Deployment

### Docker (Development)

```bash
docker-compose up      # builds ./web, serves on http://localhost:3000
```

### Docker (Production)

```bash
docker-compose -f docker-compose.production.yml up -d
```

The published `sascha384/cookless` image runs `web/docker-entrypoint.sh`, which
applies Drizzle schema migrations on every boot and then serves the Next.js
standalone server on port 8000.

## Architecture

```
web/
  app/            # Next.js App Router
    (app)/        # authenticated app: recipes, plan, shopping, cook, settings
    (account)/    # account + household management
    (auth)/       # login / register
    api/          # route handlers (auth, images, recipes, shopping, health)
    onboarding/   # first-run + invite onboarding flow
  components/     # React components + ui/ primitives
  lib/            # domain + server logic
    db/           # Drizzle schema + client
    auth/         # WebAuthn, password, sessions
    recipes/ meal-plan/ shopping/ households/ ...  # domain modules
    i18n/         # translations (en / de)
  drizzle/        # generated SQL migrations
  scripts/        # db-migrate, db:seed, set-password admin helper
docs/             # design + implementation plan archive
```

- All data is scoped to the user's active household (multi-tenant)
- Auth uses signed session cookies with WebAuthn passkeys and/or email/password

## License

Private -- all rights reserved.
