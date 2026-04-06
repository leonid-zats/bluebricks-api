import { createPrismaClient } from "./db/prisma.js";
import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const prisma = createPrismaClient();
const app = createApp(prisma);

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
