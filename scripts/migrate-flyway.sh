#!/usr/bin/env bash
# Run Flyway migrate against Postgres using the official Flyway Docker image.
# Requires Docker. Uses DATABASE_URL or PG* env vars (defaults match docker-compose db service).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

USER="${PGUSER:-blueprint}"
PASS="${PGPASSWORD:-blueprint}"
DB="${PGDATABASE:-blueprints}"
HOST="${PGHOST:-127.0.0.1}"
PORT="${PGPORT:-5432}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  if [[ "$DATABASE_URL" =~ ^postgresql://([^:]+):([^@]+)@([^:/]+)(:([0-9]+))?/([^?]+) ]]; then
    USER="${BASH_REMATCH[1]}"
    PASS="${BASH_REMATCH[2]}"
    HOST="${BASH_REMATCH[3]}"
    PORT="${BASH_REMATCH[5]:-5432}"
    DB="${BASH_REMATCH[6]}"
  fi
fi

URL="jdbc:postgresql://${HOST}:${PORT}/${DB}"

exec docker run --rm --network host \
  -v "${DIR}/db/migration:/flyway/sql:ro" \
  flyway/flyway:10-alpine \
  -url="${URL}" \
  -user="${USER}" \
  -password="${PASS}" \
  migrate
