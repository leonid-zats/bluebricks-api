# Requirements — Blueprint CLI (Part 2, implementation)

**Source:** `workflow/product_requirements_clarified.md` (authoritative). The Part 1 HTTP API lives under `assignments/bluebricks/src/` and is **not** modified for this task except as needed for unrelated fixes (none required). Paths below for the CLI are under **`assignments/bluebricks/cli/`**.

## Primary goal

**Go** CLI (**HTTP client only**) calling the Blueprint Manager API at **`{base}/blueprints`**. No Postgres. Success JSON to **stdout**; errors and API error bodies to **stderr** per conventions below. **`../bricks.json`** (from `cli/` working directory: `assignments/bluebricks/bricks.json`) is the canonical sample for **create** / **update** in README examples.

## Deliverables

1. Go module at **`assignments/bluebricks/cli/`** with **`go.mod`** (Go **≥ 1.22**).
2. **`cmd/blueprintctl/main.go`** entrypoint; **`go build -o blueprintctl ./cmd/blueprintctl`** produces binary **`blueprintctl`**.
3. Subcommands: **`create`**, **`get`**, **`list`**, **`update`**, **`delete`** with flags and HTTP mapping in the table below.
4. **`go test ./...`** (no Docker): unit tests for URL resolution, validation; **≥ 1** **`httptest.Server`** test asserting method, path, query (for **`list`** or **`get`**), and stdout content.
5. **`assignments/bluebricks/README.md`**: CLI build, env **`BLUEPRINTS_API_BASE`**, flag **`--base-url`**, examples for all five commands using **`http://localhost:3000`** and **`bricks.json`**; reference **`scripts/run-integration-tests.sh`** and the **Tests** section in **`README.md`** for API verification.

## Functional requirements

### Base URL

- Default: **`http://localhost:3000`**
- Env: **`BLUEPRINTS_API_BASE`** (non-empty after trim wins over default).
- Flag: **`--base-url`** on root (persistent flag for subcommands): non-empty overrides env and default.
- Join **`/blueprints`** and **`/blueprints/{id}`** without double slashes (normalize trailing slash on base).

### Commands

| Command | Flags | HTTP | Success |
|---------|--------|------|---------|
| **create** | **`--file`**, optional **`--idempotency-key`** | **POST** `{base}/blueprints`, `Content-Type: application/json`, body = file bytes; header **`Idempotency-Key`** if flag set | Print response body to **stdout**; exit **0** |
| **get** | **`--id`** | **GET** `{base}/blueprints/{id}` | Print JSON to **stdout**; exit **0** |
| **list** | **`--page`**, **`--page-size`**, optional **`--sort`**, **`--order`** | **GET** `{base}/blueprints?page=&page_size=` + optional `sort` & `order` | Print full list JSON to **stdout**; exit **0** |
| **update** | **`--id`**, **`--file`** | **PUT** `{base}/blueprints/{id}` | Print JSON to **stdout**; exit **0** |
| **delete** | **`--id`** | **DELETE** `{base}/blueprints/{id}` | **204:** print **nothing** to **stdout**; exit **0** |

### Client-side validation (before HTTP)

- **`--id`:** positive integer string (digits only, value ≥ 1). Else stderr + exit **1**.
- **`--page`:** integer ≥ **1**. Else stderr + exit **1**.
- **`--page-size`:** integer **1–100**. Else stderr + exit **1**.
- **`--sort`:** if set, one of **`name`**, **`version`**, **`created_at`**. Else stderr + exit **1**.
- **`--order`:** if set, **`asc`** or **`desc`**. Else stderr + exit **1**.
- **`--order` without `--sort`:** stderr + exit **1**.
- **`--file`:** must exist and be readable; else stderr + exit **1**.

### HTTP error semantics

- **2xx:** as above.
- **4xx:** write response body to **stderr** (raw); exit **1**.
- **5xx:** write response body to **stderr** (raw); exit **2**.
- **Network / timeout / TLS / DNS:** stderr with cause; exit **2**.
- **`http.Client` timeout:** **60 seconds** per request (document in README).

### CLI / usage errors

- Cobra usage errors: stderr; exit **1**.

## HTTP contract tests (CLI)

Tests MUST assert **exact** exit codes (**0** / **1** / **2**) and that **4xx** and **5xx** responses produce **stderr** containing the API body (where a body is returned). **httptest** test MUST assert **method**, **URL path**, **query string** for **`list`** (or **`get`**), and **stdout** for success JSON.

## Distributed systems & reliability (always consider)

### 1. Recovery model

**N/A:** Stateless CLI; no local durable queue. Safe **create** retries use server **`Idempotency-Key`** when user passes **`--idempotency-key`**.

### 2. Replay capability

**N/A** for CLI-internal replay. User may re-run commands; API defines **POST** replay (**200** vs **201**).

### 3. Consistency model

Single HTTP request per invocation; **strong** per-response snapshot (whatever the API returns).

### 4. Scaling model

**N/A** beyond “many CLI processes may call one API”; no shared CLI state.

### 5. Failure modes

**Baseline (template):**

- **Crash before response:** partial stdout possible; user retries manually.
- **API / DB unavailable:** exit **2**; stderr shows network or **5xx** body.
- **Queue overload:** N/A in CLI.

**Task-specific named scenarios** (minimum 3 — tests or manual steps in `plan.md`):

1. **Invalid `--id` (client validation)** — Trigger: `--id 0` / non-numeric. Expected: **stderr**, exit **1**, **no** HTTP. Mitigation: fix args.
2. **Unreadable `--file`** — Trigger: missing path. Expected: **stderr**, exit **1**, no HTTP. Mitigation: fix path.
3. **API **404** on get** — Trigger: unknown id. Expected: **stderr** has JSON body, exit **1**. Mitigation: correct id.
4. **Connection refused** — Trigger: API down. Expected: **stderr**, exit **2**. Mitigation: start API / fix base URL.
5. **API **503** (e.g. DB down)** — Trigger: server error. Expected: body to **stderr**, exit **2**. Mitigation: restore DB.

## Non-goals

Auth, config files, TUI, embedding Node, module proxy publish.

## Acceptance checklist

- [ ] `go build` produces **`blueprintctl`**
- [ ] All five commands + optional flags
- [ ] Base URL env + flag + slash normalization
- [ ] `go test ./...` passes without Docker; includes **httptest**
- [ ] README: **`bricks.json`** examples + run instructions
