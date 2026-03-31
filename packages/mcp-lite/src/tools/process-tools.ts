import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isWindows } from "@shell-mcp/core";

const execFileAsync = promisify(execFile);

export function registerProcessTools(server: McpServer): void {
  server.tool(
    "list_processes",
    `List running processes on the system. Optionally filter by name. Useful for finding PIDs, checking if servers are running, etc.`,
    {
      filter: z
        .string()
        .optional()
        .describe("Filter processes by name (case-insensitive substring match)"),
    },
    async (args) => {
      try {
        let output: string;

        if (isWindows()) {
          const { stdout } = await execFileAsync("tasklist", ["/FO", "CSV"], {
            maxBuffer: 5 * 1024 * 1024,
          });
          output = stdout;

          if (args.filter) {
            const filter = args.filter.toLowerCase();
            const lines = output.split("\n");
            output = [
              lines[0],
              ...lines.slice(1).filter((l) => l.toLowerCase().includes(filter)),
            ].join("\n");
          }
        } else {
          const { stdout } = await execFileAsync("ps", ["aux"], {
            maxBuffer: 5 * 1024 * 1024,
          });
          output = stdout;

          if (args.filter) {
            const filter = args.filter.toLowerCase();
            const lines = output.split("\n");
            output = [
              lines[0],
              ...lines.slice(1).filter((l) => l.toLowerCase().includes(filter)),
            ].join("\n");
          }
        }

        return {
          content: [{ type: "text" as const, text: output.trim() }],
        };
      } catch (e: unknown) {
        const err = e as Error;
        return {
          content: [
            { type: "text" as const, text: `Error: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "kill_process",
    `Send a signal to a process by PID. Default signal is SIGTERM. Use SIGKILL for force kill.`,
    {
      pid: z.number().describe("Process ID to signal"),
      signal: z
        .enum(["SIGTERM", "SIGKILL", "SIGHUP", "SIGINT"])
        .optional()
        .default("SIGTERM")
        .describe("Signal to send (default SIGTERM)"),
    },
    async (args) => {
      try {
        if (isWindows()) {
          const forceFlag =
            args.signal === "SIGKILL" || args.signal === "SIGTERM"
              ? ["/F"]
              : [];
          await execFileAsync("taskkill", [
            "/PID",
            String(args.pid),
            ...forceFlag,
          ]);
        } else {
          const signalMap: Record<string, string> = {
            SIGTERM: "TERM",
            SIGKILL: "KILL",
            SIGHUP: "HUP",
            SIGINT: "INT",
          };
          await execFileAsync("kill", [
            `-${signalMap[args.signal]}`,
            String(args.pid),
          ]);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Sent ${args.signal} to PID ${args.pid}.`,
            },
          ],
        };
      } catch (e: unknown) {
        const err = e as Error;
        return {
          content: [
            { type: "text" as const, text: `Error: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
