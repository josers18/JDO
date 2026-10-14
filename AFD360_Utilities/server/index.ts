import path from "node:path";
import express from "express";
import { PORT, ROOT, SANDBOX_PORT } from "./env.ts";
import { api } from "./routes.ts";
import { mcpApi } from "./mcpRoutes.ts";
import { startSandbox } from "./sandbox.ts";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/api/mcp", mcpApi);
app.use("/api", api);

// Production (and Heroku later): one process serves the built React app too.
if (process.env.NODE_ENV === "production") {
  const dist = path.join(ROOT, "web", "dist");
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

// Local tool: loopback only until the app has its own login (set HOST explicitly to change).
const host = process.env.HOST || "127.0.0.1";
startSandbox(SANDBOX_PORT);
app.listen(PORT, host, () => console.log(`[server] AFD360_Utilities API on http://${host}:${PORT}`));
