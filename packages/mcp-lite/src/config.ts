import type { SafetyConfig } from "@shell-mcp/core";

function parseSafetyBoolean(
  name: string,
  value: string | undefined
): boolean | undefined {
  if (value === undefined) return undefined;

  switch (value.trim().toLowerCase()) {
    case "true":
    case "1":
      return true;
    case "false":
    case "0":
      return false;
    default:
      throw new Error(
        `${name} must be one of true, 1, false, or 0; received "${value}"`
      );
  }
}

export function parseSafetyConfig(
  env: NodeJS.ProcessEnv = process.env
): SafetyConfig | undefined {
  const blocklist = env.SHELL_MCP_BLOCKLIST;
  const allowlist = env.SHELL_MCP_ALLOWLIST;
  const warnPatterns = env.SHELL_MCP_WARN_PATTERNS;
  const defaultDeny = env.SHELL_MCP_DEFAULT_DENY;
  const failClosedValue = env.SHELL_MCP_SAFETY_FAIL_CLOSED;
  const failClosed = parseSafetyBoolean(
    "SHELL_MCP_SAFETY_FAIL_CLOSED",
    failClosedValue
  );

  if (
    !blocklist &&
    !allowlist &&
    !warnPatterns &&
    !defaultDeny &&
    failClosedValue === undefined
  ) {
    return undefined;
  }

  return {
    blocklist: blocklist ? blocklist.split(",").map((s) => s.trim()) : undefined,
    allowlist: allowlist ? allowlist.split(",").map((s) => s.trim()) : undefined,
    warnPatterns: warnPatterns
      ? warnPatterns.split(",").map((s) => s.trim())
      : undefined,
    defaultDeny: defaultDeny === "true",
    failClosed,
  };
}
