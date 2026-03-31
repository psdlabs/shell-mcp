import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

const execFileAsync = promisify(execFile);

function isWindows(): boolean {
  return os.platform() === "win32";
}

export function registerProcessTools(server: McpServer): void {
  server.tool(
    "list_processes",
    `List running processes. Optionally filter by name.`,
    {
      filter: z.string().optional().describe("Filter by name (case-insensitive)"),
    },
    async (args) => {
      try {
        let output: string;
        if (isWindows()) {
          const { stdout } = await execFileAsync("tasklist", ["/FO", "CSV"], { maxBuffer: 5 * 1024 * 1024 });
          output = stdout;
        } else {
          const { stdout } = await execFileAsync("ps", ["aux"], { maxBuffer: 5 * 1024 * 1024 });
          output = stdout;
        }
        if (args.filter) {
          const filter = args.filter.toLowerCase();
          const lines = output.split("\n");
          output = [lines[0], ...lines.slice(1).filter((l) => l.toLowerCase().includes(filter))].join("\n");
        }
        return { content: [{ type: "text" as const, text: output.trim() }] };
      } catch (e: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "kill_process",
    `Send a signal to a process by PID.`,
    {
      pid: z.number().describe("Process ID to signal"),
      signal: z.enum(["SIGTERM", "SIGKILL", "SIGHUP", "SIGINT"]).optional().default("SIGTERM").describe("Signal"),
    },
    async (args) => {
      try {
        if (isWindows()) {
          await execFileAsync("taskkill", ["/PID", String(args.pid), "/F"]);
        } else {
          const sigMap: Record<string, string> = { SIGTERM: "TERM", SIGKILL: "KILL", SIGHUP: "HUP", SIGINT: "INT" };
          await execFileAsync("kill", [`-${sigMap[args.signal]}`, String(args.pid)]);
        }
        return { content: [{ type: "text" as const, text: `Sent ${args.signal} to PID ${args.pid}.` }] };
      } catch (e: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );
}
