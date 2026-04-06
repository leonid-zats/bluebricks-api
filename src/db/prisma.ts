import { PrismaClient } from "@prisma/client";

export function createPrismaClient(overrideUrl?: string): PrismaClient {
  const url = overrideUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return new PrismaClient({
    datasources: {
      db: { url },
    },
  });
}
