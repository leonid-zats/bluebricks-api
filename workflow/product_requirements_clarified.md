# Product Requirements — Blueprint CLI (Part 2, Clarified)

## Primary goal

Deliver a **Go** command-line program that acts as an **HTTP client only** for the existing Blueprint Manager REST API mounted at **`/blueprints`** (see `assignments/bluebricks/` Part 1). The CLI **must not** connect to PostgreSQL. It **reads/writes JSON** via HTTP and **prints API responses to stdout**; operational and error messages go to **stderr**. **`assignments/bluebricks/bricks.json`** is the canonical sample file for **`create`** and **`update`** examples in documentation and manual runs.

## Deliverables

1. **Go module** under **`assignments/bluebricks/cli/`** with **`go.mod`** (Go **1.22+**).
2. **Single binary** producible via `go build` from that module; **binary name** `blueprintctl` (documented in README).
3. **Five subcommands:** `create`, `get`, `list`, `update`, `delete` with the flags and HTTP mapping specified below.
4. **Unit tests** (`go test ./...`): pure logic (base URL resolution, flag/id validation) without network; **at least one** test using **`net/http/httptest`** asserting correct **method**, **path**, **query string**, and **response body on stdout** for **one** command (**`get`** or **`list`**).
5. **Task README** update: build command, env/flags, example invocations for all five commands using **`http://localhost:3000`** and **`bricks.json`** where applicable; note **`post_agent_integration`** / **`ci/gh-integration-verify.sh`** for API verification (unchanged).

## Functional requirements

### Configuration — base URL

- **Default base URL:** **`http://localhost:3000`**
- **Environment variable:** **`BLUEPRINTS_API_BASE`** — if set and non-empty after trim, used unless overridden by flag.
- **Global flag:** **`--base-url <string>`** — if provided non-empty, overrides env and default.
- **Resolution order:** **`--base-url`** (non-empty) **>** **`BLUEPRINTS_API_BASE`** (non-empty) **>** default.
- **Path joining:** Requests must target **`{resolvedBase}/blueprints`** and **`{resolvedBase}/blueprints/{id}`**. The implementation **must normalize** the base so that a trailing slash on the base does **not** produce double slashes (e.g. base `http://localhost:3000/` + path `/blueprints` → `http://localhost:3000/blueprints`).

### Commands

| Command | Required flags | Optional flags | HTTP | Success (exit **0**) |
|---------|----------------|----------------|------|----------------------|
| **create** | **`--file <path>`** | **`--idempotency-key <string>`** | **`POST`** `{base}/blueprints`, body = raw file bytes, `Content-Type: application/json`; if `--idempotency-key` set, send header **`Idempotency-Key:`** value | Print **full response body** (JSON) to **stdout**. |
| **get** | **`--id <id>`** | — | **`GET`** `{base}/blueprints/{id}` | Print resource JSON to **stdout**. |
| **list** | **`--page <n>`**, **`--page-size <n>`** | **`--sort`**, **`--order`** | **`GET`** `{base}/blueprints?page=<n>&page_size=<n>` and, when optional flags present, **`&sort=`** and **`&order=`** | Print **full list JSON** (`items`, `page`, `page_size`, `total`, `total_pages`) to **stdout**. |
| **update** | **`--id <id>`**, **`--file <path>`** | — | **`PUT`** `{base}/blueprints/{id}`, body = raw file bytes, `Content-Type: application/json` | Print updated resource JSON to **stdout**. |
| **delete** | **`--id <id>`** | — | **`DELETE`** `{base}/blueprints/{id}` | On **204**: print **nothing** to **stdout** (no confirmation line). Exit **0**. |

### File payloads (`--file`)

- Read file as **UTF-8** text; send bytes as request body (API validates JSON).
- **Missing** file, **permission denied**, or **read error:** clear message on **stderr**, exit **1** (before HTTP).

### ID and pagination validation (client-side before HTTP)

- **`--id`:** Must match **positive integer** string: decimal digits only, numeric value **≥ 1** (equivalent to API: reject `0`, negative, non-numeric). On failure: **stderr** message, exit **1**.
- **`--page`:** Integer **≥ 1**. On failure: **stderr**, exit **1**.
- **`--page-size`:** Integer **1–100** inclusive. On failure: **stderr**, exit **1**.
- **`--sort` (list, optional):** If present, value must be exactly **`name`**, **`version`**, or **`created_at`**. On failure: **stderr**, exit **1**.
- **`--order` (list, optional):** If present, value must be exactly **`asc`** or **`desc`**. On failure: **stderr**, exit **1**.
- If **`--order`** is set without **`--sort`:** **stderr** error (invalid combination), exit **1**.

### HTTP status and I/O conventions

- **2xx:** As per command table; print response body to **stdout** only when specified (delete 204 prints nothing).
- **4xx / 5xx:** Print the **response body** (if any; may be empty) to **stderr** verbatim (raw bytes as received). Exit **`1`** for **4xx**. Exit **`2`** for **5xx**.
- **Network errors** (connection refused, timeout, DNS failure, TLS handshake failure): message on **stderr** including underlying cause; exit **`2`**.

### Non-goals

- Auth, config files, interactive prompts, TUI, bundling the Node API, publishing to a proxy.

## Validation rules

- All pre-HTTP validations above are **deterministic**; same argv + env → same exit code and same stderr text for validation failures (fixed error strings allowed).
- HTTP layer: no mutation of response bodies for success output (pass-through).

## Edge cases

- **Empty response body** on 4xx/5xx: still non-zero exit; stderr may be empty aside from optional wrapper — **clarified:** print nothing extra beyond raw body to stderr; if body empty, stderr can be empty.
- **Base URL** with only scheme/host and no path vs with path: joining must still produce correct `/blueprints` under the origin root (use **`net/url`** resolve against **`/blueprints`** path).
- **List:** `page` beyond last page returns **200** with empty `items` per API; CLI prints that JSON (success).

## Constraints

- **Determinism:** Same API state + same CLI args → same stdout for success paths; validation errors are fixed messages.
- **Performance:** Linear in response body size; no unbounded in-memory caching of unrelated data.
- **Limits:** Delegate oversized payloads to API; client may use default `http.Client` timeout **clarified: 60 seconds** for entire request (document in README).

## Behavior — error handling

- **Usage** errors (unknown flag, missing required flag): Cobra prints usage to **stderr**; exit **`1`**.
- **Validation** errors (bad id, page, etc.): explicit **stderr** line(s), exit **`1`**.
- **HTTP 4xx/5xx** as above.

## Visualization

**N/A:** CLI text only; no separate visualization layer. Core = HTTP + argv/env; output is pass-through of API JSON.

## Distributed systems & reliability

### 1. Recovery model

**N/A (stateless CLI process):** No server-side queue or durable log in the CLI. The **API** (Part 1) is the authority; retries are manual or scripted. **`POST` with `Idempotency-Key`** remains the server’s mechanism for safe create retries when clients reuse the same key and body.

### 2. Replay capability

**N/A** for the CLI as a product (no internal event log). Operators may re-run **`list`** / **`get`** against the API; **`create`** replay semantics follow the API (**201** vs **200** with idempotency header).

### 3. Consistency model

**Strong per request:** Each command performs a single HTTP round-trip; stdout reflects the HTTP response body for that snapshot. No cross-command caching.

### 4. Scaling model

**Single-user CLI:** Many instances may run concurrently against the same API; **no shared local state** required. Rate limits or DB contention are server concerns; CLI surfaces **4xx/5xx** or timeouts.

### 5. Failure modes

**Template categories (baseline) — client interpretation:**

- **Crash before response:** User sees partial stdout or none; **no durable CLI queue**; user must retry the command.
- **API unreachable:** **stderr** + exit **2**; user verifies `BLUEPRINTS_API_BASE` / network / `docker compose`.
- **Stale read:** **`get`** after concurrent **`delete`** may return **404**; expected API behavior.

**Task-specific production-aligned scenarios (minimum 3):**

1. **Invalid `--id` before request**  
   - **Trigger:** `--id 0`, `--id -1`, `--id abc`.  
   - **Expected:** **stderr** message; exit **1**; **no** HTTP call.  
   - **Mitigation:** Document valid id format; fix script args.

2. **`--file` missing or unreadable**  
   - **Trigger:** wrong path, permission denied.  
   - **Expected:** **stderr**; exit **1**; no HTTP.  
   - **Mitigation:** Check path and permissions.

3. **API returns 4xx (validation or not found)**  
   - **Trigger:** e.g. **`get`** unknown id, **`list`** with invalid params passed through (should not happen if CLI validates list params) or server-side validation changes.  
   - **Expected:** Response body to **stderr**; exit **1**.  
   - **Mitigation:** Fix input or server data.

4. **Network partition / connection refused**  
   - **Trigger:** API down, wrong port.  
   - **Expected:** **stderr** with error; exit **2**.  
   - **Mitigation:** Start API, verify `--base-url`.

5. **API 5xx or server timeout**  
   - **Trigger:** DB down (503 from API), overload.  
   - **Expected:** Body (if any) to **stderr**; exit **2**.  
   - **Mitigation:** Ops fixes backend; retry with backoff at orchestration layer.

## Testing requirements

- **`go test ./...`** passes **without Docker**.
- **httptest** test: spin mock server; run client code path for **`get`** or **`list`**; assert method, path, query, and captured stdout contains expected JSON substring.
- **Unit:** base URL trimming/join; positive id regex; page/page_size bounds; sort/order optional rules.

## Acceptance checklist

- [ ] `go build -o blueprintctl ./cmd/blueprintctl` (or documented equivalent) succeeds.
- [ ] All five commands with required flags.
- [ ] Base URL: env + flag + default; no double slashes.
- [ ] Optional **`--idempotency-key`** on **create**; optional **`--sort`** / **`--order`** on **list**.
- [ ] Exit codes: **0** success; **1** usage/validation/**4xx**; **2** network/**5xx**.
- [ ] **204 delete:** no stdout.
- [ ] README examples use **`bricks.json`**.

---

## Appendix: Blueprint Manager API (Part 1, reference)

Preserved for CLI implementers. The live HTTP contract is implemented under `assignments/bluebricks/src/` and covered by integration tests.


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
