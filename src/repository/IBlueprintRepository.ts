import type { BlueprintRow, CreateBlueprintInput, MergePatch } from "./types.js";

export type ListSortColumn = "name" | "version" | "created_at";

export interface IBlueprintRepository {
  create(input: CreateBlueprintInput): Promise<BlueprintRow>;
  findById(id: number): Promise<BlueprintRow | null>;
  findByIdempotencyKey(key: string): Promise<BlueprintRow | null>;
  list(
    page: number,
    pageSize: number,
    sort: ListSortColumn | undefined,
    order: "asc" | "desc",
    useDefaultSort: boolean,
  ): Promise<{ rows: BlueprintRow[]; total: number }>;
  updateMerge(id: number, patch: MergePatch): Promise<BlueprintRow>;
  delete(id: number): Promise<boolean>;
}
