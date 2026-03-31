#!/usr/bin/env node

import { SessionManager } from "@shell-mcp/core";
import { createApp } from "./app.js";

const PORT = parseInt(process.env.SHELL_MCP_PORT ?? "7777");
const HOST = "127.0.0.1"; // NEVER bind to 0.0.0.0 — local only

const manager = new SessionManager({
  maxSessions: parseInt(process.env.SHELL_MCP_MAX_SESSIONS ?? "10"),
  sessionTimeoutMs: parseInt(
    process.env.SHELL_MCP_TIMEOUT ?? String(30 * 60 * 1000)
  ),
  defaultCwd: process.env.SHELL_MCP_CWD ?? process.cwd(),
});

const app = createApp(manager);

app.listen(PORT, HOST, () => {
  console.error(`[shell-daemon] listening on http://${HOST}:${PORT}`);
});

// Graceful shutdown
function shutdown() {
  console.error("[shell-daemon] shutting down...");
  manager.dispose();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
