import { HttpError } from "../errors.js";

const MAX_LEN = 255;

/**
 * Parse `Idempotency-Key` header: trim; empty/whitespace → null; enforce max length.
 */
export function parseIdempotencyKeyHeader(
  raw: string | string[] | undefined,
): string | null {
  if (raw === undefined) {
    return null;
  }
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s === undefined) {
    return null;
  }
  const trimmed = s.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > MAX_LEN) {
    throw new HttpError(
      400,
      "validation_error",
      `Idempotency-Key must be at most ${MAX_LEN} characters`,
    );
  }
  return trimmed;
}
