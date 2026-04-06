## Decision: Product Scope Definition

### Context

Issue #59 targets `assignments/bluebricks/` for the Blueprint Manager API (Part 1): Node/TypeScript, Postgres, Flyway, Docker Compose, unit + integration tests.

### Sources

- `assignments/bluebricks/requirements.md` (authoritative assignment brief)
- Issue body: Task Folder `bluebricks`

### Assumptions

- Canonical `bricks.json` did not exist in the folder; it will be added matching the assignment’s example `blueprint_data` shape for tests.
- PUT semantics: **merge with existing row** (clarified) because it reduces client burden and is testable; assignment allowed either merge or full replace.
- Malformed or non-positive `:id` returns **400** with structured JSON for deterministic API behavior.
- List `total_pages` when `total=0` is **0**.

### Conflicts

- None between issue and `requirements.md`.

### Decision

Implement full Part 1 scope: five HTTP routes, Flyway migrations under `assignments/bluebricks/db/migration/`, Compose with `postgres:16-alpine` + API Dockerfile, split test suites, and **`scripts/run-integration-tests.sh`** for local integration verification.

### Rationale

Matches the written assignment checklist; integration verification uses **`scripts/run-integration-tests.sh`** / **`npm run test:integration`** on a host with Docker (no `ci/` folder in the deliverable).

### Trade-offs

- **Determinism:** Default list order fixed to `created_at DESC, id DESC`.
- **Complexity:** Merge PUT is slightly more logic than “replace all fields” but avoids forcing clients to resend unchanged scalars.
- **Flexibility:** No idempotent POST; duplicates possible on client retry (documented as N/A recovery).
- **Failure handling:** Query validation before DB; structured 4xx for validation.

---

## Decision: Architecture — Blueprint Manager API

Context

Single-process Express HTTP service with `pg` connection pool, Flyway-owned schema, Docker Compose for local/CI Postgres.

Options considered

- **ORM (Prisma/TypeORM):** Rejected to keep dependencies minimal and SQL explicit per assignment “parameterized SQL / query layer”.
- **Fastify vs Express:** Express chosen for consistency with other assignments in repo (`ec2-cpu-usage` uses Express 5).
- **PUT full replace vs merge:** Merge selected per `product_requirements_clarified.md`.

Decision

- TypeScript, Express 5, `pg`, Zod for JSON body and query validation.
- Repository class encapsulates SQL; router thin; list query parsing in a small pure module for unit tests.
- Flyway migrations in `db/migration/`; `scripts/run-integration-tests.sh` / README steps run Compose (db + optional flyway profile), Flyway migrate, then integration tests.

Rationale

Fits requirements, keeps ≤10 task source files, testable layers without heavy abstraction.

Trade-offs

- Dynamic `ORDER BY` implemented via whitelisted column names only (security + clarity).
- No distributed queue; reliability sections mostly N/A with explicit notes.

Impact

- Deliverables under `assignments/bluebricks/` only; integration verification documented in README (local scripts).

Related files

- `assignments/bluebricks/workflow/requirements.md`
- `assignments/bluebricks/workflow/plan.md`
- `assignments/bluebricks/src/**/*.ts`

---

## Decision: Builder implementation

Context

Implement Blueprint Manager API per `workflow/requirements.md` and `workflow/plan.md` with Flyway, Compose, split tests, and **`scripts/run-integration-tests.sh`** (local integration; not a `ci/` deliverable).

Options considered

- Run migrations only in CI script vs also in Compose: chose **Compose flyway service** so `docker compose up` is self-contained.
- Test runner: **Vitest** (matches other repo assignments using Vitest).

Decision

- Implemented Express routes, `BlueprintRepository`, Zod validation modules, Flyway `V1__create_blueprints.sql`, Dockerfile, compose with `db` + `flyway` + `api`, `scripts/migrate-flyway.sh`, `scripts/run-integration-tests.sh` with `SKIP_FLYWAY_INTEGRATION=1` to avoid double migrate.

Rationale

Meets HTTP contract tests, keeps SQL parameterized, documents an integration path for environments without nested Docker constraints on the agent.

Trade-offs

- `ORDER BY` built from whitelist (not generic user strings).
- Integration tests require Docker for Flyway CLI image on developer machines.

Impact

All deliverables live under `assignments/bluebricks/`; `package-lock.json` committed for reproducible installs.

Related files

- `assignments/bluebricks/src/**/*.ts`
- `assignments/bluebricks/docker-compose.yml`
- `scripts/run-integration-tests.sh`
- `assignments/bluebricks/tests/**/*.ts`

---

## Decision: Validator verification

Context

Confirm implementation against `workflow/requirements.md`, run tests, score, and record evidence.

Options considered

- Run `scripts/run-integration-tests.sh` locally: redundant with separate `docker compose up db` + `npm run test:integration` already executed; same flow as documented in README.

Decision

Ran `npm run test:unit` and `docker compose up -d db` + `npm run test:integration` + `docker compose down -v`; `npm run build` and `docker compose build api` were run earlier in the agent session. Documented results in `workflow/validation.md`. No code fixes required.

Rationale

Full behavioral surface covered by tests; requirements distributed-systems sections are mostly N/A with documented failure-mode tests.

Trade-offs

- Did not re-run `scripts/run-integration-tests.sh` end-to-end in this session after final compose.yml change; script is straightforward mirror of documented steps.

Impact

Validation report reflects actual command output from the final test run.

Related files

- `assignments/bluebricks/workflow/validation.md`
