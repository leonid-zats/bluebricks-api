# Requirements — Blueprint Manager API (Part 1)

Scope: **Section 1 only** from the Bluebricks home assignment (“Blueprint Manager API”). **Docker Compose** (API + real PostgreSQL) and **Flyway** are **in scope** here. Other assignment parts (Go CLI, full submission README) remain **out of scope** unless this file is extended.

## Primary goal

Deliver a **Node.js + TypeScript** HTTP service that stores Blueprints in **PostgreSQL** and exposes **CRUD** over Blueprint records. Use the provided `bricks.json` as the canonical example of `blueprint_data` shape for creates/updates and tests.

## Stack

- **Runtime:** Node.js  
- **Language:** TypeScript  
- **Database:** PostgreSQL  
- **Schema migrations:** [Flyway](https://flywaydb.org/) (SQL migrations under a conventional folder, e.g. `db/migration` or `src/main/resources/db/migration`—pick one layout and document it). **All** table creation and DDL changes for this service go through Flyway; no ad-hoc “create table on boot” in application code unless it only runs Flyway programmatically (prefer CLI or a documented `npm` script wrapping the Flyway CLI).  
- **Persistence:** Blueprint rows as specified below (JSON/JSONB for `blueprint_data`)

## Data model

### Table: `blueprints`

Minimum columns from the assignment, plus a **creation timestamp** (required so `GET /blueprints` can support sorting by creation date).

| Column           | Type        | Notes |
|------------------|------------|--------|
| `id`             | serial / identity, PK | Surrogate key returned by the API as `:id` |
| `name`           | varchar    | Required on create/update (see validation) |
| `version`        | varchar    | Required on create/update |
| `author`         | varchar    | Required on create/update |
| `blueprint_data` | JSONB      | Opaque JSON document (e.g. description, manifest_version, packages, props, outs) |
| `created_at`     | timestamptz (recommended) | Set on insert; **not** updated on PUT unless you document otherwise. Enables “creation date” sort. |

The assignment’s example DDL is a baseline; adding `created_at` (and optionally `updated_at`) is expected to satisfy sorting and production clarity. **Encode the final `CREATE TABLE` (and indexes you need for sort/pagination) in a Flyway versioned migration** (e.g. `V1__create_blueprints.sql`).

### Example create payload (`POST /blueprints`)

Body is JSON. Top-level fields align with table columns; nested document is `blueprint_data`:

```json
{
  "name": "aws_neptune",
  "version": "1.1.0",
  "author": "bluebricks@example.com",
  "blueprint_data": {
    "description": "AWS Neptune Blueprint for Bluebricks",
    "manifest_version": 1,
    "packages": [],
    "props": {},
    "outs": {}
  }
}
```

`blueprint_data` must be accepted as a JSON object (not null for a valid blueprint row unless you explicitly choose to allow null and document it—default expectation: **required object** on create).

## HTTP API

Base path: **`/blueprints`** (no trailing slash required).

### `POST /blueprints`

- Creates a blueprint row.  
- **Validation:** `name`, `version`, and `author` must be present and non-empty (after trim). Reject invalid input with **4xx** and a clear error body.  
- **Success:** **201** with the created resource representation including assigned `id` and `created_at` (if present).

### `GET /blueprints`

- Returns a **paginated** list of blueprints.  
- **Pagination (required):** Support at least `page` and `page_size` (or equivalent names—if you rename, document in code comments for the agent). Example from assignment: `GET /blueprints?page=1&page_size=20`.  
- **Response must include:**  
  - The requested **page** of items  
  - **Pagination metadata**, including at least **total item count** and enough information to compute **total pages** (e.g. `page`, `page_size`, `total`, `total_pages` or equivalent)  
- **Sorting (required):** Client can sort list results by:  
  - `name`  
  - `version`  
  - **creation date** (`created_at` or equivalent)  
- Sort **API shape is your choice** (e.g. `sort=name&order=asc`). Document the chosen query parameters in this file’s “Agent checklist” or in code next to the handler.  
- Default sort should be **deterministic** (e.g. `created_at DESC, id DESC`) if the client omits sort params.

### `GET /blueprints/:id`

- Returns a single blueprint by primary key.  
- **404** if not found.

### `PUT /blueprints/:id`

- Full or partial update per your contract; must at least allow updating fields consistent with the assignment (name, version, author, blueprint_data).  
- Enforce the same **required-field validation** rules as create for any field that is present in the payload (recommended: require all three scalars on update, or merge with existing row—pick one behavior and test it).  
- **404** if `id` does not exist.

### `DELETE /blueprints/:id`

- Deletes the blueprint.  
- **404** if not found.  
- **204** No Content on success is acceptable; **200** with a small JSON confirmation is also acceptable—stay consistent and document.

## Validation (assignment minimum)

- **Required:** `name`, `version`, `author` on create (and on update per your chosen PUT semantics).  
- Return **4xx** with structured error JSON suitable for tests (e.g. `{ "error": "...", "message": "..." }`).

## Local runtime — Docker Compose

- Provide a **`docker-compose.yml`** (or `compose.yaml`) that starts:
  - **PostgreSQL** using the **official image** `postgres` from Docker Hub (pin a major version tag, e.g. `postgres:16-alpine`, not a generic “database” placeholder image).
  - The **API** service (build from local `Dockerfile` or `image:` if you split dev/prod—default expectation: **build from Dockerfile** so `docker compose up` is reproducible).
- Expose Postgres on a documented host port; wire the API container to the DB via **service hostname** and env vars (`DATABASE_URL` or discrete `PGHOST`, `PGUSER`, etc.).
- Document the one-liner to bring the stack up (e.g. `docker compose up --build`) and any env file expectations in the task README when you add one.

## Quality bar (for the coding agent)

- Use parameterized SQL / an ORM query layer; no string-concatenated user input into SQL.  
- **Flyway** owns schema; first migration creates `blueprints` (and indexes).  
- Typed request/response handling in TypeScript.  

## Testing strategy

Split tests so CI and local runs stay fast and meaningful.

### Unit tests

- **Target:** Pure functions and small modules **without** a running database or HTTP server: validation helpers, query builders, pagination/sort parameter parsing, mapping DTO ↔ row shape, error formatting.  
- **May use** mocks/stubs for repositories or DB clients where that keeps tests deterministic.  
- **Goal:** Fast, parallel-friendly, no Docker required for the unit suite.

### Integration tests

- **Target:** Real behavior against **PostgreSQL**: repository or SQL layer hitting the DB, and/or **HTTP** tests that `fetch`/`supertest` the running app with a real connection pool.  
- **Database:** Use a **real Postgres** instance—typically the same **official `postgres` image** via Docker Compose in CI (service job) or locally (`docker compose up -d db` then run tests with `DATABASE_URL` pointing at it). **Do not** rely on an in-memory substitute unless you also run a subset of tests against real Postgres in CI.  
- **Migrations:** Integration setup must **run Flyway** (CLI or programmatic) against the test database **before** tests that need tables, so the schema always matches migrations.  
- **Coverage:** At minimum, integration (or full-stack API) tests should cover: create, get-by-id, list with **pagination**, list **sorting**, update, delete, not-found, and validation failures—aligned with the assignment minimums.

### Documentation

- README or `package.json` scripts should state how to run **unit** tests only, **integration** tests only, and **all** tests (e.g. `npm test`, `npm run test:unit`, `npm run test:integration`).

## Non-goals (Part 1 only)

- Go CLI or full external submission README **unless** this file is extended.  
- Authentication / authorization.  
- Catalog semantics beyond storing and retrieving `blueprint_data` JSON.

## Agent checklist

- [ ] All five routes implemented and mounted.  
- [ ] **Flyway** migration(s) create `blueprints` (and indexes); no duplicate DDL path.  
- [ ] **Docker Compose** brings up **official `postgres`** image + API; documented env vars.  
- [ ] PostgreSQL table matches columns above (including `created_at` for sort).  
- [ ] `GET /blueprints` pagination + metadata.  
- [ ] `GET /blueprints` sort by name, version, creation date.  
- [ ] Validation for `name`, `version`, `author`.  
- [ ] **Unit tests** for validation/parsing/mapping (no DB).  
- [ ] **Integration tests** against real Postgres + Flyway-applied schema; create, get, list (pagination + sort), update, delete, 404, validation.  
- [ ] Example `bricks.json` used in at least one **integration** test for create/list.
