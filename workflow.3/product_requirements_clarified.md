# Product Requirements — Blueprint Manager API (Clarified)

## Primary goal

Deliver a **Node.js + TypeScript** HTTP service that persists Blueprints in **PostgreSQL** and exposes **CRUD** at base path `/blueprints`. Persistence uses an **ORM (Prisma)** for type-safe data access. Schema is owned by **Flyway** SQL migrations. **Docker Compose** runs **official `postgres:16-alpine`** plus the API image built from a local **Dockerfile**. Canonical shape for `blueprint_data` in tests is the JSON document in `assignments/bluebricks/bricks.json` (same structure as the assignment example).

## Deliverables

1. **Source code** under `assignments/bluebricks/` (TypeScript, Express, **Prisma Client** against Flyway-managed tables).
2. **Flyway** versioned migration(s) under `assignments/bluebricks/db/migration/` creating `blueprints`, indexes, and **`idempotency_key`** column with a **unique** constraint (multiple `NULL` keys allowed).
3. **`prisma/schema.prisma`** aligned with the Flyway schema (introspection or hand-maintained; `prisma generate` runs in build/CI).
4. **`docker-compose.yml`** (or `compose.yaml`) with `db` (pinned Postgres) and `api` (build from Dockerfile).
5. **`assignments/bluebricks/ci/gh-integration-verify.sh`** — idempotent: start Postgres (via Compose), run Flyway, `npm ci`, `npm run test:integration`, tear down.
6. **Unit tests** — no database; validation, pagination/sort parsing, error formatting, DTO mapping, **idempotency body comparison** if extracted as pure logic.
7. **Integration tests** — real PostgreSQL + Flyway-applied schema; HTTP-level tests; cover CRUD, pagination, sorting, 404, validation, **idempotent POST** (same key + same body → **200** on replay; same key + different body → **409**); at least one test uses `bricks.json` for create/list. **Sorting integration coverage:** at least one test MUST assert **row order** for `sort=name&order=asc` (two created rows with distinct names, ascending order verified on `name`), and at least one test MUST assert **row order** for `sort=created_at&order=asc` (two creates separated by a short wall-clock delay so `created_at` differs; ascending order verified on `created_at` timestamps and names).
8. **Task README** with run/verify, reference to **`post_agent_integration`** / `assignments/bluebricks/ci/gh-integration-verify.sh`.
9. **OOP:** A **`IBlueprintRepository`** (or equivalent) interface describing persistence operations; a **Prisma-backed implementation** class used by the HTTP layer (dependency injection at router/app construction).

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
| `idempotency_key` | `varchar`, NULLABLE, **UNIQUE** when non-null | Set only on create when client sends `Idempotency-Key`; omitted or null for creates without header |

Indexes/migration must support efficient default list sort: **`created_at DESC, id DESC`** and optional sorts by `name`, `version`, `created_at`.

### HTTP API

**Base path:** `/blueprints` (no trailing slash required).

#### `POST /blueprints`

- **Body:** JSON with `name`, `version`, `author` (strings), `blueprint_data` (object).
- **Optional header:** `Idempotency-Key` (case-insensitive per HTTP). Trim leading/trailing whitespace. **Empty or whitespace-only** after trim is treated as **absent** (normal non-idempotent create). **Maximum length 255** characters after trim; longer values → **400** `validation_error`.
- **First successful create** (new key or no key): **201** with body including `id`, `name`, `version`, `author`, `blueprint_data`, `created_at` (ISO 8601 string).
- **Replay:** Same non-empty `Idempotency-Key` as a previous **successful** create, and **equivalent** body (`name`, `version`, `author`, and deep-equal `blueprint_data`): **200** with the **same** stored resource representation (same `id` and `created_at` as the original row).
- **Conflict:** Same `Idempotency-Key` as an existing row but **non-equivalent** body: **409** with JSON `{ "error": "conflict", "message": "<human-readable>" }`.
- **Validation failure:** **400** with JSON `{ "error": "<short_code>", "message": "<human-readable>" }`.
- **Malformed JSON body** (syntactically invalid JSON with `Content-Type: application/json`): **400** with JSON `{ "error": "validation_error", "message": "Invalid JSON body" }` — not **500** `internal_error`.
- **Concurrency:** Two parallel first requests with the same new key: exactly one insert succeeds; the other must **not** create a duplicate row and must return **200** with the winner’s row if the body matches, or **409** if the body does not match the stored row.

#### `GET /blueprints`

- **Query:** `page` (integer ≥ 1, default `1`), `page_size` (integer 1–100, default `20`), `sort` (`name` | `version` | `created_at`), `order` (`asc` | `desc`, default `asc` for explicit sort; when sort omitted, default order is **`created_at` DESC, `id` DESC**).
- **Response 200:** JSON object with:
  - `items`: array of blueprint objects (same shape as single GET). **Responses MUST NOT expose `idempotency_key`** (internal column only).
  - `page`, `page_size`, `total` (total matching rows), `total_pages` (ceil(`total` / `page_size`)).

#### `GET /blueprints/:id`

- **Success 200:** single blueprint object (**no `idempotency_key` field**).
- **404:** `{ "error": "not_found", "message": "..." }` (or equivalent consistent codes).

#### `PUT /blueprints/:id`

- **Semantics:** **Merge with existing row.** Omitted top-level fields leave DB values unchanged. If `name`, `version`, or `author` appears in the body, it must be a non-empty string after trim. If `blueprint_data` appears, it must be a JSON object. **Does not** accept or change `idempotency_key` via public API (column unchanged on PUT).
- **Success 200:** updated representation (no `idempotency_key` in JSON).
- **404** if id missing.

#### `DELETE /blueprints/:id`

- **Success:** **204** No Content.
- **404** if not found.

### Validation rules

- `name`, `version`, `author`: on create, all required, non-empty after trim.
- `blueprint_data`: on create, required, type object (not array, not null).
- List query: invalid `page`, `page_size`, `sort`, or `order` → **400** with structured error JSON.
- `Idempotency-Key`: if present and non-empty after trim, length ≤ 255; else **400**.

### Input/output definitions

- **Content-Type:** `application/json` for bodies.
- **IDs in URLs:** positive integers; non-numeric or ≤0 → **400** for malformed id where applicable. **Clarified:** non-positive or non-numeric `:id` → **400** with structured error.

### Edge cases

- Empty list: `GET /blueprints` returns `items: []`, `total: 0`, `total_pages: 0`.
- `page` beyond last page: return empty `items` with correct `total`/`total_pages`.
- Duplicate names/versions: **allowed** (no uniqueness constraint on name/version).
- POST without `Idempotency-Key`: behaves as before (always **201** on success); rows may have `idempotency_key` null.
- Very large JSON in `blueprint_data`: bounded by practical limits; document default Express/body limit in README.

## Constraints

- **Determinism:** Same DB state and same request → same response; default sort must be total (`created_at DESC, id DESC`). Idempotent replay returns the same `id` and `created_at` as the original create.
- **No authentication** in scope.
- **Performance:** O(1) single-row ops; list uses indexed sort + `LIMIT`/`OFFSET` (or ORM equivalent).

## Behavior — error handling

- All enumerated errors return structured JSON `{ "error", "message" }` with appropriate 4xx/5xx.
- **500** only for unexpected failures; **503** for database unreachable (ORM/driver connection errors), with `{ "error": "service_unavailable", "message": "Database unavailable" }` where applicable (match existing contract tests).

## Visualization

**N/A:** No UI; API only.

## Distributed systems & reliability

### 1. Recovery model

**N/A (single-instance CRUD service):** No durable queue. Source of truth is PostgreSQL. After process crash, uncommitted transactions are lost; committed rows survive. API is stateless; **POST without idempotency key** is not idempotent (retries may duplicate). **POST with `Idempotency-Key`** is **idempotent for successful creates**: retries with the same key and same body return **200** and the original row.

### 2. Replay capability

**N/A** for event streams. **Idempotent POST** allows clients to safely retry creates when they reuse the same idempotency key and payload. No time-range reprocessing API.

### 3. Consistency model

**Strong consistency** per request: reads after successful write see committed data (default PostgreSQL read committed). No cross-request caching required.

### 4. Scaling model

**Single API instance** assumed for this assignment; stateless app tier can scale horizontally if connected to same DB; **idempotency keys are global** in the `blueprints` table (not scoped per tenant unless client encodes tenant in the key string).

### 5. Failure modes

**Template categories (baseline):**

- **Crash before commit:** Client receives error or timeout; retry **with** `Idempotency-Key` → **200** after recovery if first commit succeeded; if not, **201** on first successful commit.
- **DB unavailable:** API returns **503** with structured error; no partial success.
- **Stuck request / pool exhaustion:** Timeouts from driver; return **503** where detectable.

**Task-specific named scenarios (minimum 3):**

1. **Invalid pagination or sort query**  
   - **Trigger:** `page=0`, `page_size=999`, `sort=foo`, `order=sideways`.  
   - **Expected:** **400** with `{ "error", "message" }` without querying DB for list data.  
   - **Mitigation:** Validate query params before ORM query.

2. **PostgreSQL connection failure mid-request**  
   - **Trigger:** DB stopped or wrong `DATABASE_URL`.  
   - **Expected:** **503** or **500** with structured error; no silent empty results.  
   - **Mitigation:** Map ORM connection errors globally.

3. **Malformed JSON body or wrong `blueprint_data` type**  
   - **Trigger:** (a) Request body is not valid JSON (e.g. truncated `{`), or (b) `blueprint_data: null` or array on POST.  
   - **Expected:** **400** with structured `validation_error` (invalid JSON: fixed message `Invalid JSON body`; schema violations: Zod-derived message); no row inserted.  
   - **Mitigation:** Catch `express.json` / body-parser parse failures before route handlers; Zod schema validation in handler.

4. **Idempotency key conflict (different body)**  
   - **Trigger:** Reuse `Idempotency-Key` with altered `name`/`version`/`author`/`blueprint_data`.  
   - **Expected:** **409** `conflict`; no second row.  
   - **Mitigation:** Compare payload to stored row fields.

5. **Concurrent POST with same new idempotency key**  
   - **Trigger:** Parallel requests, same key, same body.  
   - **Expected:** One **201**, others **200** (or all **200** after first commit); exactly one row.  
   - **Mitigation:** Unique index on `idempotency_key`; handle unique violation by re-reading.

## Testing requirements

- **Unit:** No Docker; fast; include list/body validation as today; optional pure helper for payload equality used by idempotency.
- **Integration:** Real Postgres + Flyway; `bricks.json` used in ≥1 test; **exact** HTTP contract tests for **201/200/409** idempotency paths and **409** body shape; **assert list ordering** for `sort=name` and `sort=created_at` as specified above; **assert malformed JSON POST** returns **400** with exact `error` / `message` above.
- **Exact contract tests:** Assert HTTP status, JSON body fields for success and error paths.

## Non-goals

- Go CLI, auth, catalog semantics beyond CRUD JSON storage.
- Multi-region idempotency stores beyond single Postgres table.
