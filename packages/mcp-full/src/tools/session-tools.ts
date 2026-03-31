import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DaemonClient } from "../daemon-client.js";

export function registerSessionTools(
  server: McpServer,
  client: DaemonClient
): void {
  server.tool(
    "new_session",
    `Create a new persistent shell session on the user's machine. Each session is a real PTY process (bash/zsh/powershell) with full state. Use sessions for any work requiring terminal access. Returns the session ID needed for run_command.`,
    {
      name: z
        .string()
        .optional()
        .describe("Human-readable session name (e.g. 'backend', 'tests')"),
      shell: z
        .string()
        .optional()
        .describe("Shell to use (e.g. /bin/bash, /bin/zsh, powershell). Auto-detected if omitted."),
      cwd: z
        .string()
        .optional()
        .describe("Initial working directory. Defaults to server's cwd."),
    },
    async (args) => {
      const session = await client.createSession(args);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(session, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "run_command",
    `Execute a shell command in a persistent PTY session on the user's local machine. Call this automatically whenever the user asks to build, run, test, install packages, start servers, check logs, or perform ANY task requiring terminal access. State persists between calls — cd, environment variables, nvm use, conda activate, etc. all carry over. Do not ask the user to run commands themselves — just call this tool.`,
    {
      session_id: z.string().describe("Session ID from new_session"),
      command: z.string().describe("Shell command to execute"),
      timeout_ms: z
        .number()
        .optional()
        .default(30000)
        .describe("Timeout in milliseconds (default 30000)"),
    },
    async (args) => {
      const result = await client.exec(
        args.session_id,
        args.command,
        args.timeout_ms
      );
      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Exit code: ${result.exitCode}`,
              `CWD: ${result.cwd}`,
              `Duration: ${result.durationMs}ms`,
              "",
              result.output,
            ].join("\n"),
          },
        ],
      };
    }
  );

  server.tool(
    "list_sessions",
    `List all active shell sessions with their IDs, names, working directories, and uptime.`,
    {},
    async () => {
      const sessions = await client.listSessions();
      return {
        content: [
          {
            type: "text" as const,
            text:
              sessions.length === 0
                ? "No active sessions. Create one with new_session."
                : JSON.stringify(sessions, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "kill_session",
    `Terminate a shell session and its underlying PTY process. Use this to clean up sessions that are no longer needed.`,
    {
      session_id: z.string().describe("Session ID to kill"),
    },
    async (args) => {
      const killed = await client.killSession(args.session_id);
      return {
        content: [
          {
            type: "text" as const,
            text: killed
              ? "Session terminated successfully."
              : "Session not found.",
          },
        ],
      };
    }
  );
}
