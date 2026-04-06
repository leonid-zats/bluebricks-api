import { createPool } from "./db/pool.js";
import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const pool = createPool();
const app = createApp(pool);

app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
