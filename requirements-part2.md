# Requirements — Blueprint CLI (Part 2)

Source: **Section 2** of the Bluebricks home assignment (“CLI Tool (Golang)”).  
**Depends on:** Part 1 API under `assignments/bluebricks/` (`/blueprints` contract). The CLI is an **HTTP client** only; it does not connect to Postgres directly.

## Primary goal

Provide a **Go** command-line program that talks to the Blueprint Manager **REST API** and **prints results** to stdout (and errors to stderr). Use the existing **`bricks.json`** in this task folder as the canonical sample file for `create` / `update`.

## Stack

- **Language:** Go (1.22+ recommended; pin in `go.mod`).  
- **Libraries:** Any of **Cobra**, **urfave/cli/v2**, or **`flag`** from the standard library — pick one and stay consistent.  
- **HTTP:** `net/http` or a thin wrapper; no requirement for a specific REST client library.

## Configuration

- **Base URL** for the API must be configurable without recompiling, e.g.  
  - environment variable **`BLUEPRINTS_API_BASE`** (or `BASE_URL`), default **`http://localhost:3000`**,  
  - and/or a global flag like **`--base-url`**.  
- Final resolved base must join paths so requests hit **`{base}/blueprints`** (and `{base}/blueprints/{id}`). Normalize trailing slashes so double slashes do not break requests.

## Commands (required shapes)

Naming is up to you (`blueprintctl`, `bb`, etc.) as long as the **flags** below exist and behave as described.

| Command | Flags | HTTP | Success behavior |
|---------|--------|------|------------------|
| **create** | `--file <path>` | `POST /blueprints` with JSON body from file | Print response body (created resource JSON). Exit **0**. |
| **get** | `--id <id>` | `GET /blueprints/:id` | Print resource JSON. Exit **0**. |
| **list** | `--page <n>`, `--page-size <n>` | `GET /blueprints?page=<n>&page_size=<n>` | Print list JSON (full API response: `items`, `page`, `page_size`, `total`, `total_pages`). Exit **0**. |
| **update** | `--id <id>`, `--file <path>` | `PUT /blueprints/:id` with JSON body from file | Print updated resource JSON. Exit **0**. |
| **delete** | `--id <id>` | `DELETE /blueprints/:id` | On **204**, print nothing (or a single line confirmation — **document** which). Exit **0**. |

### File payloads

- **`--file`** must read a UTF-8 JSON object suitable for the API: for **create**, same shape as Part 1 (`name`, `version`, `author`, `blueprint_data`). For **update**, same shape as the API’s **PUT** merge contract (partial fields allowed per Part 1).  
- Reject missing/unreadable files with a **clear stderr message** and **non-zero exit** (e.g. exit **1**).

### IDs and validation

- **`--id`** must be a positive integer string; reject otherwise before calling the API (exit non-zero, stderr).  
- **`--page`** and **`--page-size`** must be positive integers consistent with the API (e.g. `page >= 1`, `page_size` within API limits such as **1–100**); validate in the CLI or surface API **400** with non-zero exit.

### Optional parity with Part 1 API

- **`list`:** optional flags **`--sort`** and **`--order`** forwarded as `sort` and `order` query params when present (`name` \| `version` \| `created_at`, `asc` \| `desc`).  
- **`create`:** optional **`--idempotency-key <string>`** sent as header **`Idempotency-Key`** when the API supports it (Part 1 extension).

## HTTP error handling

- **2xx:** success as above.  
- **4xx / 5xx:** print **response body** to stdout or stderr (pick one convention and document it); exit **non-zero** (e.g. **1** for client/validation, **2** for server/network if you distinguish).  
- **Network / connection refused:** stderr with cause; non-zero exit.

## Project layout (suggested)

- Place Go module under **`assignments/bluebricks/cli/`** (or **`cmd/blueprintctl/`** at task root) — **one** chosen tree, documented in the task README.  
- **`go.mod`** at that module root; **`go build`** produces a single binary name documented in README.

## Testing

- **`go test ./...`** must run **without** Docker for **unit** tests (e.g. URL builder, flag parsing, JSON read errors) where practical.  
- Add at least **one** test that uses an **`httptest.Server`** mock API to assert: correct method, path, query string, body, and that stdout contains expected JSON for **one** command (e.g. **get** or **list**).  
- Document in README how to run CLI tests and how to run the CLI manually against `docker compose up` API.

## Documentation (task README)

Extend **`assignments/bluebricks/README.md`** (or add a **`cli/README.md`**) with:

- Build: `go build -o ... ./...`  
- Example invocations for all five commands against `http://localhost:3000`.  
- Env var / flag for base URL.

## Non-goals (Part 2)

- Auth, config files, interactive prompts, TUI.  
- Bundling the Node API inside the Go binary.  
- Publishing to a module proxy.

## Agent checklist

- [ ] Go module builds with `go build`.  
- [ ] All five commands implemented with required flags.  
- [ ] Configurable base URL (env and/or flag).  
- [ ] Correct HTTP mapping for CRUD + list query params.  
- [ ] Non-zero exit and stderr on usage errors and HTTP/API errors.  
- [ ] `go test` includes **httptest**-based test(s).  
- [ ] README examples use **`bricks.json`** for create/update.
