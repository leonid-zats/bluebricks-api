# Product Requirements — Blueprint Manager API (Clarified)

## Primary goal

Deliver a **Node.js + TypeScript** HTTP service that persists Blueprints in **PostgreSQL** and exposes **CRUD** at base path `/blueprints`. Schema is owned by **Flyway** SQL migrations. **Docker Compose** runs **official `postgres:16-alpine`** plus the API image built from a local **Dockerfile**. Canonical shape for `blueprint_data` in tests is the JSON document in `assignments/bluebricks/bricks.json` (same structure as the assignment example).

## Deliverables

1. **Source code** under `assignments/bluebricks/` (TypeScript, parameterized SQL via `pg`).
2. **Flyway** versioned migration(s) under `assignments/bluebricks/db/migration/` creating `blueprints` and indexes.
3. **`docker-compose.yml`** (or `compose.yaml`) with `db` (pinned Postgres) and `api` (build from Dockerfile).
4. **`assignments/bluebricks/ci/gh-integration-verify.sh`** — idempotent: start Postgres (via Compose), run Flyway, `npm ci`, `npm run test:integration`, tear down.
5. **Unit tests** — no database; validation, pagination/sort parsing, error formatting, DTO mapping.
6. **Integration tests** — real PostgreSQL + Flyway-applied schema; HTTP-level or repository-level with real pool; cover CRUD, pagination, sorting, 404, validation; at least one test uses `bricks.json` for create/list.
7. **Task README** with run/verify, reference to **`post_agent_integration`** / `assignments/bluebricks/ci/gh-integration-verify.sh`.

## Functional requirements

### Data model — table `blueprints`

| Column | Type | Rules |
|--------|------|--------|
| `id` | `serial` / `identity`, PK | Returned as numeric `id` in JSON |
| `name` | `varchar`, NOT NULL | Required on create; on PUT if present, non-empty after trim |
| `version` | `varchar`, NOT NULL | Same as `name` |
| `author` | `varchar`, NOT NULL | Same as `name` |
| `blueprint_data` | `JSONB`, NOT NULL | JSON object on create; on PUT if present, must be object |
| `created_at` | `timestamptz`, NOT NULL | Set on insert only; never updated by PUT |

Indexes/migration must support efficient default list sort: **`created_at DESC, id DESC`** and optional sorts by `name`, `version`, `created_at`.

### HTTP API

**Base path:** `/blueprints` (no trailing slash required).

#### `POST /blueprints`

- **Body:** JSON with `name`, `version`, `author` (strings), `blueprint_data` (object).
- **Success:** **201** with body including `id`, `name`, `version`, `author`, `blueprint_data`, `created_at` (ISO 8601 string).
- **Validation failure:** **400** with JSON `{ "error": "<short_code>", "message": "<human-readable>" }`.

#### `GET /blueprints`

- **Query:** `page` (integer ≥ 1, default `1`), `page_size` (integer 1–100, default `20`), `sort` (`name` | `version` | `created_at`), `order` (`asc` | `desc`, default `asc` for explicit sort; when sort omitted, default order is **`created_at` DESC, `id` DESC**).
- **Response 200:** JSON object with:
  - `items`: array of blueprint objects (same shape as single GET).
  - `page`, `page_size`, `total` (total matching rows), `total_pages` (ceil(`total` / `page_size`)).

#### `GET /blueprints/:id`

- **Success 200:** single blueprint object.
- **404:** `{ "error": "not_found", "message": "..." }` (or equivalent consistent codes).

#### `PUT /blueprints/:id`

- **Semantics:** **Merge with existing row.** Omitted top-level fields leave DB values unchanged. If `name`, `version`, or `author` appears in the body, it must be a non-empty string after trim. If `blueprint_data` appears, it must be a JSON object.
- **Success 200:** updated representation.
- **404** if id missing.

#### `DELETE /blueprints/:id`

- **Success:** **204** No Content.
- **404** if not found.

### Validation rules

- `name`, `version`, `author`: on create, all required, non-empty after trim.
- `blueprint_data`: on create, required, type object (not array, not null).
- List query: invalid `page`, `page_size`, `sort`, or `order` → **400** with structured error JSON.

### Input/output definitions

- **Content-Type:** `application/json` for bodies.
- **IDs in URLs:** positive integers; non-numeric or ≤0 → **400** for malformed id where applicable, or treat as not found per implementation (must be documented and tested consistently). **Clarified:** non-positive or non-numeric `:id` → **400** with structured error.

### Edge cases

- Empty list: `GET /blueprints` returns `items: []`, `total: 0`, `total_pages: 0` (or `0` pages — use **0** for `total_pages` when `total` is 0).
- `page` beyond last page: return empty `items` with correct `total`/`total_pages`.
- Duplicate names/versions: **allowed** (no uniqueness constraint required unless specified).
- Very large JSON in `blueprint_data`: bounded by practical limits; document default Express/body limit in README.

## Constraints

- **Determinism:** Same DB state and same request → same response; default sort must be total (`created_at DESC, id DESC`).
- **No authentication** in scope.
- **Performance:** O(1) single-row ops; list uses indexed sort + `LIMIT`/`OFFSET` (or equivalent).

## Behavior — error handling

- All enumerated errors return structured JSON `{ "error", "message" }` with appropriate 4xx/5xx.
- **500** only for unexpected DB/connection failures; message may be generic in production but tests may assert status only for simulated failures where applicable.

## Visualization

**N/A:** No UI; API only.

## Distributed systems & reliability

### 1. Recovery model

**N/A (single-instance CRUD service):** No durable queue. Source of truth is PostgreSQL. After process crash, uncommitted transactions are lost; committed rows survive. API is stateless; recovery is reconnecting to DB and replaying client retries (clients may retry POST and create duplicates unless they use idempotency keys — **out of scope**; document that POST is not idempotent).

### 2. Replay capability

**N/A:** No event log or stream reprocessing. Operators may re-run Flyway on empty DB and re-seed data manually.

### 3. Consistency model

**Strong consistency** per request: reads after successful write see committed data (default PostgreSQL read committed). No cross-request caching required.

### 4. Scaling model

**Single API instance** assumed for this assignment; stateless app tier can scale horizontally if connected to same DB; connection pool sizing is the shared limiter.

### 5. Failure modes

**Template categories (baseline):**

- **Crash before commit:** Client receives error or timeout; may retry POST → possible duplicate rows (**accepted** for this scope).
- **DB unavailable:** API returns **503** or **500** with structured error; no partial success.
- **Stuck request / pool exhaustion:** Timeouts from driver; return **503** where detectable.

**Task-specific named scenarios (minimum 3):**

1. **Invalid pagination or sort query**  
   - **Trigger:** `page=0`, `page_size=999`, `sort=foo`, `order=sideways`.  
   - **Expected:** **400** with `{ "error", "message" }` without querying DB.  
   - **Mitigation:** Validate query params before SQL.

2. **PostgreSQL connection failure mid-request**  
   - **Trigger:** DB stopped or wrong `DATABASE_URL`.  
   - **Expected:** **503** or **500** with structured error; no silent empty results.  
   - **Mitigation:** Health check / monitoring; integration tests document expected failure class.

3. **Malformed JSON body or wrong `blueprint_data` type**  
   - **Trigger:** `blueprint_data: null` or array on POST.  
   - **Expected:** **400** with clear message; no row inserted.  
   - **Mitigation:** Schema validation in handler.

4. **Concurrent PUTs to same id**  
   - **Trigger:** Two PUTs in parallel.  
   - **Expected:** Last committed write wins (read committed).  
   - **Mitigation:** Document semantics; optional future optimistic locking out of scope.

## Testing requirements

- **Unit:** No Docker; fast.
- **Integration:** Real Postgres + Flyway; `bricks.json` used in ≥1 test.
- **Exact contract tests:** Assert HTTP status, JSON body fields for success and error paths for create validation, get 404, list validation.

## Non-goals

- Go CLI, auth, catalog semantics beyond CRUD JSON storage.
