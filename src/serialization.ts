import type { BlueprintRow } from "./repository/types.js";

/** Public API JSON (hides internal `idempotency_key`). */
export function blueprintToJson(row: BlueprintRow) {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    author: row.author,
    blueprint_data: row.blueprint_data,
    created_at: row.created_at.toISOString(),
  };
}
