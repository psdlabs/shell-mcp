import { Router } from "express";
import type { SessionManager } from "@shell-mcp/core";

const startTime = Date.now();

export function healthRoutes(manager: SessionManager): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      uptime: (Date.now() - startTime) / 1000,
      sessions: manager.listSessions().length,
      version: "0.1.0",
    });
  });

  return router;
}
