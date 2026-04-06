import { isDeepStrictEqual } from "node:util";
import type { BlueprintRow } from "./types.js";

export type CreateBlueprintBody = {
  name: string;
  version: string;
  author: string;
  blueprint_data: unknown;
};

/** True if the stored row matches the create body for idempotent replay semantics. */
export function isSameCreatePayload(row: BlueprintRow, body: CreateBlueprintBody): boolean {
  return (
    row.name === body.name &&
    row.version === body.version &&
    row.author === body.author &&
    isDeepStrictEqual(row.blueprint_data, body.blueprint_data)
  );
}
