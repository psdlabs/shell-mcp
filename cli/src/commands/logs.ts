import { Command } from "commander";
import chalk from "chalk";
import fs from "node:fs/promises";
import path from "node:path";
import { getLogDir } from "../config.js";

export const logsCommand = new Command("logs")
  .description("Tail daemon log files")
  .option("-n, --lines <number>", "Number of lines to show", "50")
  .action(async (opts) => {
    const logDir = getLogDir();
    const lines = parseInt(opts.lines) || 50;

    const logFiles = ["daemon.stdout.log", "daemon.stderr.log"];

    for (const file of logFiles) {
      const logPath = path.join(logDir, file);
      try {
        const content = await fs.readFile(logPath, "utf-8");
        const allLines = content.split("\n");
        const tail = allLines.slice(-lines).join("\n");

        console.log(
          chalk.bold(`\n  === ${file} (last ${lines} lines) ===\n`)
        );
        console.log(tail || chalk.dim("  (empty)"));
      } catch {
        console.log(chalk.dim(`\n  ${file}: not found`));
      }
    }

    console.log();
  });
