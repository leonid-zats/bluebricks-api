import { z } from "zod";

const sortEnum = z.enum(["name", "version", "created_at"]);
const orderEnum = z.enum(["asc", "desc"]);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  sort: sortEnum.optional(),
  order: orderEnum.optional(),
});

export type ListQueryInput = z.infer<typeof listQuerySchema>;

export type ParsedListQuery = {
  page: number;
  pageSize: number;
  sort?: "name" | "version" | "created_at";
  order: "asc" | "desc";
  useDefaultSort: boolean;
};

/**
 * Parse GET /blueprints query string. Throws ZodError on invalid input.
 */
export function parseListQuery(raw: Record<string, unknown>): ParsedListQuery {
  const parsed = listQuerySchema.parse(raw);
  const useDefaultSort = parsed.sort === undefined;
  const order: "asc" | "desc" = parsed.order ?? "asc";
  return {
    page: parsed.page,
    pageSize: parsed.page_size,
    sort: parsed.sort,
    order,
    useDefaultSort,
  };
}

export function listQueryErrorMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
  }
  return "Invalid query parameters";
}
