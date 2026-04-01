import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SessionManager, ExecOptions } from "@shell-mcp/core";

/**
 * Auto-session: run_command auto-creates/reuses a default session.
 * Named sessions are created on-demand when a session_id is provided.
 */
let defaultSessionId: string | null = null;

async function getOrCreateSession(
  manager: SessionManager,
  sessionId?: string
): Promise<string> {
  // Explicit session ID — create on demand if it doesn't exist
  if (sessionId && sessionId !== "default") {
    const existing = manager.getSession(sessionId);
    if (existing?.alive) return sessionId;
    // Create a named session on the fly
    const session = await manager.createSession({ name: sessionId });
    return session.id;
  }

  // Reuse existing default session if alive
  if (defaultSessionId) {
    const session = manager.getSession(defaultSessionId);
    if (session?.alive) return defaultSessionId;
    defaultSessionId = null;
  }

  // Auto-create default session
  const session = await manager.createSession({ name: "default" });
  defaultSessionId = session.id;
  return session.id;
}

export function registerSessionTools(
  server: McpServer,
  manager: SessionManager
): void {
  server.tool(
    "run_command",
    `Execute a shell command on the user's machine. This is the primary tool — use it for everything: running programs, installing packages, git operations, listing files, managing processes, starting servers, running tests, etc.

State persists between calls — cd, env vars, nvm use, conda activate all carry over.

To run commands in parallel sessions, pass different session_id values (sessions are created automatically).

Do NOT use this to write files — use write_file instead (handles multiline content and special characters correctly).

Safety: Destructive commands (rm -rf /, DROP DATABASE, etc.) are blocked automatically.
Smart timeout: Long-running commands auto-extend while producing output. Only times out after silence or 5-minute cap.`,
    {
      command: z.string().describe("Shell command to execute"),
      session_id: z
        .string()
        .optional()
        .describe(
          "Session name for parallel work (e.g. 'server', 'tests'). Omit for default session. Sessions are created automatically."
        ),
      timeout_ms: z
        .number()
        .optional()
        .default(30000)
        .describe(
          "Idle timeout in ms (default 30000). Resets on output. Absolute max 5 minutes."
        ),
    },
    async (args) => {
      const sid = await getOrCreateSession(manager, args.session_id);

      const outputChunks: string[] = [];
      const execOptions: ExecOptions = {
        timeoutMs: args.timeout_ms,
        smartTimeout: true,
        idleTimeoutMs: args.timeout_ms,
        maxTimeoutMs: 300000,
        onOutput: (chunk: string) => {
          outputChunks.push(chunk);
        },
      };

      const result = await manager.exec(sid, args.command, execOptions);

      const lines: string[] = [
        `Exit code: ${result.exitCode}`,
        `CWD: ${result.cwd}`,
        `Duration: ${result.durationMs}ms`,
        `Session: ${sid}`,
      ];

      if (result.timedOut) {
        lines.push(`Status: TIMED OUT`);
      }
      if (result.warning) {
        lines.push(`Warning: ${result.warning}`);
      }

      lines.push("", result.output);

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n"),
          },
        ],
      };
    }
  );
}
