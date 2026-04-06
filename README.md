# Blueprint Manager API (Bluebricks — Part 1)

Assignment brief: see `requirements/requirements.md` (Part 1) and `requirements/cli-implementation.md` (CLI implementation spec). Part 2 assignment text: `requirements/requirements-part2.md`.

## Contents

- [Agentic runs (workflow snapshots)](#agentic-runs-workflow-snapshots)
- [Stack](#stack)
- [Third-party dependencies](#third-party-dependencies)
- [Environment](#environment)
- [Quick Start (Docker)](#quick-start-docker)
- [Quick Start (No Docker)](#quick-start-no-docker)
- [API (summary)](#api-summary)
- [Run with Docker Compose](#run-with-docker-compose)
- [Run without Docker (local Node)](#run-without-docker-local-node)
- [Tests](#tests)
- [Canonical example payload](#canonical-example-payload)
- [Blueprint CLI (Part 2 — Issue #65)](#blueprint-cli-part-2--issue-65)
  - [Build and test (CLI)](#build-and-test-cli)
  - [Example invocations (API at `http://localhost:3000`)](#example-invocations-api-at-httplocalhost3000)
- [Implementation Summary](#implementation-summary)
- [Key Decisions](#key-decisions)
- [Run & Verify Locally](#run--verify-locally)

## Agentic runs (workflow snapshots)

This repository was built across **four** agentic passes (issue-driven Cursor runs). Each pass produced a self-contained copy of the product workflow artifacts under its own folder. Together they form a chronological trail: clarified requirements, implementation plan, decision log, and validation report for that run.

| Run | Workflow folder | Scope | Summary |
|-----|-----------------|-------|---------|
| 1 | [`workflow.1/`](workflow.1/) | Part 1 API baseline (Issue #59) | Initial Blueprint Manager API: Express, `pg`, Zod, Flyway `V1__create_blueprints.sql`, Docker Compose (`db` / `flyway` / `api`), Vitest unit + integration suites, and `ci/gh-integration-verify.sh` for `post_agent_integration`. |
| 2 | [`workflow.2/`](workflow.2/) | ORM, OOP, idempotent POST (Issue #61) | Migrated persistence to **Prisma** with **`IBlueprintRepository`**, Flyway **`V2__add_idempotency_key.sql`**, and **`Idempotency-Key`** semantics (201 / 200 / 409); public JSON omits `idempotency_key`. |
| 3 | [`workflow.3/`](workflow.3/) | Sort tests + JSON errors (Issue #63) | Integration tests assert **list row order** for `sort=name` and `sort=created_at`; **malformed JSON** on `POST /blueprints` maps to **400** `validation_error` / `Invalid JSON body` via **`isMalformedJsonBodyError`**. |
| 4 | [`workflow.4/`](workflow.4/) | Go CLI + CI hook (Issue #65) | **`cli/`** **`blueprintctl`**: Cobra, `net/http`, base URL via env/flag, **httptest** coverage, README examples with **`bricks.json`**; **`ci/gh-integration-verify.sh`** runs **`go test ./...`** in **`cli/`** when Go is available. |

Inside each folder you will find the same five files: `product_requirements_clarified.md`, `requirements.md`, `plan.md`, `decision_log.md`, and `validation.md`. Paths inside those snapshots may still mention historical `assignments/bluebricks/` layout; the **current** tree is the repository root shown here.

Validation reports only: [Run 1](workflow.1/validation.md) · [Run 2](workflow.2/validation.md) · [Run 3](workflow.3/validation.md) · [Run 4](workflow.4/validation.md).

## Stack

- Node.js 18+, TypeScript, Express 5, **Prisma** (`@prisma/client`), Zod  
- PostgreSQL **16** (`postgres:16-alpine`)  
- Schema: **Flyway** SQL in `db/migration/` (source of truth); **`prisma/schema.prisma`** mirrors tables for the ORM (`npm run build` runs `prisma generate`)  
- **Docker Compose**: `db`, one-shot `flyway`, and `api` (see `docker-compose.yml`)

## Third-party dependencies

Libraries and tools pulled in via **`package.json`** and **`cli/go.mod`**. Base images (Node, Postgres, Flyway in Docker) are omitted here.

### Node.js (`package.json`)

| Package | Kind | Summary |
|---------|------|---------|
| `@prisma/client` | runtime | Generated Prisma Client for type-safe queries against PostgreSQL. |
| `express` | runtime | HTTP server, routing, and middleware (including JSON body parsing). |
| `zod` | runtime | Schema validation for request bodies and list query parameters. |
| `prisma` | dev / build | CLI for `prisma generate` (runs on `npm run build` / `postinstall`). |
| `typescript` | dev / build | Compiles TypeScript to JavaScript in `dist/`. |
| `vitest` | dev / test | Unit and integration test runner. |
| `supertest` | dev / test | HTTP-level assertions against the Express app in tests. |
| `tsx` | dev | Runs TypeScript directly for `start:dev` / watch workflows. |
| `@types/express` | dev | TypeScript typings for Express. |
| `@types/node` | dev | TypeScript typings for Node.js APIs. |
| `@types/supertest` | dev | TypeScript typings for Supertest. |

### Go (`cli/go.mod`)

| Module | Kind | Summary |
|--------|------|---------|
| `github.com/spf13/cobra` | direct | CLI framework: subcommands (`create`, `get`, …) and persistent flags. |
| `github.com/spf13/pflag` | transitive | POSIX-style flag parsing used by Cobra. |
| `github.com/inconshreveable/mousetrap` | transitive | Windows console helper bundled with Cobra for nicer CLI behavior. |

## Environment

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (required for `npm start` / tests) |
| `PORT` | HTTP port (default `3000`) |

Default local URL when using Compose for the API: `http://localhost:3000`.

## Quick Start (Docker)

From `repository root`:

```bash
docker compose up --build
```

Verify the API:

```bash
curl http://localhost:3000/blueprints?page=1&page_size=20
```

## Quick Start (No Docker)

Prerequisite: a running PostgreSQL instance and a valid `DATABASE_URL`.

```bash
npm ci
npm run build
npm start
```

Run migrations before first start (Flyway runs in Docker):

```bash
bash scripts/migrate-flyway.sh
```

## API (summary)

Base path: `/blueprints`

- `POST /blueprints` — create (**201**). Optional header **`Idempotency-Key`**: same key + same JSON body as an existing successful create → **200** with the same `id` / `created_at`; same key + different body → **409** `{ "error": "conflict", "message": "..." }`. Empty/whitespace key is ignored (normal create). Key max length **255** after trim.  
- `GET /blueprints?page=&page_size=&sort=&order=` — list with pagination (`sort`: `name` \| `version` \| `created_at`; default order: `created_at DESC, id DESC`)  
- `GET /blueprints/:id` — single (404 JSON if missing; 400 if id invalid)  
- `PUT /blueprints/:id` — merge update  
- `DELETE /blueprints/:id` — 204  

Responses do **not** include the internal `idempotency_key` column.

Validation errors: **400** with `{ "error": "validation_error", "message": "..." }`. **Malformed JSON** (invalid syntax with `Content-Type: application/json`): **400** with `{ "error": "validation_error", "message": "Invalid JSON body" }`. Idempotency key too long: **400** `validation_error`. DB unreachable: **503** with `{ "error": "service_unavailable", "message": "Database unavailable" }`.

## Run with Docker Compose

From `repository root`:

```bash
docker compose up --build
```

Flyway runs once against `db` before `api` starts. Postgres is exposed on host port **5432**.

## Run without Docker (local Node)

Start Postgres yourself and set `DATABASE_URL`, then:

```bash
npm ci
bash scripts/migrate-flyway.sh   # requires Docker for flyway/flyway image
npm run build
npm start
```

## Tests

```bash
npm ci
npm run test:unit          # no database
```

Integration tests need Postgres on `DATABASE_URL` (default `postgresql://blueprint:blueprint@127.0.0.1:5432/blueprints`) and Docker for Flyway:

```bash
docker compose up -d db
# wait for healthy
npm run test:integration
docker compose down -v
```

The integration script runs Flyway then Vitest unless `SKIP_FLYWAY_INTEGRATION=1` (used by `ci/gh-integration-verify.sh` after Flyway already ran).

## Canonical example payload

`bricks.json` matches the assignment’s example and is used in integration tests.

---

## Blueprint CLI (Part 2 — Issue #65)

Go module under **`cli/`**: **`blueprintctl`** talks to this API over HTTP only (no direct Postgres). Requires **Go 1.22+**.

| Setting | Description |
|---------|-------------|
| `BLUEPRINTS_API_BASE` | API base URL (default **`http://localhost:3000`**) |
| `--base-url` | Global flag; non-empty value overrides the env var and default |

Trailing slashes on the base URL are normalized so paths resolve to **`{base}/blueprints`** and **`{base}/blueprints/{id}`** without double slashes.

**Exit codes:** **0** success; **1** usage / client-side validation / **4xx**; **2** network errors / **5xx**. Successful JSON responses are printed to **stdout**. API error bodies (**4xx** / **5xx**) are printed to **stderr**. **`delete`** on **204** prints nothing to **stdout**. Each HTTP call uses a **60-second** client timeout.

### Build and test (CLI)

```bash
cd cli
go test ./...
go build -o blueprintctl ./cmd/blueprintctl
```

### Example invocations (API at `http://localhost:3000`)

With the API running (e.g. `docker compose up --build` from `repository root`), from **`cli/`**:

```bash
export BLUEPRINTS_API_BASE=http://localhost:3000

./blueprintctl create --file ../bricks.json
./blueprintctl create --file ../bricks.json --idempotency-key my-key-1

./blueprintctl list --page 1 --page-size 20
./blueprintctl list --page 1 --page-size 20 --sort name --order asc

./blueprintctl get --id 1
./blueprintctl update --id 1 --file ../bricks.json
./blueprintctl delete --id 1
```

---

## Implementation Summary

The service uses **Prisma** for all database access, with **`IBlueprintRepository`** implemented by **`PrismaBlueprintRepository`**. Flyway migration **`V2__add_idempotency_key.sql`** adds a nullable, uniquely indexed **`idempotency_key`** column. **`POST /blueprints`** reads the **`Idempotency-Key`** header: duplicate key with matching body returns **200** and the original row; duplicate key with a different body returns **409**. Concurrent creates with the same new key rely on the unique index and **P2002** handling. List queries use Prisma `orderBy` with fixed sort branches (no user-controlled SQL fragments). The **Dockerfile** copies **`prisma/`** before **`npm ci`** so `postinstall` can run `prisma generate`, and copies the generated **`.prisma`** engine from the build stage into the production image.

**Issue #63:** Integration tests assert **row order** for **`sort=name&order=asc`** and **`sort=created_at&order=asc`**. Invalid JSON bodies on POST are mapped in **`blueprintErrorHandler`** from Express body-parser’s **`entity.parse.failed`** (**400**) to **`{ "error": "validation_error", "message": "Invalid JSON body" }`** so clients never see **500** for a simple syntax error.

**Issue #65:** The **`cli/`** Go module implements **`blueprintctl`** with **Cobra** subcommands (**create**, **get**, **list**, **update**, **delete**), **`net/http`**, and **`httptest`**-backed tests for request shape and exit codes. **`ci/gh-integration-verify.sh`** runs **`go test ./...`** in **`cli/`** when **`go`** is on `PATH` so GitHub-hosted runners exercise the CLI alongside the Node integration suite.

## Key Decisions

- **Prisma** as the ORM (issue #61); **Flyway** remains authoritative for DDL.  
- **`IBlueprintRepository`** + **`PrismaBlueprintRepository`** for OOP boundaries.  
- **Idempotency** via **`Idempotency-Key`** header + DB unique constraint + payload deep equality (`util.isDeepStrictEqual` on `blueprint_data`).  
- **Public JSON omits `idempotency_key`.**  
- **`isMalformedJsonBodyError`** (issue #63) detects body-parser JSON parse failures and returns structured **400** like other validation errors.  
- **Integration sort tests** (issue #63) filter rows by unique name prefix and assert ordering ( **`page_size` ≤ 100** per API rules).  
- **Issue #65 — `blueprintctl`:** **Cobra** CLI, **`internal/runner`** (commands + exit mapping), **`internal/client`** (**60s** timeout), **`internal/config`** / **`internal/urls`** / **`internal/validate`**; **4xx → stderr + exit 1**, **5xx / network → stderr + exit 2**; **`delete` 204** silent **stdout**.  

## Run & Verify Locally

```bash
npm ci
npm run test:unit
bash ci/gh-integration-verify.sh
npm run build
docker compose build api
cd cli && go test ./...
```

Expected: unit tests pass (Vitest **19** tests in `tests/unit/`); integration script runs Flyway (if needed), integration tests pass, **`go test ./...`** in **`cli/`** passes when Go is available, Compose teardown succeeds; TypeScript build succeeds; API image builds successfully.
