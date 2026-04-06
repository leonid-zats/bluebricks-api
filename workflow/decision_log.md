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

Implement full Part 1 scope: five HTTP routes, Flyway migrations under `assignments/bluebricks/db/migration/`, Compose with `postgres:16-alpine` + API Dockerfile, split test suites, and `ci/gh-integration-verify.sh` for `post_agent_integration`.

### Rationale

Matches the written assignment checklist and enables GitHub-hosted verification where Cloud Agent Docker may be unavailable.

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
- Flyway migrations in `db/migration/`; CI hook runs Compose (db + optional flyway profile), Flyway migrate, then integration tests.

Rationale

Fits requirements, keeps ≤10 task source files, testable layers without heavy abstraction.

Trade-offs

- Dynamic `ORDER BY` implemented via whitelisted column names only (security + clarity).
- No distributed queue; reliability sections mostly N/A with explicit notes.

Impact

- Deliverables under `assignments/bluebricks/` only; CI verified via `post_agent_integration` when PR exists.

Related files

- `assignments/bluebricks/workflow/requirements.md`
- `assignments/bluebricks/workflow/plan.md`
- `assignments/bluebricks/src/**/*.ts`

---

## Decision: Builder implementation

Context

Implement Blueprint Manager API per `workflow/requirements.md` and `workflow/plan.md` with Flyway, Compose, split tests, and GitHub integration hook.

Options considered

- Run migrations only in CI script vs also in Compose: chose **Compose flyway service** so `docker compose up` is self-contained.
- Test runner: **Vitest** (matches other repo assignments using Vitest).

Decision

- Implemented Express routes, `BlueprintRepository`, Zod validation modules, Flyway `V1__create_blueprints.sql`, Dockerfile, compose with `db` + `flyway` + `api`, `scripts/migrate-flyway.sh`, `ci/gh-integration-verify.sh` with `SKIP_FLYWAY_INTEGRATION=1` to avoid double migrate.

Rationale

Meets HTTP contract tests, keeps SQL parameterized, documents CI path for environments without nested Docker constraints on the agent.

Trade-offs

- `ORDER BY` built from whitelist (not generic user strings).
- Integration tests require Docker for Flyway CLI image on developer machines.

Impact

All deliverables live under `assignments/bluebricks/`; `package-lock.json` committed for reproducible CI.

Related files

- `assignments/bluebricks/src/**/*.ts`
- `assignments/bluebricks/docker-compose.yml`
- `assignments/bluebricks/ci/gh-integration-verify.sh`
- `assignments/bluebricks/tests/**/*.ts`

---

## Decision: Validator verification

Context

Confirm implementation against `workflow/requirements.md`, run tests, score, and record evidence.

Options considered

- Run `ci/gh-integration-verify.sh` locally: redundant with separate `docker compose up db` + `npm run test:integration` already executed; hook mirrors CI.

Decision

Ran `npm run test:unit` and `docker compose up -d db` + `npm run test:integration` + `docker compose down -v`; `npm run build` and `docker compose build api` were run earlier in the agent session. Documented results in `workflow/validation.md`. No code fixes required.

Rationale

Full behavioral surface covered by tests; requirements distributed-systems sections are mostly N/A with documented failure-mode tests.

Trade-offs

- Did not re-run `gh-integration-verify.sh` end-to-end in this session after final compose.yml change; script is straightforward mirror of documented steps.

Impact

Validation report reflects actual command output from the final test run.

Related files

- `assignments/bluebricks/workflow/validation.md`

---

## Decision: Product scope — Issue #61 (ORM, OOP, idempotent POST)

Context

GitHub issue #61 requests the `bluebricks` task folder, preference for an ORM, improved OOP (interfaces/classes), and an idempotent POST handler.

Options considered

- **Idempotency:** Header `Idempotency-Key` vs body field — header matches common HTTP practice and keeps `bricks.json` unchanged.
- **ORM:** Prisma vs TypeORM vs Kysely — Prisma fits TypeScript + Postgres with generated types and clear unique-constraint errors for races.

Decision

- Add **Flyway V2** `idempotency_key` column with **unique** partial semantics via unique index on nullable column.
- **POST** accepts optional **`Idempotency-Key`**: same key + same body → **200**; different body → **409** `conflict`; handle **P2002** on concurrent creates.
- **ORM:** **Prisma**; **OOP:** **`IBlueprintRepository`** + **`PrismaBlueprintRepository`**.
- Public JSON **must not** expose `idempotency_key`.

Rationale

Matches issue notes while keeping Flyway as schema source of truth and preserving existing HTTP list/merge semantics.

Trade-offs

- Prisma adds code generation and Docker copy steps; idempotency adds one column and conflict paths to test.

Impact

`workflow/product_requirements_clarified.md` and downstream `requirements.md` / `plan.md` updated; implementation migrates from raw `pg` to Prisma.

Related files

- `assignments/bluebricks/workflow/product_requirements_clarified.md`
- `assignments/bluebricks/db/migration/V2__add_idempotency_key.sql`
- `assignments/bluebricks/prisma/schema.prisma`

---

## Decision: Architecture — Prisma + repository interface (Issue #61)

Context

Issue #61 asks for ORM and clearer OOP boundaries while keeping the existing REST contract and Flyway ownership.

Options considered

- **Stay on `pg`:** Rejected — issue explicitly prefers ORM.
- **TypeORM:** Rejected — heavier runtime reflection pattern; Prisma’s schema + client fit this small service.
- **Idempotency in application only (no DB constraint):** Rejected — races could create duplicate rows; unique index + P2002 handling is required.

Decision

- **Prisma Client** with `prisma/schema.prisma` mirroring Flyway.
- **`IBlueprintRepository`** defines persistence; router depends on **`PrismaClient`** composed with **`PrismaBlueprintRepository`** (could inject interface later; constructor takes `PrismaClient` for simplicity).
- **Sort safety:** Prisma `orderBy` with fixed branches (no raw user strings in SQL).

Rationale

Single-process API; Prisma maps connection errors to **503** alongside legacy `ECONNREFUSED` checks; unique violations detect idempotency races.

Trade-offs

- Two schema sources (Flyway + Prisma) must be kept in sync manually for this task.

Impact

All DB access goes through Prisma; Dockerfile copies `prisma/` before `npm ci` so `postinstall` succeeds.

Related files

- `assignments/bluebricks/src/repository/IBlueprintRepository.ts`
- `assignments/bluebricks/src/repository/PrismaBlueprintRepository.ts`
- `assignments/bluebricks/src/db/prisma.ts`

---

## Decision: Builder — Prisma migration and idempotent POST

Context

Implement Issue #61 on branch `cursor/bluebricks-implementation-details-b3bb`.

Options considered

- **Transaction with advisory lock per key:** Rejected — unique index + retry read is simpler and matches spec.
- **`prisma db push` in CI:** Rejected — Flyway remains authoritative; only `prisma generate` in build.

Decision

- Removed **`pg`** pool/repository; added Prisma models, **`isSameCreatePayload`** using `util.isDeepStrictEqual` for JSONB comparison.
- Router: pre-insert lookup by key; on **P2002**, re-fetch by key and compare payload.
- Dockerfile: copy **`prisma/`** before **`npm ci`** in both stages; copy **`node_modules/.prisma`** from build to runtime.

Rationale

Meets contract tests and Docker build; integration tests cover 200 replay, 409 conflict, 503 bad DB URL.

Trade-offs

- `postinstall` always runs `prisma generate` (requires `prisma` schema present after clone — satisfied by repo layout).

Impact

New unit tests for idempotency header and payload equality; integration test count increased.

Related files

- `assignments/bluebricks/src/routes/blueprintsRouter.ts`
- `assignments/bluebricks/Dockerfile`
- `assignments/bluebricks/tests/integration/api.test.ts`

---

## Decision: Validator — Issue #61 verification

Context

Re-validate after Prisma + idempotency changes; run unit, integration, `gh-integration-verify.sh`, and `docker compose build api`.

Options considered

- **Context7 for Prisma P2002:** Used during implementation to confirm `Prisma.PrismaClientKnownRequestError` + `code === 'P2002'` pattern (`/prisma/prisma`).

Decision

- Ran `npm run test:unit`, `bash ci/gh-integration-verify.sh`, `docker compose build api` — all passed in this environment.
- Updated `workflow/validation.md` with new evidence rows for idempotency failure modes.

Rationale

End-to-end CI hook validates Flyway V2 + integration suite on GitHub runners when PR is labeled.

Trade-offs

- Concurrent POST race is covered by unique index + handler logic; no dedicated stress test (optional per plan).

Impact

Validation report and README run commands aligned with executed commands.

Related files

- `assignments/bluebricks/workflow/validation.md`
- `assignments/bluebricks/README.md`

---

## Decision: Product scope — Issue #63 (list sort integration + malformed JSON)

Context

Issue #63 asks for stronger integration coverage of list sorting (`sort=name` row order, `sort=created_at`), and for invalid JSON on POST to return **4xx** structured errors instead of **500** from Express body-parser.

Options considered

- Rely on status-only integration tests vs assert full row order.
- Map all **400** `http-errors` to `validation_error` vs only body-parser JSON parse failures.

Decision

- **Integration tests** must assert **ascending order by `name`** for `sort=name&order=asc` and **ascending order by `created_at`** for `sort=created_at&order=asc` (two creates, short delay for timestamp separation).
- **Malformed JSON** on POST: **400** with `{ "error": "validation_error", "message": "Invalid JSON body" }`.

Rationale

Matches issue #63 and Part 1 expectation that bad client input yields **4xx** with the same structured error shape as other validation failures.

Trade-offs

- `created_at` ordering test uses a small `setTimeout` to reduce flakiness from identical timestamps; still bounded and deterministic enough for CI.

Impact

`product_requirements_clarified.md` and downstream `requirements.md` / `plan.md` updated; implementation adds error detection + tests.

Related files

- `assignments/bluebricks/workflow/product_requirements_clarified.md`
- `assignments/bluebricks/workflow/requirements.md`
- `assignments/bluebricks/workflow/plan.md`

---

## Decision: Architecture — Issue #63 (body-parser errors + sort tests)

Context

Express `express.json()` delegates to body-parser; JSON syntax errors surface as **400** errors with `type: "entity.parse.failed"` before Zod runs. Integration tests previously did not assert ordering for explicit sort keys.

Options considered

- Custom JSON parser middleware replacing `express.json`.
- **Detect body-parser error** in `blueprintErrorHandler` via `status` + `type` and map to app JSON contract.

Decision

- Keep `express.json({ limit: "2mb" })`; extend **`blueprintErrorHandler`** to recognize **`entity.parse.failed`** (and status **400**) and respond with **`validation_error` / `Invalid JSON body`**.
- Add integration tests that filter list items by unique name prefix and assert order; use **~25ms** delay between creates for `created_at` test.

Rationale

Minimal change; no new dependencies; aligns with body-parser **2.x** error shape bundled with Express 5.

Trade-offs

- Detection relies on body-parser’s `type` string; if Express/body-parser changes the type, the unit test + integration test will fail visibly.

Impact

`src/errors.ts`, `src/routes/blueprintsRouter.ts`, integration + unit tests.

Related files

- `assignments/bluebricks/src/errors.ts`
- `assignments/bluebricks/src/routes/blueprintsRouter.ts`
- `assignments/bluebricks/tests/integration/api.test.ts`

---

## Decision: Validator — Issue #63 verification

Context

Validate Issue #63: integration ordering for `sort=name` and `sort=created_at`, and **400** structured response for malformed JSON on POST.

Options considered

- Re-run `docker compose build api` for this pass vs defer (Dockerfile unchanged).

Decision

- Ran `npm run test:unit`, `bash ci/gh-integration-verify.sh`, `npm run build`; all passed.
- Fixed integration tests to use **`page_size=100`** (max allowed); initial **200** page size caused **400** and failed ordering tests.
- Replaced `workflow/validation.md` with an Issue #63 report; updated README run/verify to include **`npm run build`** and current test counts.

Rationale

Evidence must match executed commands; `page_size` must respect the spec cap already enforced by Zod.

Trade-offs

- Did not re-run `docker compose build api` in this session (no Dockerfile change).

Impact

`workflow/validation.md` and `README.md` reflect Issue #63 validation.

Related files

- `assignments/bluebricks/workflow/validation.md`
- `assignments/bluebricks/README.md`
- `assignments/bluebricks/tests/integration/api.test.ts`

---

## Decision: Builder — Issue #63 implementation

Context

Implement clarified spec: structured **400** for invalid JSON; integration ordering assertions for `name` and `created_at` sorts.

Options considered

- Use `http-errors` `isHttpError` from a new dependency vs local `isMalformedJsonBodyError` predicate.

Decision

- Added **`isMalformedJsonBodyError`** in `src/errors.ts` checking **`status`/`statusCode` === 400** and **`type === "entity.parse.failed"`**.
- **`blueprintErrorHandler`** handles it before Zod and before **500** fallback.
- **`tests/unit/errors.test.ts`** covers the predicate; integration tests cover ordering + malformed JSON POST.

Rationale

Avoids adding `http-errors` as a direct dependency; predicate is narrow and testable.

Trade-offs

- Does not rewrite messages for other **400** errors from upstream middleware (only JSON parse failures).

Impact

Users sending broken JSON get consistent **validation_error** responses; CI proves list sort semantics for two keys.

Related files

- `assignments/bluebricks/src/errors.ts`
- `assignments/bluebricks/src/routes/blueprintsRouter.ts`
- `assignments/bluebricks/tests/unit/errors.test.ts`
- `assignments/bluebricks/tests/integration/api.test.ts`
