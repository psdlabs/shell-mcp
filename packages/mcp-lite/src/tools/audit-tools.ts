import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SessionManager } from "@shell-mcp/core";

export function registerAuditTools(
  server: McpServer,
  manager: SessionManager
): void {
  server.tool(
    "get_audit_log",
    `View the recent command execution history (audit trail). Shows what commands were run, when, exit codes, and whether any were blocked by safety guardrails. Useful for reviewing what happened in a session.`,
    {
      count: z
        .number()
        .optional()
        .default(20)
        .describe("Number of recent entries to return (default 20)"),
    },
    async (args) => {
      const entries = manager.audit.readRecent(args.count);
      if (entries.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No audit entries found." }],
        };
      }

      const lines = entries.map((e) => {
        const status = e.blocked
          ? `BLOCKED: ${e.blockReason}`
          : e.timedOut
          ? `TIMEOUT (exit ${e.exitCode})`
          : `exit ${e.exitCode}`;
        const warn = e.warning ? ` [WARNING: ${e.warning}]` : "";
        return `[${e.timestamp}] ${e.sessionName} | ${e.command} | ${status} | ${e.durationMs}ms${warn}`;
      });

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );

  server.tool(
    "get_safety_config",
    `View the current safety guardrail configuration. Shows which command patterns are blocked, which trigger warnings, and whether an allowlist is active. This configuration is read-only — it can only be changed via environment variables or config file.`,
    {},
    async () => {
      const config = manager.safety.getConfig();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                defaultDeny: config.defaultDeny,
                blockedPatterns: config.blocklist.length,
                allowlistActive: config.allowlist !== null,
                allowlistPatterns: config.allowlist?.length ?? 0,
                warnPatterns: config.warnPatterns.length,
                blocklist: config.blocklist,
                allowlist: config.allowlist,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
