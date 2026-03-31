import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionManager } from "@shell-mcp/core";
import { registerSessionTools } from "./tools/session-tools.js";
import { registerFsTools } from "./tools/fs-tools.js";
import { registerGitTools } from "./tools/git-tools.js";
import { registerProcessTools } from "./tools/process-tools.js";
import { registerAuditTools } from "./tools/audit-tools.js";

export function createServer(sessionManager: SessionManager): McpServer {
  const server = new McpServer({
    name: "shell-mcp",
    version: "0.1.0",
  });

  registerSessionTools(server, sessionManager);
  registerFsTools(server);
  registerGitTools(server);
  registerProcessTools(server);
  registerAuditTools(server, sessionManager);

  return server;
}
