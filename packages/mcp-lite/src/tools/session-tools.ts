import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SessionManager, ExecOptions } from "@shell-mcp/core";

/**
 * Auto-session: the LLM can call run_command without calling new_session first.
 * If session_id is omitted or "default", we auto-create/reuse a default session.
 * This eliminates the most common friction: two round-trips just to run `ls`.
 */
let defaultSessionId: string | null = null;

async function getOrCreateSession(
  manager: SessionManager,
  sessionId?: string
): Promise<string> {
  // Explicit session ID provided
  if (sessionId && sessionId !== "default") {
    return sessionId;
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
    "new_session",
    `Create a new named shell session. Only needed when you want multiple parallel sessions (e.g. running a server in one and tests in another). For single-session use, just call run_command directly — it auto-creates a default session.`,
    {
      name: z
        .string()
        .optional()
        .describe("Human-readable session name (e.g. 'backend', 'tests')"),
      shell: z
        .string()
        .optional()
        .describe(
          "Shell to use (e.g. /bin/bash, /bin/zsh, powershell). Auto-detected if omitted."
        ),
      cwd: z
        .string()
        .optional()
        .describe("Initial working directory. Defaults to server's cwd."),
    },
    async (args) => {
      const session = await manager.createSession(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(session, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "run_command",
    `Execute a shell command on the user's local machine in a persistent session. State persists between calls — cd, env vars, nvm use, conda activate all carry over.

IMPORTANT: Do NOT use this tool to write or create files. Use the write_file tool instead — it handles any content size, multiline content, and special characters correctly. run_command is for running programs, installing packages, starting servers, running tests, git operations, etc.

Safety: Commands are checked against safety guardrails before execution. Destructive commands (rm -rf /, DROP DATABASE, etc.) are blocked automatically.

Smart timeout: Long-running commands (npm install, docker build) auto-extend their timeout while producing output. Commands only timeout after prolonged silence or hitting the 5-minute absolute cap.

You do NOT need to call new_session first — omit session_id and a default session is created automatically.`,
    {
      session_id: z
        .string()
        .optional()
        .describe("Session ID. Omit to use auto-created default session."),
      command: z.string().describe("Shell command to execute"),
      timeout_ms: z
        .number()
        .optional()
        .default(30000)
        .describe(
          "Idle timeout in ms (default 30000). With smart timeout, this is how long to wait for silence before timing out. Absolute max is 5 minutes."
        ),
    },
    async (args) => {
      const sid = await getOrCreateSession(manager, args.session_id);

      // Build exec options with smart timeout and streaming
      const outputChunks: string[] = [];
      const execOptions: ExecOptions = {
        timeoutMs: args.timeout_ms,
        smartTimeout: true,
        idleTimeoutMs: args.timeout_ms,
        maxTimeoutMs: 300000, // 5 min absolute cap
        onOutput: (chunk: string) => {
          outputChunks.push(chunk);
        },
      };

      const result = await manager.exec(sid, args.command, execOptions);

      // Build response
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

  server.tool(
    "list_sessions",
    `List all active shell sessions with their IDs, names, working directories, and uptime.`,
    {},
    async () => {
      const sessions = manager.listSessions();
      return {
        content: [
          {
            type: "text" as const,
            text:
              sessions.length === 0
                ? "No active sessions."
                : JSON.stringify(sessions, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "kill_session",
    `Terminate a shell session. Use this to clean up sessions no longer needed.`,
    {
      session_id: z.string().describe("Session ID to kill"),
    },
    async (args) => {
      if (args.session_id === defaultSessionId) {
        defaultSessionId = null;
      }
      const killed = manager.killSession(args.session_id);
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
