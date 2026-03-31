import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

async function git(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, {
    cwd: path.resolve(cwd),
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000,
  });
}

export function registerGitTools(server: McpServer): void {
  server.tool(
    "git_status",
    `Get the git status of a repository using porcelain v2 format. Shows staged/unstaged changes, branch info, and untracked files.`,
    {
      cwd: z
        .string()
        .optional()
        .default(".")
        .describe("Repository directory"),
    },
    async (args) => {
      try {
        const { stdout } = await git(
          ["status", "--porcelain=v2", "--branch"],
          args.cwd
        );
        return {
          content: [
            {
              type: "text" as const,
              text: stdout || "Working tree clean.",
            },
          ],
        };
      } catch (e: unknown) {
        const err = e as Error & { stderr?: string };
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err.stderr || err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "git_log",
    `View recent git commit history. Returns commit hashes, authors, dates, and messages.`,
    {
      cwd: z
        .string()
        .optional()
        .default(".")
        .describe("Repository directory"),
      count: z
        .number()
        .optional()
        .default(10)
        .describe("Number of commits to show (default 10)"),
      format: z
        .string()
        .optional()
        .default("oneline")
        .describe("Git log format: oneline, short, medium, full (default oneline)"),
    },
    async (args) => {
      try {
        const formatMap: Record<string, string> = {
          oneline: "%h %s",
          short: "%h %an: %s",
          medium: "%h %an (%ar): %s",
          full: "%H%nAuthor: %an <%ae>%nDate: %ai%n%n    %s%n",
        };
        const fmt = formatMap[args.format] ?? formatMap["oneline"];
        const { stdout } = await git(
          ["log", `--pretty=format:${fmt}`, `-${args.count}`],
          args.cwd
        );
        return {
          content: [
            { type: "text" as const, text: stdout || "No commits found." },
          ],
        };
      } catch (e: unknown) {
        const err = e as Error & { stderr?: string };
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err.stderr || err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "git_diff",
    `Show git diff for staged changes, unstaged changes, or between refs. Optionally filter to specific files.`,
    {
      cwd: z
        .string()
        .optional()
        .default(".")
        .describe("Repository directory"),
      staged: z
        .boolean()
        .optional()
        .default(false)
        .describe("Show staged changes (--cached)"),
      ref: z
        .string()
        .optional()
        .describe("Ref or ref range to diff (e.g. 'HEAD~3', 'main...feature')"),
      path: z
        .string()
        .optional()
        .describe("Filter diff to specific file or directory"),
    },
    async (args) => {
      try {
        const gitArgs = ["diff"];
        if (args.staged) gitArgs.push("--cached");
        if (args.ref) gitArgs.push(args.ref);
        if (args.path) {
          gitArgs.push("--");
          gitArgs.push(args.path);
        }
        const { stdout } = await git(gitArgs, args.cwd);
        return {
          content: [
            { type: "text" as const, text: stdout || "No diff output." },
          ],
        };
      } catch (e: unknown) {
        const err = e as Error & { stderr?: string };
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err.stderr || err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
