import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { HttpError } from "../errors.js";
import type { IBlueprintRepository, ListSortColumn } from "./IBlueprintRepository.js";
import type { BlueprintRow, CreateBlueprintInput, MergePatch } from "./types.js";

function toRow(b: {
  id: number;
  name: string;
  version: string;
  author: string;
  blueprint_data: Prisma.JsonValue;
  created_at: Date;
  idempotency_key: string | null;
}): BlueprintRow {
  return {
    id: b.id,
    name: b.name,
    version: b.version,
    author: b.author,
    blueprint_data: b.blueprint_data as unknown,
    created_at: b.created_at,
    idempotency_key: b.idempotency_key,
  };
}

export class PrismaBlueprintRepository implements IBlueprintRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateBlueprintInput): Promise<BlueprintRow> {
    const created = await this.prisma.blueprint.create({
      data: {
        name: input.name,
        version: input.version,
        author: input.author,
        blueprint_data: input.blueprint_data as Prisma.InputJsonValue,
        idempotency_key: input.idempotency_key,
      },
    });
    return toRow(created);
  }

  async findById(id: number): Promise<BlueprintRow | null> {
    const row = await this.prisma.blueprint.findUnique({ where: { id } });
    return row ? toRow(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<BlueprintRow | null> {
    const row = await this.prisma.blueprint.findUnique({
      where: { idempotency_key: key },
    });
    return row ? toRow(row) : null;
  }

  async list(
    page: number,
    pageSize: number,
    sort: ListSortColumn | undefined,
    order: "asc" | "desc",
    useDefaultSort: boolean,
  ): Promise<{ rows: BlueprintRow[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const dir = order === "asc" ? Prisma.SortOrder.asc : Prisma.SortOrder.desc;

    const orderBy: Prisma.BlueprintOrderByWithRelationInput[] = useDefaultSort
      ? [{ created_at: Prisma.SortOrder.desc }, { id: Prisma.SortOrder.desc }]
      : sort === "name"
        ? [{ name: dir }, { id: dir }]
        : sort === "version"
          ? [{ version: dir }, { id: dir }]
          : [{ created_at: dir }, { id: dir }];

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.blueprint.findMany({
        orderBy,
        take: pageSize,
        skip: offset,
      }),
      this.prisma.blueprint.count(),
    ]);

    return { rows: rows.map(toRow), total };
  }

  async updateMerge(id: number, patch: MergePatch): Promise<BlueprintRow> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new HttpError(404, "not_found", "Blueprint not found");
    }
    const name = patch.name ?? existing.name;
    const version = patch.version ?? existing.version;
    const author = patch.author ?? existing.author;
    const blueprint_data =
      patch.blueprint_data !== undefined ? patch.blueprint_data : existing.blueprint_data;

    const updated = await this.prisma.blueprint.update({
      where: { id },
      data: {
        name,
        version,
        author,
        blueprint_data: blueprint_data as Prisma.InputJsonValue,
      },
    });
    return toRow(updated);
  }

  async delete(id: number): Promise<boolean> {
    try {
      await this.prisma.blueprint.delete({ where: { id } });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return false;
      }
      throw e;
    }
  }
}
