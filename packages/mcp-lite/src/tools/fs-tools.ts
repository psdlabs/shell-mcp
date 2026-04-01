import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

export function registerFsTools(server: McpServer): void {
  server.tool(
    "read_file",
    `Read the contents of a file. Use this instead of cat/type to avoid encoding issues and handle large files cleanly.`,
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
    `Create or write files. ALWAYS use this instead of echo/cat/Set-Content — it handles any content, any size, creates parent directories automatically. For appending, set append to true.`,
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
}
