import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, saveConfig } from "../config.js";

export const upgradeCommand = new Command("upgrade")
  .description("Switch from Lite to Full mode")
  .action(async () => {
    const config = await loadConfig();

    if (!config) {
      console.error(
        chalk.red("  ✗ No config found. Run `shell-mcp init` first.")
      );
      process.exit(1);
    }

    if (config.mode === "full") {
      console.log(chalk.green("  Already in Full mode."));
      return;
    }

    config.mode = "full";
    if (!config.daemon) {
      config.daemon = { port: 7777, autoStart: true };
    }

    await saveConfig(config);
    console.log(chalk.green("  ✓ Upgraded to Full mode."));
    console.log(
      chalk.dim(
        "  Start the daemon with: shell-mcp start\n" +
          "  Then update your MCP client config and restart it."
      )
    );
  });
