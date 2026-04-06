import type pg from "pg";
import { HttpError } from "../errors.js";

export type BlueprintRow = {
  id: number;
  name: string;
  version: string;
  author: string;
  blueprint_data: unknown;
  created_at: Date;
};

const SORT_SQL: Record<"name" | "version" | "created_at", string> = {
  name: "b.name",
  version: "b.version",
  created_at: "b.created_at",
};

export class BlueprintRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(row: Omit<BlueprintRow, "id" | "created_at">): Promise<BlueprintRow> {
    const res = await this.pool.query<BlueprintRow>(
      `INSERT INTO blueprints (name, version, author, blueprint_data)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, name, version, author, blueprint_data, created_at`,
      [row.name, row.version, row.author, JSON.stringify(row.blueprint_data)],
    );
    return res.rows[0]!;
  }

  async findById(id: number): Promise<BlueprintRow | null> {
    const res = await this.pool.query<BlueprintRow>(
      `SELECT id, name, version, author, blueprint_data, created_at
       FROM blueprints b WHERE b.id = $1`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  async list(
    page: number,
    pageSize: number,
    sort: "name" | "version" | "created_at" | undefined,
    order: "asc" | "desc",
    useDefaultSort: boolean,
  ): Promise<{ rows: BlueprintRow[]; total: number }> {
    const offset = (page - 1) * pageSize;
    let orderClause: string;
    if (useDefaultSort) {
      orderClause = "b.created_at DESC, b.id DESC";
    } else {
      const col = SORT_SQL[sort!];
      const dir = order.toUpperCase();
      orderClause = `${col} ${dir}, b.id ${dir}`;
    }
    const countRes = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM blueprints",
    );
    const total = Number.parseInt(countRes.rows[0]!.count, 10);
    const dataRes = await this.pool.query<BlueprintRow>(
      `SELECT id, name, version, author, blueprint_data, created_at
       FROM blueprints b
       ORDER BY ${orderClause}
       LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );
    return { rows: dataRes.rows, total };
  }

  async updateMerge(
    id: number,
    patch: { name?: string; version?: string; author?: string; blueprint_data?: unknown },
  ): Promise<BlueprintRow> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new HttpError(404, "not_found", "Blueprint not found");
    }
    const name = patch.name ?? existing.name;
    const version = patch.version ?? existing.version;
    const author = patch.author ?? existing.author;
    const blueprint_data =
      patch.blueprint_data !== undefined ? patch.blueprint_data : existing.blueprint_data;
    const res = await this.pool.query<BlueprintRow>(
      `UPDATE blueprints
       SET name = $2, version = $3, author = $4, blueprint_data = $5::jsonb
       WHERE id = $1
       RETURNING id, name, version, author, blueprint_data, created_at`,
      [id, name, version, author, JSON.stringify(blueprint_data)],
    );
    return res.rows[0]!;
  }

  async delete(id: number): Promise<boolean> {
    const res = await this.pool.query("DELETE FROM blueprints WHERE id = $1", [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
