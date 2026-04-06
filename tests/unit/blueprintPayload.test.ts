import { describe, it, expect } from "vitest";
import { isSameCreatePayload } from "../../src/repository/blueprintPayload.js";
import type { BlueprintRow } from "../../src/repository/types.js";

function row(over: Partial<BlueprintRow> = {}): BlueprintRow {
  return {
    id: 1,
    name: "n",
    version: "v",
    author: "a",
    blueprint_data: { x: 1 },
    created_at: new Date("2020-01-01T00:00:00.000Z"),
    idempotency_key: "k",
    ...over,
  };
}

describe("isSameCreatePayload", () => {
  it("returns true when fields and blueprint_data match deeply", () => {
    const body = { name: "n", version: "v", author: "a", blueprint_data: { x: 1 } };
    expect(isSameCreatePayload(row(), body)).toBe(true);
  });

  it("returns false when blueprint_data differs", () => {
    const body = { name: "n", version: "v", author: "a", blueprint_data: { x: 2 } };
    expect(isSameCreatePayload(row(), body)).toBe(false);
  });

  it("returns false when scalar differs", () => {
    const body = { name: "other", version: "v", author: "a", blueprint_data: { x: 1 } };
    expect(isSameCreatePayload(row(), body)).toBe(false);
  });
});
