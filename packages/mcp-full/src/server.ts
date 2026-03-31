import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DaemonClient } from "./daemon-client.js";
import { registerSessionTools } from "./tools/session-tools.js";
import { registerFsTools } from "./tools/fs-tools.js";
import { registerGitTools } from "./tools/git-tools.js";
import { registerProcessTools } from "./tools/process-tools.js";

export function createServer(client: DaemonClient): McpServer {
  const server = new McpServer({
    name: "shell-mcp",
    version: "0.1.0",
  });

  // Session tools delegate to daemon via HTTP
  registerSessionTools(server, client);

  // FS, git, and process tools run locally (no daemon needed)
  registerFsTools(server);
  registerGitTools(server);
  registerProcessTools(server);

  return server;
}
