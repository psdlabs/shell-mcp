import { Command } from "commander";
import { select, confirm, input } from "@inquirer/prompts";
import chalk from "chalk";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  saveConfig,
  getDefaultConfig,
  getMcpClientConfigPath,
  getConfigPath,
  type ShellMcpConfig,
} from "../config.js";

export const initCommand = new Command("init")
  .description("Interactive setup wizard for shell-mcp")
  .option("--no-telemetry", "Skip anonymous telemetry ping")
  .action(async (opts) => {
    console.log(
      chalk.bold("\n  shell-mcp ") + chalk.dim("— persistent shell for MCP clients\n")
    );

    // 1. Mode selection
    const mode = await select<"lite" | "full">({
      message: "Choose mode:",
      choices: [
        {
          value: "lite" as const,
          name: "Lite  — simple, sessions reset on restart",
        },
        {
          value: "full" as const,
          name: "Full  — daemon, sessions persist forever",
        },
      ],
    });

    // 2. Working directory
    const defaultCwd = await input({
      message: "Default working directory:",
      default: os.homedir(),
    });

    // 3. Full mode options
    let port = 7777;
    let autoStart = true;
    if (mode === "full") {
      const portStr = await input({
        message: "Daemon port:",
        default: "7777",
      });
      port = parseInt(portStr) || 7777;

      autoStart = await confirm({
        message: "Auto-start daemon on login?",
        default: true,
      });
    }

    // 4. Build config
    const config: ShellMcpConfig = {
      ...getDefaultConfig(),
      mode,
      defaultCwd,
      daemon: { port, autoStart },
    };

    await saveConfig(config);
    console.log(chalk.green("  ✓") + ` Config saved to ${getConfigPath()}`);

    // 5. Client selection
    const clients = await select({
      message: "Configure MCP client:",
      choices: [
        { value: "claude-desktop", name: "Claude Desktop" },
        { value: "cursor", name: "Cursor" },
        { value: "skip", name: "Skip — I'll configure manually" },
      ],
    });

    if (clients !== "skip") {
      await writeMcpClientConfig(
        clients as "claude-desktop" | "cursor",
        config
      );
    }

    // 6. Telemetry (opt-out)
    if (opts.telemetry !== false) {
      try {
        await fetch("https://telemetry.shell-mcp.dev/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: "0.1.0",
            platform: os.platform(),
            mode,
            node_version: process.version,
          }),
          signal: AbortSignal.timeout(3000),
        });
      } catch {
        // Silently ignore telemetry failures
      }
    }

    console.log(
      chalk.bold.green("\n  ✓ Setup complete!\n")
    );

    if (mode === "lite") {
      console.log(
        chalk.dim("  Restart your MCP client to activate shell-mcp.\n")
      );
    } else {
      console.log(
        chalk.dim(
          "  Start the daemon with: shell-mcp start\n" +
            "  Then restart your MCP client.\n"
        )
      );
    }
  });

async function writeMcpClientConfig(
  client: "claude-desktop" | "cursor",
  config: ShellMcpConfig
): Promise<void> {
  const configPath = getMcpClientConfigPath(client);

  // Resolve the MCP server binary path
  const serverBin =
    config.mode === "lite"
      ? "shell-mcp-lite"
      : "shell-mcp-full";

  const mcpEntry = {
    command: "npx",
    args: ["-y", `@shell-mcp/mcp-${config.mode}@latest`],
    env: {
      SHELL_MCP_MAX_SESSIONS: String(config.maxSessions ?? 10),
      SHELL_MCP_CWD: config.defaultCwd ?? os.homedir(),
      ...(config.mode === "full"
        ? { SHELL_MCP_DAEMON_URL: `http://127.0.0.1:${config.daemon?.port ?? 7777}` }
        : {}),
    },
  };

  // Read existing config or create new
  let clientConfig: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    clientConfig = JSON.parse(raw);
  } catch {
    // File doesn't exist, create new
  }

  // Merge MCP server entry
  const mcpServers =
    (clientConfig.mcpServers as Record<string, unknown>) ?? {};
  mcpServers["shell"] = mcpEntry;
  clientConfig.mcpServers = mcpServers;

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(clientConfig, null, 2), "utf-8");

  console.log(chalk.green("  ✓") + ` MCP config written to ${configPath}`);
}
