#!/bin/sh
# web/docker-entrypoint.sh — apply schema migrations, then serve.
# Any failure exits non-zero so the container refuses to start (no half-migrated DB served).
set -e
cd /app

TSX=./node_modules/.bin/tsx
: "${DATABASE_FILE:=/app/data/cookless.db}"
export DATABASE_FILE

echo "[entrypoint] applying schema migrations to ${DATABASE_FILE}"
"$TSX" scripts/db-migrate.ts

echo "[entrypoint] starting server on port ${PORT:-8000}"
exec node server.js
