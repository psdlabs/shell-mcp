import os from "node:os";
import type { Platform } from "./types.js";

export function getPlatform(): Platform {
  const p = os.platform();
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "linux"; // fallback for other Unix-like
}

export function isWindows(): boolean {
  return getPlatform() === "win32";
}

export function isMac(): boolean {
  return getPlatform() === "darwin";
}

export function getDefaultShellArgs(shell: string): string[] {
  const base = shell.toLowerCase();
  // Login shell for bash/zsh to load profiles
  if (base.includes("bash") || base.includes("zsh")) {
    return ["-l"];
  }
  // No special args for PowerShell, cmd, etc.
  return [];
}

export function getShellType(
  shell: string
): "bash" | "zsh" | "powershell" | "cmd" | "unknown" {
  const lower = shell.toLowerCase();
  if (lower.includes("zsh")) return "zsh";
  if (lower.includes("bash")) return "bash";
  if (lower.includes("pwsh") || lower.includes("powershell")) return "powershell";
  if (lower.includes("cmd")) return "cmd";
  return "unknown";
}
