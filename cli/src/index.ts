#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { startCommand } from "./commands/start.js";
import { statusCommand } from "./commands/status.js";
import { logsCommand } from "./commands/logs.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { uninstallCommand } from "./commands/uninstall.js";

const program = new Command()
  .name("shell-mcp")
  .description("Persistent shell access for MCP clients")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(startCommand);
program.addCommand(statusCommand);
program.addCommand(logsCommand);
program.addCommand(upgradeCommand);
program.addCommand(uninstallCommand);

program.parse();
