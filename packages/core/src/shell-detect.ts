import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getPlatform } from "./platform.js";

const execFileAsync = promisify(execFile);

export async function detectDefaultShell(): Promise<string> {
  const platform = getPlatform();

  if (platform === "win32") {
    return detectWindowsShell();
  }

  // macOS / Linux: use $SHELL env var
  const envShell = process.env.SHELL;
  if (envShell) return envShell;

  // Fallback: parse /etc/passwd
  if (platform === "linux") {
    try {
      const { stdout } = await execFileAsync("getent", [
        "passwd",
        process.env.USER || "root",
      ]);
      const parts = stdout.trim().split(":");
      if (parts.length >= 7 && parts[6]) return parts[6];
    } catch {
      // ignore
    }
  }

  // macOS fallback: dscl
  if (platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("dscl", [
        ".",
        "-read",
        `/Users/${process.env.USER}`,
        "UserShell",
      ]);
      const match = stdout.match(/UserShell:\s*(.+)/);
      if (match) return match[1].trim();
    } catch {
      // ignore
    }
  }

  // Ultimate fallback
  return platform === "darwin" ? "/bin/zsh" : "/bin/bash";
}

async function detectWindowsShell(): Promise<string> {
  // Prefer PowerShell 7 (pwsh) via PATH
  try {
    const { stdout } = await execFileAsync("where", ["pwsh"]);
    const p = stdout.trim().split("\n")[0]?.trim();
    if (p) return p;
  } catch {
    // pwsh not in PATH
  }

  // Try PowerShell 5.1 via PATH
  try {
    const { stdout } = await execFileAsync("where", ["powershell"]);
    const p = stdout.trim().split("\n")[0]?.trim();
    if (p) return p;
  } catch {
    // not in PATH — try known locations
  }

  // Direct path checks (Claude Desktop / MCP servers may have stripped PATH)
  const { existsSync } = await import("node:fs");
  const knownPaths = [
    "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  ];
  for (const p of knownPaths) {
    if (existsSync(p)) return p;
  }

  // Last resort: cmd.exe
  return process.env.COMSPEC || "cmd.exe";
}
