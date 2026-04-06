# Requirements — Blueprint Manager API (implementation)

**Source:** `workflow/product_requirements_clarified.md` (authoritative intent). Paths below are under `assignments/bluebricks/`.

## Primary goal

Node.js + TypeScript HTTP service storing Blueprints in PostgreSQL with CRUD at `/blueprints`, Flyway migrations, Docker Compose (`postgres:16-alpine` + API), unit tests (no DB) and integration tests (real Postgres + Flyway). Canonical `blueprint_data` example: `bricks.json`.

## Deliverables

1. TypeScript source in `src/` (Express + `pg`).
2. Flyway SQL in `db/migration/` (e.g. `V1__create_blueprints.sql`).
3. `Dockerfile`, `docker-compose.yml`.
4. `scripts/run-integration-tests.sh` — idempotent Compose up (db), Flyway migrate, `npm ci`, `npm run test:integration`, tear down.
5. `package.json` scripts: `test`, `test:unit`, `test:integration`, `build`, `start`.
6. `README.md` with run/verify and integration test instructions (`scripts/run-integration-tests.sh` / `npm run test:integration`).
7. `bricks.json` — canonical payload fragment for integration tests.

## Functional requirements

### Table `blueprints`

| Column | Type | Rules |
|--------|------|--------|
| `id` | serial PK | JSON number |
| `name` | varchar NOT NULL | Create: required, non-empty trim; PUT: if key present, non-empty trim |
| `version` | varchar NOT NULL | Same |
| `author` | varchar NOT NULL | Same |
| `blueprint_data` | JSONB NOT NULL | Create: required JSON object; PUT: if key present, object |
| `created_at` | timestamptz NOT NULL | Server default on insert; not updated on PUT |

Migration must support sorts: `name`, `version`, `created_at`, and default **`created_at DESC, id DESC`**.

### Routes

- **`POST /blueprints`** — 201 + full entity; 400 validation `{ "error": string, "message": string }`.
- **`GET /blueprints`** — Query: `page` (≥1, default 1), `page_size` (1–100, default 20), `sort` optional: `name` | `version` | `created_at`, `order`: `asc` | `desc` (default `asc` when `sort` set). If `sort` omitted: order by `created_at DESC, id DESC`. Response: `{ items, page, page_size, total, total_pages }`. Invalid query → 400. `total_pages` = 0 when `total=0`.
- **`GET /blueprints/:id`** — 200 or 404 structured JSON. Non-numeric or non-positive `id` → 400.
- **`PUT /blueprints/:id`** — Merge update; 200 or 404. Same field rules as above. Malformed `id` → 400.
- **`DELETE /blueprints/:id`** — 204 success; 404 if missing. Malformed `id` → 400.

### HTTP contract tests

Tests MUST assert **exact** success and error shapes: status codes, JSON fields (`error`, `message` where specified), and success payloads including `id`, `created_at` ISO string, and nested `blueprint_data`.

## Validation

- Create: `name`, `version`, `author`, `blueprint_data` (object) required.
- List: bounded `page_size`, valid `sort`/`order`/`page`.

## Distributed systems & reliability (always consider)

### 1. Recovery model

**N/A:** No queue. PostgreSQL is the source of truth. Committed rows survive process restart; uncommitted work is lost. POST is not idempotent; client retries may duplicate rows.

### 2. Replay capability

**N/A:** No event stream. Reprocessing is out of scope.

### 3. Consistency model

Per-request **read committed** semantics against PostgreSQL; no app-level stale cache required.

### 4. Scaling model

Stateless API; single DB. Horizontal scaling possible with shared Postgres; connection pool is the main shared constraint.

### 5. Failure modes

**Baseline (assignment template):**

- **Crash during “enqueue” / before commit:** Uncertain client outcome; retry may duplicate (**accepted**).
- **DB unavailable:** 503 or 500 with structured JSON; no fake empty lists.
- **Worker stuck:** N/A for sync HTTP; **pool exhaustion / slow DB** may surface as 503/500 or timeout.
- **Queue overload:** N/A.

**Task-specific named scenarios:**

1. **Invalid pagination or sort** — Trigger: bad `page`/`page_size`/`sort`/`order`. Expected: **400**, structured error, no DB list execution where validation is purely param-based.
2. **DB connection failure** — Trigger: wrong URL or DB down. Expected: **503** or **500** structured error for API routes (integration or unit with mocked pool optional; integration documents live behavior).
3. **Malformed body or invalid `blueprint_data` type** — Trigger: null/array `blueprint_data`, missing fields on POST. Expected: **400**, no insert.
4. **Concurrent PUT same id** — Trigger: parallel updates. Expected: last write wins (read committed). Document in README.

## Non-goals

Auth, Go CLI, catalog semantics beyond JSON storage.

## Acceptance checklist

- [ ] All five routes + malformed id handling
- [ ] Flyway creates table + indexes
- [ ] Compose: official postgres + API build
- [ ] Unit + integration scripts; `bricks.json` in ≥1 integration test
- [ ] `scripts/run-integration-tests.sh` documented for local integration runs (no `ci/` folder)
