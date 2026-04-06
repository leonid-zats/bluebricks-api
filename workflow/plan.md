# Implementation plan — `assignments/bluebricks/`

## Target folder

`assignments/bluebricks/`

## Checklist

### 1. Assets

- [x] Add `bricks.json` matching assignment example `blueprint_data` shape (full document including `name`/`version`/`author` for test POST bodies as needed).

### 2. Database

- [x] Create `db/migration/V1__create_blueprints.sql`: table `blueprints`, indexes for `(created_at DESC, id DESC)` default listing and sort columns.

### 3. Application

- [x] `package.json` — dependencies: `express`, `pg`, `zod`; dev: `typescript`, `tsx`, `vitest`, `supertest`, `@types/*`.
- [x] `tsconfig.json` — `outDir` `dist`, strict.
- [x] `src/db/pool.ts` — `DATABASE_URL` → `Pool`.
- [x] `src/validation/listQuery.ts` — parse `page`, `page_size`, `sort`, `order`; unit-tested; whitelist sort columns.
- [x] `src/validation/body.ts` — Zod schemas for create / merge PUT; unit-tested.
- [x] `src/repository/BlueprintRepository.ts` — CRUD + count + list with parameterized `LIMIT`/`OFFSET` and safe `ORDER BY`.
- [x] `src/routes/blueprintsRouter.ts` — wire HTTP to repository; map errors to status codes.
- [x] `src/app.ts` — express json, mount router at `/blueprints`.
- [x] `src/server.ts` — start server (port from `PORT` env).

### 4. Docker

- [x] `Dockerfile` — multi-stage or simple: `npm ci`, `build`, `node dist/server.js`.
- [x] `docker-compose.yml` — services `db` (`postgres:16-alpine`), one-shot `flyway` (`flyway/flyway:10-alpine`), `api` (build; depends on `flyway` completed successfully).

### 5. Tests

- [x] `tests/unit/` — list query parser, body validation, error shapes.
- [x] `tests/integration/` — spin pool against `DATABASE_URL`, run migrations via **Flyway CLI** in `beforeAll` (subprocess) or document test setup script; use `supertest` against `app` without separate listen; cover: create, get, list pagination+sort, update merge, delete, 404s, validation 400s, malformed id 400; **one test loads `bricks.json`** for create/list.

### 6. CI hook

- [x] `ci/gh-integration-verify.sh` — `docker compose up -d db`, wait healthy, Flyway migrate (container or compose profile), `npm ci`, `npm run test:integration`, `docker compose down -v`.

### 7. Docs

- [x] `README.md` — prerequisites, `docker compose up --build`, env vars, `npm run test:unit` / `test:integration`, pointer to `.github/workflows/cursor-label.yml` job **`post_agent_integration`** and `ci/gh-integration-verify.sh`.
- [x] `workflow/validation.md` — filled by Builder/Validator with evidence.

### 8. Failure-mode validation (trace to requirements)

- [x] **Invalid pagination/sort** — unit test: bad params → throws or result that maps to 400; integration: `GET /blueprints?page=0` → 400.
- [x] **Malformed body** — integration: POST missing `author` → 400 with `error`/`message`.
- [x] **DB unavailable** — integration optional: if feasible, assert 503/500 when pool cannot connect (or document manual); minimum: unit/repository test skipped with note OR stop DB mid-test only if stable; **Validator** records actual approach.
- [x] **Concurrent PUT** — document in README; optional single test not required if documented.

## Assumptions to validate

- Flyway CLI available in CI via official `flyway/flyway` Docker image (same as local hook).
- GitHub runner allows Docker Compose (not nested daemon).
