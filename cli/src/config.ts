import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface ShellMcpConfig {
  mode: "lite" | "full";
  shell?: string;
  defaultCwd?: string;
  maxSessions?: number;
  sessionTimeoutMs?: number;
  daemon?: {
    port: number;
    autoStart: boolean;
  };
}

const CONFIG_DIR = path.join(os.homedir(), ".shell-mcp");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const LOG_DIR = path.join(CONFIG_DIR, "logs");

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getLogDir(): string {
  return LOG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export async function loadConfig(): Promise<ShellMcpConfig | null> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as ShellMcpConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: ShellMcpConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function getDefaultConfig(): ShellMcpConfig {
  return {
    mode: "lite",
    maxSessions: 10,
    sessionTimeoutMs: 30 * 60 * 1000,
    daemon: {
      port: 7777,
      autoStart: true,
    },
  };
}

/**
 * Get the MCP client config file path for known clients.
 */
export function getMcpClientConfigPath(
  client: "claude-desktop" | "cursor"
): string {
  const platform = os.platform();

  if (client === "claude-desktop") {
    if (platform === "darwin") {
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json"
      );
    }
    if (platform === "win32") {
      return path.join(
        process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
        "Claude",
        "claude_desktop_config.json"
      );
    }
    // Linux
    return path.join(
      os.homedir(),
      ".config",
      "Claude",
      "claude_desktop_config.json"
    );
  }

  if (client === "cursor") {
    return path.join(os.homedir(), ".cursor", "mcp.json");
  }

  return "";
}
