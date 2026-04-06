import { describe, it, expect } from "vitest";
import { parseListQuery } from "../../src/validation/listQuery.js";

describe("parseListQuery", () => {
  it("applies defaults", () => {
    const q = parseListQuery({});
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(20);
    expect(q.useDefaultSort).toBe(true);
    expect(q.sort).toBeUndefined();
  });

  it("parses sort and order", () => {
    const q = parseListQuery({ sort: "name", order: "desc" });
    expect(q.sort).toBe("name");
    expect(q.order).toBe("desc");
    expect(q.useDefaultSort).toBe(false);
  });

  it("rejects page below 1", () => {
    expect(() => parseListQuery({ page: "0" })).toThrow();
  });

  it("rejects page_size above 100", () => {
    expect(() => parseListQuery({ page_size: "101" })).toThrow();
  });

  it("rejects invalid sort", () => {
    expect(() => parseListQuery({ sort: "nope" })).toThrow();
  });
});
