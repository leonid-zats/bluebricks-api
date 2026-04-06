import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execSync } from "node:child_process";
import { createPrismaClient } from "../../src/db/prisma.js";
import { createApp } from "../../src/app.js";
import type { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bricksPath = path.join(__dirname, "../../bricks.json");

describe("Blueprint API (integration)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = "postgresql://blueprint:blueprint@127.0.0.1:5432/blueprints";
    }
    if (process.env.SKIP_FLYWAY_INTEGRATION !== "1") {
      execSync("bash scripts/migrate-flyway.sh", {
        cwd: path.join(__dirname, "../.."),
        stdio: "pipe",
        env: { ...process.env },
      });
    }
    prisma = createPrismaClient();
    app = createApp(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST 201 returns id and created_at", async () => {
    const res = await request(app)
      .post("/blueprints")
      .send({
        name: "t1",
        version: "0.0.1",
        author: "t@t.com",
        blueprint_data: { k: 1 },
      })
      .expect(201);
    expect(res.body).toMatchObject({
      name: "t1",
      version: "0.0.1",
      author: "t@t.com",
      blueprint_data: { k: 1 },
    });
    expect(typeof res.body.id).toBe("number");
    expect(typeof res.body.created_at).toBe("string");
  });

  it("POST 400 validation missing author", async () => {
    const res = await request(app)
      .post("/blueprints")
      .send({
        name: "x",
        version: "1",
        blueprint_data: {},
      })
      .expect(400);
    expect(res.body).toMatchObject({
      error: "validation_error",
      message: expect.stringMatching(/author/i) as string,
    });
  });

  it("GET by id 404", async () => {
    const res = await request(app).get("/blueprints/999999999").expect(404);
    expect(res.body).toEqual({
      error: "not_found",
      message: "Blueprint not found",
    });
  });

  it("GET by id 400 malformed", async () => {
    const res = await request(app).get("/blueprints/abc").expect(400);
    expect(res.body).toMatchObject({
      error: "bad_request",
      message: expect.stringMatching(/integer/) as string,
    });
  });

  it("GET list pagination and default sort", async () => {
    const res = await request(app).get("/blueprints?page=1&page_size=5").expect(200);
    expect(res.body).toMatchObject({
      page: 1,
      page_size: 5,
    });
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe("number");
    expect(typeof res.body.total_pages).toBe("number");
  });

  it("GET list 400 invalid page", async () => {
    const res = await request(app).get("/blueprints?page=0").expect(400);
    expect(res.body).toMatchObject({
      error: "validation_error",
      message: expect.any(String),
    });
  });

  it("GET list sort by name asc", async () => {
    await request(app).get("/blueprints?sort=name&order=asc&page_size=50").expect(200);
  });

  it("PUT merge and DELETE 204", async () => {
    const create = await request(app)
      .post("/blueprints")
      .send({
        name: "merge_me",
        version: "1",
        author: "a@b.c",
        blueprint_data: { a: 1 },
      })
      .expect(201);
    const id = create.body.id as number;

    const put = await request(app)
      .put(`/blueprints/${id}`)
      .send({ name: "merge_me_updated" })
      .expect(200);
    expect(put.body.name).toBe("merge_me_updated");
    expect(put.body.version).toBe("1");

    await request(app).delete(`/blueprints/${id}`).expect(204);
    await request(app).get(`/blueprints/${id}`).expect(404);
  });

  it("POST with Idempotency-Key: replay same body returns 200 and same id", async () => {
    const key = `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = {
      name: "idem_test",
      version: "1.0.0",
      author: "idem@example.com",
      blueprint_data: { x: 1 },
    };
    const first = await request(app)
      .post("/blueprints")
      .set("Idempotency-Key", key)
      .send(payload)
      .expect(201);
    const second = await request(app)
      .post("/blueprints")
      .set("Idempotency-Key", key)
      .send(payload)
      .expect(200);
    expect(second.body).toEqual(first.body);
    expect(second.body.id).toBe(first.body.id);
  });

  it("POST with Idempotency-Key: different body returns 409", async () => {
    const key = `idem-conflict-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await request(app)
      .post("/blueprints")
      .set("Idempotency-Key", key)
      .send({
        name: "a",
        version: "1",
        author: "a@b.c",
        blueprint_data: {},
      })
      .expect(201);
    const res = await request(app)
      .post("/blueprints")
      .set("Idempotency-Key", key)
      .send({
        name: "b",
        version: "1",
        author: "a@b.c",
        blueprint_data: {},
      })
      .expect(409);
    expect(res.body).toEqual({
      error: "conflict",
      message: "Idempotency-Key already used with a different request body",
    });
  });

  it("uses bricks.json for create and list", async () => {
    const raw = readFileSync(bricksPath, "utf-8");
    const doc = JSON.parse(raw) as {
      name: string;
      version: string;
      author: string;
      blueprint_data: Record<string, unknown>;
    };
    const create = await request(app).post("/blueprints").send(doc).expect(201);
    expect(create.body.blueprint_data).toEqual(doc.blueprint_data);

    const list = await request(app).get("/blueprints?page_size=100&sort=name&order=asc").expect(200);
    const found = list.body.items.find((b: { id: number }) => b.id === create.body.id);
    expect(found).toBeDefined();
    expect(found.blueprint_data).toEqual(doc.blueprint_data);
  });
});

describe("Blueprint API DB unavailable", () => {
  it("returns 503 when database refuses connection", async () => {
    const badPrisma = createPrismaClient("postgresql://blueprint:blueprint@127.0.0.1:65534/blueprints");
    const app = createApp(badPrisma);
    const res = await request(app).get("/blueprints").expect(503);
    expect(res.body).toEqual({
      error: "service_unavailable",
      message: "Database unavailable",
    });
    await badPrisma.$disconnect();
  });
});
