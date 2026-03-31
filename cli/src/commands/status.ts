import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, getConfigPath } from "../config.js";

export const statusCommand = new Command("status")
  .description("Show shell-mcp status and active sessions")
  .action(async () => {
    const config = await loadConfig();

    if (!config) {
      console.log(chalk.yellow("  No config found. Run `shell-mcp init` first."));
      return;
    }

    console.log(chalk.bold("\n  shell-mcp status\n"));
    console.log(`  Mode:    ${chalk.cyan(config.mode)}`);
    console.log(`  Config:  ${chalk.dim(getConfigPath())}`);

    if (config.mode === "full") {
      const port = config.daemon?.port ?? 7777;
      console.log(`  Port:    ${port}`);

      try {
        const resp = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (resp.ok) {
          const health = (await resp.json()) as Record<string, unknown>;
          console.log(`  Daemon:  ${chalk.green("running")}`);
          if (health.uptime) {
            console.log(`  Uptime:  ${formatUptime(health.uptime as number)}`);
          }
          if (typeof health.sessions === "number") {
            console.log(`  Sessions: ${health.sessions}`);
          }
        } else {
          console.log(`  Daemon:  ${chalk.red("unhealthy")}`);
        }
      } catch {
        console.log(`  Daemon:  ${chalk.red("not running")}`);
      }
    } else {
      console.log(
        `  Daemon:  ${chalk.dim("N/A (Lite mode — server runs in MCP client process)")}`
      );
    }

    console.log();
  });

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
