# Blueprint Manager API (Bluebricks — Part 1)

Assignment brief: see `requirements.md` in this folder and `workflow/requirements.md` for the implementation spec.

## Stack

- Node.js 18+, TypeScript, Express 5, **Prisma** (`@prisma/client`), Zod  
- PostgreSQL **16** (`postgres:16-alpine`)  
- Schema: **Flyway** SQL in `db/migration/` (source of truth); **`prisma/schema.prisma`** mirrors tables for the ORM (`npm run build` runs `prisma generate`)  
- **Docker Compose**: `db`, one-shot `flyway`, and `api` (see `docker-compose.yml`)

## Environment

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (required for `npm start` / tests) |
| `PORT` | HTTP port (default `3000`) |

Default local URL when using Compose for the API: `http://localhost:3000`.

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

The service uses **Prisma** for all database access, with **`IBlueprintRepository`** implemented by **`PrismaBlueprintRepository`**. Flyway migration **`V2__add_idempotency_key.sql`** adds a nullable, uniquely indexed **`idempotency_key`** column. **`POST /blueprints`** reads the **`Idempotency-Key`** header: duplicate key with matching body returns **200** and the original row; duplicate key with a different body returns **409**. Concurrent creates with the same new key rely on the unique index and **P2002** handling. List queries use Prisma `orderBy` with fixed sort branches (no user-controlled SQL fragments). The **Dockerfile** copies **`prisma/`** before **`npm ci`** so `postinstall` can run `prisma generate`, and copies the generated **`.prisma`** engine from the build stage into the production image.

**Issue #63:** Integration tests assert **row order** for **`sort=name&order=asc`** and **`sort=created_at&order=asc`**. Invalid JSON bodies on POST are mapped in **`blueprintErrorHandler`** from Express body-parser’s **`entity.parse.failed`** (**400**) to **`{ "error": "validation_error", "message": "Invalid JSON body" }`** so clients never see **500** for a simple syntax error.

## Key Decisions

- **Prisma** as the ORM (issue #61); **Flyway** remains authoritative for DDL.  
- **`IBlueprintRepository`** + **`PrismaBlueprintRepository`** for OOP boundaries.  
- **Idempotency** via **`Idempotency-Key`** header + DB unique constraint + payload deep equality (`util.isDeepStrictEqual` on `blueprint_data`).  
- **Public JSON omits `idempotency_key`.**  
- **`ci/gh-integration-verify.sh`** unchanged contract; applies **V1 + V2** migrations on CI.  
- **`isMalformedJsonBodyError`** (issue #63) detects body-parser JSON parse failures and returns structured **400** like other validation errors.  
- **Integration sort tests** (issue #63) filter rows by unique name prefix and assert ordering ( **`page_size` ≤ 100** per API rules).  

## Code Structure

| Path | Role |
|------|------|
| `prisma/schema.prisma` | Prisma model → `blueprints` table |
| `src/db/prisma.ts` | `createPrismaClient` (optional URL override for tests) |
| `src/repository/types.ts` | `BlueprintRow`, input types |
| `src/repository/IBlueprintRepository.ts` | Persistence interface |
| `src/repository/PrismaBlueprintRepository.ts` | Prisma implementation |
| `src/repository/blueprintPayload.ts` | Idempotent body equality |
| `src/validation/idempotencyKey.ts` | Parse / validate `Idempotency-Key` header |
| `src/server.ts` | Prisma client, HTTP server, `$disconnect` on shutdown |
| `src/app.ts` | Express app + JSON middleware |
| `src/errors.ts` | `HttpError`, **`isMalformedJsonBodyError`** (invalid JSON from body-parser) |
| `src/validation/listQuery.ts` | List query parsing (unit-tested) |
| `src/validation/body.ts` | Create / merge body schemas |
| `src/serialization.ts` | Row → API JSON (hides `idempotency_key`) |
| `src/routes/blueprintsRouter.ts` | Routes, idempotent POST, error handler |
| `db/migration/V1__create_blueprints.sql` | Initial DDL |
| `db/migration/V2__add_idempotency_key.sql` | Idempotency column + unique index |
| `scripts/migrate-flyway.sh` | Flyway migrate (Docker) |
| `scripts/run-integration-tests.sh` | Flyway + Vitest integration |
| `ci/gh-integration-verify.sh` | GitHub Actions integration hook |
| `tests/unit/` | Validation + idempotency + **JSON error shape** unit tests |
| `tests/integration/api.test.ts` | HTTP + real Postgres |

## Run & Verify Locally

```bash
cd assignments/bluebricks
npm ci
npm run test:unit
bash ci/gh-integration-verify.sh
npm run build
docker compose build api
```

Expected: unit tests pass (**20** tests including `errors.test.ts`); integration script runs Flyway (if needed), **14** integration tests pass, Compose teardown succeeds; TypeScript build succeeds; API image builds successfully.
