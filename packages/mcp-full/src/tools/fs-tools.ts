import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

export function registerFsTools(server: McpServer): void {
  server.tool(
    "read_file",
    `Read the contents of a file at the given path. Returns the full text content.`,
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
      return { content: [{ type: "text" as const, text: content }] };
    }
  );

  server.tool(
    "write_file",
    `Write content to a file. Creates the file and parent directories if needed. Overwrites by default, or appends.`,
    {
      path: z.string().describe("Absolute or relative file path to write"),
      content: z.string().describe("Content to write to the file"),
      append: z.boolean().optional().default(false).describe("Append instead of overwrite"),
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
        await fs.appendFile(resolved, args.content, { encoding: args.encoding as BufferEncoding });
      } else {
        await fs.writeFile(resolved, args.content, { encoding: args.encoding as BufferEncoding });
      }
      const stat = await fs.stat(resolved);
      return {
        content: [{ type: "text" as const, text: `File written: ${resolved} (${stat.size} bytes)` }],
      };
    }
  );

  server.tool(
    "list_dir",
    `List directory contents with file metadata.`,
    {
      path: z.string().optional().default(".").describe("Directory path"),
      recursive: z.boolean().optional().default(false).describe("List recursively"),
    },
    async (args) => {
      const resolved = path.resolve(args.path);
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      const results: string[] = [];

      for (const entry of entries) {
        const fullPath = path.join(resolved, entry.name);
        try {
          const stat = await fs.stat(fullPath);
          const type = entry.isDirectory() ? "dir" : "file";
          const size = entry.isDirectory() ? "-" : `${stat.size}`;
          const modified = stat.mtime.toISOString().split("T")[0];
          results.push(`${type}\t${size}\t${modified}\t${entry.name}`);
        } catch {
          results.push(`?\t?\t?\t${entry.name}`);
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: results.length === 0
              ? "Directory is empty."
              : `${resolved}\n\nType\tSize\tModified\tName\n${results.join("\n")}`,
          },
        ],
      };
    }
  );
}
