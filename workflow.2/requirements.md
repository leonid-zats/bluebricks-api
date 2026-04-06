# Requirements — Blueprint Manager API (implementation)

**Source:** `workflow/product_requirements_clarified.md` (authoritative intent). Paths below are under `assignments/bluebricks/`.

## Primary goal

Node.js + TypeScript HTTP service storing Blueprints in PostgreSQL with CRUD at `/blueprints`, **Prisma ORM** for persistence, Flyway migrations, Docker Compose (`postgres:16-alpine` + API), unit tests (no DB) and integration tests (real Postgres + Flyway). Canonical `blueprint_data` example: `bricks.json`.

## Deliverables

1. TypeScript source in `src/` (Express + **Prisma Client**).
2. `prisma/schema.prisma` matching Flyway-managed tables.
3. Flyway SQL in `db/migration/` including **`V2__add_idempotency_key.sql`** (nullable `idempotency_key`, unique index).
4. `Dockerfile`, `docker-compose.yml` (API image runs `prisma generate` / copies generated engine as in Dockerfile).
5. `ci/gh-integration-verify.sh` — idempotent Compose up (db), Flyway migrate, `npm ci`, `npm run test:integration`, tear down.
6. `package.json` scripts: `test`, `test:unit`, `test:integration`, `build` (includes `prisma generate`), `start`.
7. `README.md` with run/verify and **post_agent_integration** hook reference.
8. **OOP:** `IBlueprintRepository` interface + `PrismaBlueprintRepository` implementation; router receives `PrismaClient` (or repository) from composition root.

## Functional requirements

### Table `blueprints`

| Column | Type | Rules |
|--------|------|-------|
| id | serial PK | JSON number |
| name | varchar NOT NULL | Create: required, non-empty trim; PUT: if key present, non-empty trim |
| version | varchar NOT NULL | Same |
| author | varchar NOT NULL | Same |
| blueprint_data | JSONB NOT NULL | Create: required JSON object; PUT: if key present, object |
| created_at | timestamptz NOT NULL | Server default on insert; not updated on PUT |
| idempotency_key | varchar NULL, unique when set | Set on POST only when `Idempotency-Key` header present (non-empty after trim, max 255) |

Migration must support sorts: `name`, `version`, `created_at`, and default **`created_at DESC, id DESC`**.

### Routes

- **`POST /blueprints`** — Optional header `Idempotency-Key` (case-insensitive). Empty/whitespace → absent. Max length **255** after trim → **400** `validation_error`. Same key + same body as existing row → **200** with same representation. Same key + different body → **409** `{ "error": "conflict", "message": "Idempotency-Key already used with a different request body" }`. No key → **201** on success. Handle **P2002** race: re-read by key and return **200** or **409** accordingly.
- **`GET /blueprints`** — Query: `page` (≥1, default 1), `page_size` (1–100, default 20), `sort` optional: `name` | `version` | `created_at`, `order`: `asc` | `desc` (default `asc` when `sort` set). If `sort` omitted: order by `created_at DESC, id DESC`. Response: `{ items, page, page_size, total, total_pages }`. **Items MUST NOT include `idempotency_key`.** Invalid query → 400. `total_pages` = 0 when `total=0`.
- **`GET /blueprints/:id`** — 200 or 404 structured JSON. Non-numeric or non-positive `id` → 400. No `idempotency_key` in JSON.
- **`PUT /blueprints/:id`** — Merge update; 200 or 404. Malformed `id` → 400. Does not change `idempotency_key`.
- **`DELETE /blueprints/:id`** — 204 success; 404 if missing. Malformed `id` → 400.

### HTTP contract tests

Tests MUST assert **exact** success and error shapes: status codes, JSON fields (`error`, `message` where specified), **201 vs 200** idempotent POST, **409 conflict** body, and success payloads including `id`, `created_at` ISO string, nested `blueprint_data` (no `idempotency_key`).

## Validation

- Create: `name`, `version`, `author`, `blueprint_data` (object) required.
- List: bounded `page_size`, valid `sort`/`order`/`page`.
- `Idempotency-Key`: length ≤ 255 when non-empty after trim.

## Distributed systems & reliability (always consider)

### 1. Recovery model

PostgreSQL is the source of truth; no queue. **POST without `Idempotency-Key`** is not idempotent (retries may duplicate). **POST with key** is idempotent for successful creates: same key + same body returns **200** with original row. Uncommitted work lost on crash.

### 2. Replay capability

N/A for event streams. Idempotent POST supports safe client retries when key and payload match.

### 3. Consistency model

Per-request **read committed** against PostgreSQL; no app stale cache.

### 4. Scaling model

Stateless API; single DB. Idempotency keys are global in `blueprints` table (client may encode tenant in key string).

### 5. Failure modes

**Baseline:**

- Crash before commit: retry with idempotency key yields **200** if first commit succeeded; else **201** on first success.
- DB unavailable: **503** `{ "error": "service_unavailable", "message": "Database unavailable" }` (map Prisma connection / P1001 / P1017 where applicable).
- Pool / slow DB: timeouts → 503 where mapped.
- Queue overload: N/A.

**Task-specific named scenarios:**

1. **Invalid pagination or sort** — Bad `page`/`page_size`/`sort`/`order` → **400**, structured error.
2. **DB connection failure** — Wrong URL or DB down → **503** structured (integration test with bad `DATABASE_URL`).
3. **Malformed body or invalid `blueprint_data`** — **400**, no insert.
4. **Idempotency key conflict (different body)** — **409** `conflict`, exact message above.
5. **Concurrent POST same new idempotency key** — Unique index + P2002 handling; exactly one row; others **200** or **409**.

## Non-goals

Auth, Go CLI, catalog semantics beyond JSON storage.

## Acceptance checklist

- [ ] All five routes + malformed id handling
- [ ] Flyway V1 + V2; Prisma schema aligned
- [ ] Compose: official postgres + API build
- [ ] Idempotent POST: 200 replay, 409 conflict, optional race (P2002)
- [ ] Unit + integration; `bricks.json` in ≥1 integration test
- [ ] `ci/gh-integration-verify.sh` for GitHub Actions
