import express from "express";
import type { PrismaClient } from "@prisma/client";
import { createBlueprintsRouter, blueprintErrorHandler } from "./routes/blueprintsRouter.js";

export function createApp(prisma: PrismaClient) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/blueprints", createBlueprintsRouter(prisma));
  app.use(blueprintErrorHandler);
  return app;
}
