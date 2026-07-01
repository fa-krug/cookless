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
