#!/usr/bin/env bash
# Run integration tests: assumes Postgres is reachable at DATABASE_URL (default matches compose db port mapping).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export DATABASE_URL="${DATABASE_URL:-postgresql://blueprint:blueprint@127.0.0.1:5432/blueprints}"

if [[ "${SKIP_FLYWAY_INTEGRATION:-}" != "1" ]]; then
  bash scripts/migrate-flyway.sh
fi

exec npx vitest run --config vitest.config.integration.ts
