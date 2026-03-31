import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

export function registerFsTools(server: McpServer): void {
  server.tool(
    "read_file",
    `Read the contents of a file at the given path. Returns the full text content. Use this for inspecting files, reviewing code, checking configs, etc.`,
    {
      path: z.string().describe("Absolute or relative file path to read"),
      encoding: z
        .enum(["utf-8", "ascii", "base64", "hex", "latin1"])
        .optional()
        .default("utf-8")
        .describe("File encoding (default utf-8)"),
    },
    async (args) => {
      const resolved = path.resolve(args.path);
      const content = await fs.readFile(resolved, {
        encoding: args.encoding as BufferEncoding,
      });
      return {
        content: [{ type: "text" as const, text: content }],
      };
    }
  );

  server.tool(
    "write_file",
    `ALWAYS use this tool to create or write files (HTML, CSS, JS, JSON, Python, config files, etc.). This is the correct way to write file content — do NOT use run_command with echo/cat/Set-Content to write files. Handles any file size, any content, creates parent directories automatically. Overwrites by default, or appends if enabled.`,
    {
      path: z.string().describe("Absolute or relative file path to write"),
      content: z.string().describe("Content to write to the file"),
      append: z
        .boolean()
        .optional()
        .default(false)
        .describe("Append instead of overwrite (default false)"),
      encoding: z
        .enum(["utf-8", "ascii", "base64", "hex", "latin1"])
        .optional()
        .default("utf-8")
        .describe("File encoding (default utf-8)"),
    },
    async (args) => {
      const resolved = path.resolve(args.path);
      await fs.mkdir(path.dirname(resolved), { recursive: true });

      if (args.append) {
        await fs.appendFile(resolved, args.content, {
          encoding: args.encoding as BufferEncoding,
        });
      } else {
        await fs.writeFile(resolved, args.content, {
          encoding: args.encoding as BufferEncoding,
        });
      }

      const stat = await fs.stat(resolved);
      return {
        content: [
          {
            type: "text" as const,
            text: `File written: ${resolved} (${stat.size} bytes)`,
          },
        ],
      };
    }
  );

  server.tool(
    "list_dir",
    `List the contents of a directory with file metadata (size, type, modified date). Use this to explore project structure, find files, etc.`,
    {
      path: z
        .string()
        .optional()
        .default(".")
        .describe("Directory path (default: current directory)"),
      recursive: z
        .boolean()
        .optional()
        .default(false)
        .describe("List recursively (default false)"),
    },
    async (args) => {
      const resolved = path.resolve(args.path);
      const entries = await fs.readdir(resolved, { withFileTypes: true });

      const results: string[] = [];

      for (const entry of entries) {
        const fullPath = path.join(resolved, entry.name);
        try {
          const stat = await fs.stat(fullPath);
          const type = entry.isDirectory()
            ? "dir"
            : entry.isSymbolicLink()
            ? "link"
            : "file";
          const size = entry.isDirectory() ? "-" : formatBytes(stat.size);
          const modified = stat.mtime.toISOString().split("T")[0];
          results.push(`${type}\t${size}\t${modified}\t${entry.name}`);
        } catch {
          results.push(`?\t?\t?\t${entry.name}`);
        }
      }

      if (args.recursive) {
        for (const entry of entries) {
          if (
            entry.isDirectory() &&
            !entry.name.startsWith(".") &&
            entry.name !== "node_modules"
          ) {
            const subPath = path.join(resolved, entry.name);
            try {
              const subEntries = await fs.readdir(subPath, {
                withFileTypes: true,
              });
              for (const sub of subEntries) {
                const subFull = path.join(subPath, sub.name);
                try {
                  const stat = await fs.stat(subFull);
                  const type = sub.isDirectory() ? "dir" : "file";
                  const size = sub.isDirectory()
                    ? "-"
                    : formatBytes(stat.size);
                  const modified = stat.mtime.toISOString().split("T")[0];
                  results.push(
                    `${type}\t${size}\t${modified}\t${entry.name}/${sub.name}`
                  );
                } catch {
                  results.push(`?\t?\t?\t${entry.name}/${sub.name}`);
                }
              }
            } catch {
              // skip inaccessible directories
            }
          }
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text:
              results.length === 0
                ? "Directory is empty."
                : `${resolved}\n\nType\tSize\tModified\tName\n${results.join("\n")}`,
          },
        ],
      };
    }
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
