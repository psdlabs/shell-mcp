#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DaemonClient } from "./daemon-client.js";
import { createServer } from "./server.js";

const daemonUrl =
  process.env.SHELL_MCP_DAEMON_URL ?? "http://127.0.0.1:7777";
const client = new DaemonClient(daemonUrl);

// Health check — fail fast if daemon is not running
try {
  await client.health();
} catch {
  console.error(
    `[shell-mcp-full] Cannot reach daemon at ${daemonUrl}. Is shell-daemon running?\n` +
      `  Start it with: shell-mcp start\n` +
      `  Or install it: npx shell-mcp init`
  );
  process.exit(1);
}

const server = createServer(client);
const transport = new StdioServerTransport();
await server.connect(transport);

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
