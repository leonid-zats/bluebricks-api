#!/usr/bin/env bash
# Smoke-test blueprintctl against a running API (assignment verification).
# Prerequisite: API reachable at BLUEPRINTS_API_BASE (default http://127.0.0.1:3000),
# e.g. `docker compose up --build` from repository root.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export BLUEPRINTS_API_BASE="${BLUEPRINTS_API_BASE:-http://127.0.0.1:3000}"

cd "$ROOT/cli"
go build -o blueprintctl ./cmd/blueprintctl

BP="./blueprintctl"
JSON_FILE="$ROOT/bricks.json"

echo "Using BLUEPRINTS_API_BASE=$BLUEPRINTS_API_BASE"

echo "== list =="
"$BP" list --page 1 --page-size 5

echo "== create =="
CREATE_OUT="$("$BP" create --file "$JSON_FILE")"
echo "$CREATE_OUT"
ID="$(echo "$CREATE_OUT" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')"

echo "== get =="
"$BP" get --id "$ID"

echo "== update =="
"$BP" update --id "$ID" --file "$JSON_FILE"

echo "== list with sort =="
"$BP" list --page 1 --page-size 10 --sort name --order asc

echo "== idempotent create (same key + body twice) =="
KEY="verify-cli-$(date +%s)"
OUT_I="$("$BP" create --file "$JSON_FILE" --idempotency-key "$KEY")"
ID_I="$(echo "$OUT_I" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')"
"$BP" create --file "$JSON_FILE" --idempotency-key "$KEY" >/dev/null

echo "== delete primary row =="
"$BP" delete --id "$ID"

echo "== get after delete primary (expect exit 1) =="
set +e
"$BP" get --id "$ID" 2>/dev/null
ec=$?
set -e
if [[ "$ec" -ne 1 ]]; then
  echo "expected exit 1 for not_found, got $ec" >&2
  exit 1
fi

echo "== delete idempotent row =="
"$BP" delete --id "$ID_I"

echo "OK — CLI smoke verification passed."
