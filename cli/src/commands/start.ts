import { Command } from "commander";
import chalk from "chalk";
import { spawn } from "node:child_process";
import { loadConfig } from "../config.js";

export const startCommand = new Command("start")
  .description("Start the shell-mcp daemon (Full mode)")
  .action(async () => {
    const config = await loadConfig();

    if (!config) {
      console.error(
        chalk.red("  ✗ No config found. Run `shell-mcp init` first.")
      );
      process.exit(1);
    }

    if (config.mode !== "full") {
      console.log(
        chalk.yellow(
          "  Lite mode does not use a separate daemon.\n" +
            "  The MCP server runs in-process when your client starts.\n" +
            "  Run `shell-mcp upgrade` to switch to Full mode."
        )
      );
      return;
    }

    // Check if daemon is already running
    try {
      const resp = await fetch(
        `http://127.0.0.1:${config.daemon?.port ?? 7777}/health`,
        { signal: AbortSignal.timeout(2000) }
      );
      if (resp.ok) {
        console.log(chalk.green("  ✓ Daemon is already running."));
        return;
      }
    } catch {
      // Not running, start it
    }

    console.log(chalk.dim("  Starting daemon..."));

    // Resolve daemon entry point
    let daemonBin: string;
    try {
      // Try to resolve from installed packages
      daemonBin = "shell-daemon";
    } catch {
      console.error(
        chalk.red(
          "  ✗ Cannot find @shell-mcp/daemon. Install it with:\n" +
            "    pnpm add @shell-mcp/daemon"
        )
      );
      process.exit(1);
    }

    const child = spawn("npx", ["-y", "@shell-mcp/daemon@latest"], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        SHELL_MCP_PORT: String(config.daemon?.port ?? 7777),
      },
      shell: true,
    });

    child.unref();

    // Wait briefly and check health
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const resp = await fetch(
        `http://127.0.0.1:${config.daemon?.port ?? 7777}/health`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (resp.ok) {
        console.log(
          chalk.green(
            `  ✓ Daemon started on port ${config.daemon?.port ?? 7777}`
          )
        );
      } else {
        console.log(
          chalk.yellow("  ⚠ Daemon started but health check returned non-OK.")
        );
      }
    } catch {
      console.log(
        chalk.yellow(
          "  ⚠ Daemon process spawned but health check failed.\n" +
            "    Check logs with: shell-mcp logs"
        )
      );
    }
  });
