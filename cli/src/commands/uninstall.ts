import { Command } from "commander";
import chalk from "chalk";
import fs from "node:fs/promises";
import { confirm } from "@inquirer/prompts";
import { getConfigDir, loadConfig } from "../config.js";
import { uninstallService } from "../service-installer.js";

export const uninstallCommand = new Command("uninstall")
  .description("Remove shell-mcp config and services")
  .action(async () => {
    const proceed = await confirm({
      message: "Remove shell-mcp config and daemon service?",
      default: false,
    });

    if (!proceed) {
      console.log(chalk.dim("  Cancelled."));
      return;
    }

    const config = await loadConfig();

    // Remove system service if in full mode
    if (config?.mode === "full") {
      try {
        await uninstallService();
        console.log(chalk.green("  ✓ Daemon service removed."));
      } catch (e) {
        console.log(
          chalk.yellow(`  ⚠ Could not remove service: ${(e as Error).message}`)
        );
      }
    }

    // Remove config directory
    try {
      await fs.rm(getConfigDir(), { recursive: true, force: true });
      console.log(chalk.green("  ✓ Config directory removed."));
    } catch {
      // ignore
    }

    console.log(
      chalk.dim(
        "\n  Note: MCP client configs (claude_desktop_config.json, etc.) were not modified.\n" +
          "  Remove the 'shell' entry manually if desired.\n"
      )
    );
  });
