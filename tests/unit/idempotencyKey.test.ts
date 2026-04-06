import { describe, it, expect } from "vitest";
import { parseIdempotencyKeyHeader } from "../../src/validation/idempotencyKey.js";
import { HttpError } from "../../src/errors.js";

describe("parseIdempotencyKeyHeader", () => {
  it("returns null when absent", () => {
    expect(parseIdempotencyKeyHeader(undefined)).toBeNull();
  });

  it("trims and returns key", () => {
    expect(parseIdempotencyKeyHeader("  abc  ")).toBe("abc");
  });

  it("returns null for whitespace-only", () => {
    expect(parseIdempotencyKeyHeader("   ")).toBeNull();
  });

  it("throws HttpError when too long", () => {
    expect(() => parseIdempotencyKeyHeader("x".repeat(256))).toThrow(HttpError);
  });
});
