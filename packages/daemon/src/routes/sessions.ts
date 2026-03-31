import { Router } from "express";
import type { SessionManager } from "@shell-mcp/core";

export function sessionRoutes(manager: SessionManager): Router {
  const router = Router();

  // Create session
  router.post("/", async (req, res, next) => {
    try {
      const { name, shell, cwd } = req.body ?? {};
      const session = await manager.createSession({ name, shell, cwd });
      res.status(201).json(session);
    } catch (e) {
      next(e);
    }
  });

  // List sessions
  router.get("/", (_req, res) => {
    res.json(manager.listSessions());
  });

  // Get session
  router.get("/:id", (req, res) => {
    const session = manager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(session);
  });

  // Delete session
  router.delete("/:id", (req, res) => {
    const killed = manager.killSession(req.params.id);
    if (!killed) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ status: "terminated" });
  });

  // Execute command
  router.post("/:id/exec", async (req, res, next) => {
    try {
      const { command, timeout_ms } = req.body ?? {};
      if (!command) {
        res.status(400).json({ error: "command is required" });
        return;
      }
      const result = await manager.exec(
        req.params.id,
        command,
        timeout_ms ?? 30000
      );
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Get CWD
  router.get("/:id/cwd", (req, res) => {
    try {
      const cwd = manager.getCwd(req.params.id);
      res.json({ cwd });
    } catch (e) {
      res.status(404).json({ error: (e as Error).message });
    }
  });

  return router;
}
