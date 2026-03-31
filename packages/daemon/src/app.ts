import express from "express";
import type { SessionManager } from "@shell-mcp/core";
import { sessionRoutes } from "./routes/sessions.js";
import { healthRoutes } from "./routes/health.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp(manager: SessionManager): express.Application {
  const app = express();

  app.use(express.json());

  app.use("/sessions", sessionRoutes(manager));
  app.use("/", healthRoutes(manager));

  app.use(errorHandler);

  return app;
}
