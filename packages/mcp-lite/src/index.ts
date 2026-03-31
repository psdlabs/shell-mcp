#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SessionManager } from "@shell-mcp/core";
import type { SafetyConfig, AuditConfig } from "@shell-mcp/core";
import { createServer } from "./server.js";

// Parse safety config from environment
function parseSafetyConfig(): SafetyConfig | undefined {
  const blocklist = process.env.SHELL_MCP_BLOCKLIST;
  const allowlist = process.env.SHELL_MCP_ALLOWLIST;
  const warnPatterns = process.env.SHELL_MCP_WARN_PATTERNS;
  const defaultDeny = process.env.SHELL_MCP_DEFAULT_DENY;

  if (!blocklist && !allowlist && !warnPatterns && !defaultDeny) {
    return undefined; // Use defaults
  }

  return {
    blocklist: blocklist ? blocklist.split(",").map((s) => s.trim()) : undefined,
    allowlist: allowlist ? allowlist.split(",").map((s) => s.trim()) : undefined,
    warnPatterns: warnPatterns
      ? warnPatterns.split(",").map((s) => s.trim())
      : undefined,
    defaultDeny: defaultDeny === "true",
  };
}

// Parse audit config from environment
function parseAuditConfig(): AuditConfig | undefined {
  const enabled = process.env.SHELL_MCP_AUDIT;
  const logDir = process.env.SHELL_MCP_AUDIT_DIR;

  if (!enabled && !logDir) {
    return undefined; // Use defaults (enabled, ~/.shell-mcp/logs/)
  }

  return {
    enabled: enabled !== "false", // enabled by default
    logDir: logDir || undefined,
  };
}

const manager = new SessionManager({
  maxSessions: parseInt(process.env.SHELL_MCP_MAX_SESSIONS ?? "10"),
  sessionTimeoutMs: parseInt(
    process.env.SHELL_MCP_TIMEOUT ?? String(30 * 60 * 1000)
  ),
  defaultCwd: process.env.SHELL_MCP_CWD ?? process.cwd(),
  defaultShell: process.env.SHELL_MCP_SHELL || undefined,
  safety: parseSafetyConfig(),
  audit: parseAuditConfig(),
});

const server = createServer(manager);
const transport = new StdioServerTransport();
await server.connect(transport);

// Graceful shutdown
function shutdown() {
  manager.dispose();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
