# Implementation plan — `assignments/bluebricks/`

## Target folder

`assignments/bluebricks/`

## Checklist

### 1. Database

- [x] Add `db/migration/V2__add_idempotency_key.sql`: column `idempotency_key VARCHAR(255) NULL`, **unique** index (Postgres allows multiple NULLs).
- [x] Add `prisma/schema.prisma` with `Blueprint` model `@@map("blueprints")`, `idempotency_key String? @unique`.

### 2. Dependencies & build

- [x] Replace `pg` with `@prisma/client` + dev `prisma`; `postinstall` / `build` run `prisma generate`.
- [x] `npm ci` updates `package-lock.json`.

### 3. Application (OOP)

- [x] `src/repository/types.ts` — `BlueprintRow` including `idempotency_key` (internal).
- [x] `src/repository/IBlueprintRepository.ts` — interface for CRUD + `findByIdempotencyKey`.
- [x] `src/repository/PrismaBlueprintRepository.ts` — Prisma implementation; whitelist sort via Prisma `orderBy`.
- [x] `src/repository/blueprintPayload.ts` — `isSameCreatePayload` (deep compare `blueprint_data`).
- [x] `src/validation/idempotencyKey.ts` — parse/validate `Idempotency-Key` header.
- [x] `src/db/prisma.ts` — `createPrismaClient(optionalUrl?)` for tests.
- [x] `src/routes/blueprintsRouter.ts` — POST idempotency (pre-check, P2002 retry), inject `PrismaClient`.
- [x] `src/serialization.ts` — **omit** `idempotency_key` from public JSON.
- [x] `src/app.ts` — `createApp(prisma)`.
- [x] `src/server.ts` — Prisma lifecycle + listen.
- [x] Remove `src/db/pool.ts`, `BlueprintRepository.ts` (`pg`).

### 4. Docker

- [x] `Dockerfile` — copy `prisma/` before `npm ci`; production stage copy `.prisma` from build; `npm run build` in build stage.

### 5. Tests

- [x] Unit: `blueprintPayload.test.ts`, `idempotencyKey.test.ts`; keep list/body tests.
- [x] Integration: idempotent POST **200** replay, **409** conflict; DB 503 with Prisma bad URL; update imports from pool → prisma.

### 6. CI hook

- [x] `ci/gh-integration-verify.sh` unchanged behavior (Flyway applies V2).

### 7. Docs & workflow

- [x] `workflow/product_requirements_clarified.md`, `workflow/requirements.md`, `workflow/plan.md`, `workflow/decision_log.md`, `workflow/validation.md`, `README.md` — idempotency, Prisma, interface.

### 8. Failure-mode validation (trace to requirements)

- [x] **Invalid pagination/sort** — integration `GET ?page=0` → 400.
- [x] **Malformed body** — POST missing `author` → 400.
- [x] **DB unavailable** — Prisma client with bad port → 503.
- [x] **Idempotency conflict** — integration second POST same key different body → **409** exact body.
- [x] **Idempotency replay** — integration same key same body → **200**, same `id`.

## Assumptions to validate

- Prisma `P2002` `meta.target` includes `idempotency_key` for unique violations (router handles array or string).
- Flyway remains source of truth; Prisma schema hand-maintained to match migrations.
