import { Router, type Request, type Response, type NextFunction } from "express";
import type pg from "pg";
import { ZodError } from "zod";
import { HttpError } from "../errors.js";
import { BlueprintRepository } from "../repository/BlueprintRepository.js";
import { blueprintToJson } from "../serialization.js";
import { createBlueprintSchema, mergeUpdateSchema, bodyErrorMessage } from "../validation/body.js";
import { parseListQuery, listQueryErrorMessage } from "../validation/listQuery.js";

function parseIdParam(raw: string | string[] | undefined): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s === undefined || s === "") {
    throw new HttpError(400, "bad_request", "Missing id");
  }
  if (!/^\d+$/.test(s)) {
    throw new HttpError(400, "bad_request", "id must be a positive integer");
  }
  const n = Number.parseInt(s, 10);
  if (n < 1) {
    throw new HttpError(400, "bad_request", "id must be a positive integer");
  }
  return n;
}

function isDbConnectionError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: string }).code;
    return c === "ECONNREFUSED" || c === "ETIMEDOUT" || c === "ENOTFOUND";
  }
  return false;
}

export function createBlueprintsRouter(pool: pg.Pool): Router {
  const repo = new BlueprintRepository(pool);
  const r = Router();

  r.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createBlueprintSchema.parse(req.body);
      const row = await repo.create({
        name: body.name,
        version: body.version,
        author: body.author,
        blueprint_data: body.blueprint_data,
      });
      res.status(201).json(blueprintToJson(row));
    } catch (e) {
      next(e);
    }
  });

  r.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = parseListQuery(req.query as Record<string, unknown>);
      const { rows, total } = await repo.list(q.page, q.pageSize, q.sort, q.order, q.useDefaultSort);
      const total_pages = total === 0 ? 0 : Math.ceil(total / q.pageSize);
      res.json({
        items: rows.map(blueprintToJson),
        page: q.page,
        page_size: q.pageSize,
        total,
        total_pages,
      });
    } catch (e) {
      next(e);
    }
  });

  r.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseIdParam(req.params.id);
      const row = await repo.findById(id);
      if (!row) {
        throw new HttpError(404, "not_found", "Blueprint not found");
      }
      res.json(blueprintToJson(row));
    } catch (e) {
      next(e);
    }
  });

  r.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseIdParam(req.params.id);
      const body = mergeUpdateSchema.parse(req.body);
      const row = await repo.updateMerge(id, body);
      res.json(blueprintToJson(row));
    } catch (e) {
      next(e);
    }
  });

  r.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseIdParam(req.params.id);
      const ok = await repo.delete(id);
      if (!ok) {
        throw new HttpError(404, "not_found", "Blueprint not found");
      }
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });

  return r;
}

export function blueprintErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json(err.toBody());
    return;
  }
  if (err instanceof ZodError) {
    const isListQuery = _req.method === "GET" && _req.path === "/" && _req.baseUrl.endsWith("/blueprints");
    res.status(400).json({
      error: "validation_error",
      message: isListQuery ? listQueryErrorMessage(err) : bodyErrorMessage(err),
    });
    return;
  }
  if (isDbConnectionError(err)) {
    res.status(503).json({
      error: "service_unavailable",
      message: "Database unavailable",
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error", message: "Internal server error" });
}
