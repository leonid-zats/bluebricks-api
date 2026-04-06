/** Row shape from persistence (includes internal columns not exposed in API JSON). */
export type BlueprintRow = {
  id: number;
  name: string;
  version: string;
  author: string;
  blueprint_data: unknown;
  created_at: Date;
  idempotency_key: string | null;
};

export type CreateBlueprintInput = {
  name: string;
  version: string;
  author: string;
  blueprint_data: unknown;
  idempotency_key: string | null;
};

export type MergePatch = {
  name?: string;
  version?: string;
  author?: string;
  blueprint_data?: unknown;
};
