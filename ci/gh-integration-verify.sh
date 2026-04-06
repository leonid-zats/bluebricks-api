#!/usr/bin/env bash
# Idempotent integration verification for GitHub Actions post_agent_integration.
# Starts Postgres via Compose, runs Flyway, runs integration tests, tears down.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Starting Postgres..."
docker compose up -d db

for i in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U blueprint -d blueprints >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$i" -eq 60 ]]; then
    echo "Postgres did not become ready in time"
    docker compose logs db
    exit 1
  fi
done

export DATABASE_URL="postgresql://blueprint:blueprint@127.0.0.1:5432/blueprints"
export PGUSER=blueprint
export PGPASSWORD=blueprint
export PGDATABASE=blueprints
export PGHOST=127.0.0.1
export PGPORT=5432

echo "Running Flyway migrations..."
bash scripts/migrate-flyway.sh

echo "Installing deps and running integration tests..."
npm ci
export SKIP_FLYWAY_INTEGRATION=1
npm run test:integration

if command -v go >/dev/null 2>&1; then
  echo "Running Go CLI tests (blueprintctl)..."
  (cd cli && go test ./...)
else
  echo "Skipping Go CLI tests: go not found on PATH"
fi

echo "Cleanup..."
docker compose down -v

echo "Integration verify complete."
