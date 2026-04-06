# Blueprint Manager API (Bluebricks — Part 1)

Assignment brief: see `requirements.md` in this folder and `workflow/requirements.md` for the implementation spec.

## Stack

- Node.js 18+, TypeScript, Express 5, `pg`, Zod  
- PostgreSQL **16** (`postgres:16-alpine`)  
- Schema: **Flyway** SQL in `db/migration/`  
- **Docker Compose**: `db`, one-shot `flyway`, and `api` (see `docker-compose.yml`)

## Environment

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (required for `npm start` / tests) |
| `PORT` | HTTP port (default `3000`) |

Default local URL when using Compose for the API: `http://localhost:3000`.

## API (summary)

Base path: `/blueprints`

- `POST /blueprints` — create (201)  
- `GET /blueprints?page=&page_size=&sort=&order=` — list with pagination (`sort`: `name` \| `version` \| `created_at`; default order: `created_at DESC, id DESC`)  
- `GET /blueprints/:id` — single (404 JSON if missing; 400 if id invalid)  
- `PUT /blueprints/:id` — merge update  
- `DELETE /blueprints/:id` — 204  

Validation errors: **400** with `{ "error": "validation_error", "message": "..." }`. DB unreachable: **503** with `{ "error": "service_unavailable", "message": "Database unavailable" }`.

## Run with Docker Compose

From `assignments/bluebricks/`:

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

## Post-agent CI (GitHub)

After an issue-triggered agent run, workflow **Cursor - label trigger** (`.github/workflows/cursor-label.yml`) runs job **`post_agent_integration`**, which executes `assignments/bluebricks/ci/gh-integration-verify.sh` when present. That script brings up `db`, runs Flyway via Docker, runs `npm ci` and `npm run test:integration`, then tears down volumes.

## Canonical example payload

`bricks.json` matches the assignment’s example and is used in integration tests.

---

## Implementation Summary

The service is a small Express app with a `BlueprintRepository` using parameterized SQL. List queries are validated with Zod (`page`, `page_size` 1–100, optional `sort` / `order`); `ORDER BY` uses a fixed whitelist to avoid injection. `PUT` merges provided fields with the existing row without changing `created_at`. A global error handler maps Zod errors to 400, `HttpError` to configured statuses, and connection errors to 503.

## Key Decisions

- **Express + `pg` + Zod** instead of an ORM, to keep SQL explicit and dependencies small.  
- **Merge semantics on PUT** per clarified product spec.  
- **Compose `flyway` service** with `service_completed_successfully` so `docker compose up` applies migrations before the API starts.  
- **Flyway via Docker** in `scripts/migrate-flyway.sh` and CI so the Flyway CLI does not need a host install.  
- **`ci/gh-integration-verify.sh`** for `post_agent_integration` on GitHub-hosted runners.

## Code Structure

| Path | Role |
|------|------|
| `src/server.ts` | HTTP server entry |
| `src/app.ts` | Express app + JSON middleware |
| `src/db/pool.ts` | `pg` pool from `DATABASE_URL` |
| `src/errors.ts` | `HttpError` + JSON body helper |
| `src/validation/listQuery.ts` | List query parsing (unit-tested) |
| `src/validation/body.ts` | Create / merge body schemas |
| `src/repository/BlueprintRepository.ts` | CRUD + list + count |
| `src/serialization.ts` | Row → API JSON (`created_at` ISO) |
| `src/routes/blueprintsRouter.ts` | Route handlers + error handler |
| `db/migration/V1__create_blueprints.sql` | Flyway DDL |
| `scripts/migrate-flyway.sh` | Flyway migrate (Docker) |
| `scripts/run-integration-tests.sh` | Flyway + Vitest integration |
| `ci/gh-integration-verify.sh` | GitHub Actions integration hook |
| `tests/unit/` | Validation unit tests |
| `tests/integration/api.test.ts` | HTTP + real Postgres |

## Run & Verify Locally

```bash
cd assignments/bluebricks
npm ci
npm run test:unit
docker compose up -d db
npm run test:integration
docker compose down -v
npm run build
docker compose build api
```

Expected: unit tests pass; integration tests pass with DB up; TypeScript build succeeds; API image builds.
