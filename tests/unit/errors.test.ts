import { describe, it, expect } from "vitest";
import { isMalformedJsonBodyError } from "../../src/errors.js";

describe("isMalformedJsonBodyError", () => {
  it("returns true for body-parser JSON parse failure shape", () => {
    const err = Object.assign(new Error("Unexpected token"), {
      status: 400,
      statusCode: 400,
      type: "entity.parse.failed",
    });
    expect(isMalformedJsonBodyError(err)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isMalformedJsonBodyError(new Error("boom"))).toBe(false);
    expect(isMalformedJsonBodyError({ status: 400, type: "other" })).toBe(false);
    expect(isMalformedJsonBodyError(null)).toBe(false);
  });
});
