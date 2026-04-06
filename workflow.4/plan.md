# Implementation plan — Blueprint CLI (Issue #65)

## Target folder

- **CLI module:** `assignments/bluebricks/cli/`
- **Task root (docs, API, sample JSON):** `assignments/bluebricks/`

## Checklist

### 1. Module bootstrap

- [x] `assignments/bluebricks/cli/go.mod` — `go 1.22` (or 1.22.x toolchain), module path e.g. `github.com/bluebricks/blueprintctl` or `assignments/bluebricks/cli` (use a stable path; prefer **`blueprints/cli`** style local path if no vanity import needed).
- [x] Add **`github.com/spf13/cobra`** dependency.

### 2. Packages (≤10 Go files)

- [x] `cmd/blueprintctl/main.go` — `Execute()` root command.
- [x] `internal/config/config.go` — `ResolveBaseURL(flagValue, envValue) string`, trim trailing slash logic; default `http://localhost:3000`.
- [x] `internal/urls/join.go` — join base + `/blueprints` / `/blueprints/{id}` via `url.Parse` + `ResolveReference` (no double slashes).
- [x] `internal/validate/validate.go` — `ParsePositiveID`, `ParsePage`, `ParsePageSize`, `ParseSortOrder` (reject order without sort).
- [x] `internal/client/client.go` — `DoRequest(ctx, ...)` returning status, body bytes; map to exit policy: **4xx → stderr + exit 1**, **5xx → stderr + exit 2**, **network → stderr + exit 2**; **2xx** return body for stdout (delete **204** → empty stdout).

### 3. Cobra commands

- [x] Root: persistent flags **`--base-url`**; read env **`BLUEPRINTS_API_BASE`** in `PersistentPreRun` or per command.
- [x] `create`: **`--file`**, **`--idempotency-key`** (optional); POST.
- [x] `get`: **`--id`**; GET.
- [x] `list`: **`--page`**, **`--page-size`**, **`--sort`**, **`--order`** (optional pair); GET with query.
- [x] `update`: **`--id`**, **`--file`**; PUT.
- [x] `delete`: **`--id`**; DELETE; **204** → no stdout.

### 4. Tests

- [x] `internal/config` or `internal/urls` unit tests: base with/without trailing slash, env override, flag override order.
- [x] `internal/validate` unit tests: id, page, page_size, sort, order, order-without-sort.
- [x] `internal/client` **httptest** test: mock **`GET /blueprints/42`** (or list with query); run command runner or client function; assert **GET**, path **`/blueprints/42`**, stdout contains expected JSON substring.
- [x] Table-driven tests for **404 → exit 1 stderr**, **503 → exit 2 stderr** (exact body bytes on stderr).

### 5. README

- [x] Section **Blueprint CLI (Part 2)**: `cd assignments/bluebricks/cli`, `go build -o blueprintctl ./cmd/blueprintctl`, `go test ./...`.
- [x] Examples: `BLUEPRINTS_API_BASE=http://localhost:3000 ./blueprintctl create --file ../bricks.json`, `get --id 1`, `list --page 1 --page-size 20`, `update --id 1 --file ../bricks.json`, `delete --id 1`.
- [x] Document: error bodies to **stderr**; exit **1** vs **2**; **204 delete** silent stdout.
- [x] Keep existing API **Implementation Summary**; append CLI to **Code Structure** / **Run & Verify** as needed.

### 6. Workflow

- [x] `workflow/product_requirements_clarified.md`, `workflow/requirements.md`, `workflow/plan.md`, `workflow/decision_log.md` updated for Issue #65.
- [x] `workflow/validation.md` filled by Validator with `go test` evidence and failure-mode mapping.
- [x] `ci/gh-integration-verify.sh` — run `go test ./...` in `cli/` when `go` is on `PATH` (post_agent_integration).

### 7. Failure-mode validation (trace to `requirements.md`)

- [x] **Invalid `--id`:** unit test → maps to scenario “Invalid `--id` (client validation)”.
- [x] **Missing file:** unit or small integration-style test → “Unreadable `--file`”.
- [x] **API 404 / 503:** httptest → “API **404** on get” / “API **503**”.

## Assumptions to validate

- API serves at **`/blueprints`** on the given host (Part 1 `app.ts`).
- `go` **1.22+** available on CI runners if later extended; for this repo, local **`go test`** only in validation unless workflow added.
