import { describe, it, expect } from "vitest";
import { createBlueprintSchema, mergeUpdateSchema } from "../../src/validation/body.js";

describe("createBlueprintSchema", () => {
  it("accepts valid create body", () => {
    const parsed = createBlueprintSchema.parse({
      name: "x",
      version: "1",
      author: "a@b.c",
      blueprint_data: { a: 1 },
    });
    expect(parsed.name).toBe("x");
  });

  it("rejects empty name after trim", () => {
    expect(() =>
      createBlueprintSchema.parse({
        name: "   ",
        version: "1",
        author: "a",
        blueprint_data: {},
      }),
    ).toThrow();
  });

  it("rejects null blueprint_data", () => {
    expect(() =>
      createBlueprintSchema.parse({
        name: "x",
        version: "1",
        author: "a",
        blueprint_data: null,
      }),
    ).toThrow();
  });

  it("rejects array blueprint_data", () => {
    expect(() =>
      createBlueprintSchema.parse({
        name: "x",
        version: "1",
        author: "a",
        blueprint_data: [],
      }),
    ).toThrow();
  });
});

describe("mergeUpdateSchema", () => {
  it("allows empty object", () => {
    expect(mergeUpdateSchema.parse({})).toEqual({});
  });
});
