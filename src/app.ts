import express from "express";
import type pg from "pg";
import { createBlueprintsRouter, blueprintErrorHandler } from "./routes/blueprintsRouter.js";

export function createApp(pool: pg.Pool) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/blueprints", createBlueprintsRouter(pool));
  app.use(blueprintErrorHandler);
  return app;
}
