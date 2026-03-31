import fs from "node:fs";
import path from "node:path";
import os from "node:os";

interface McpClient {
  name: string;
  configPath: string;
  exists: boolean;
}

function getClaudeDesktopConfigPath(): string {
  const platform = os.platform();
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
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
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

function getCursorConfigPath(): string {
  return path.join(os.homedir(), ".cursor", "mcp.json");
}

function getWindsurfConfigPath(): string {
  return path.join(os.homedir(), ".windsurf", "mcp.json");
}

function detectClients(): McpClient[] {
  const clients: McpClient[] = [
    {
      name: "Claude Desktop",
      configPath: getClaudeDesktopConfigPath(),
      exists: false,
    },
    {
      name: "Cursor",
      configPath: getCursorConfigPath(),
      exists: false,
    },
    {
      name: "Windsurf",
      configPath: getWindsurfConfigPath(),
      exists: false,
    },
  ];

  for (const client of clients) {
    // Check if config file exists OR if the parent directory exists
    // (client is installed but no config yet)
    const dir = path.dirname(client.configPath);
    client.exists = fs.existsSync(client.configPath) || fs.existsSync(dir);
  }

  return clients;
}

const SHELL_MCP_ENTRY = {
  command: "npx",
  args: ["-y", "@shell-mcp/mcp-lite"],
};

function readOrCreateConfig(configPath: string): Record<string, unknown> {
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function addToConfig(client: McpClient): {
  success: boolean;
  alreadyExists: boolean;
  error?: string;
} {
  try {
    // Ensure directory exists
    const dir = path.dirname(client.configPath);
    fs.mkdirSync(dir, { recursive: true });

    const config = readOrCreateConfig(client.configPath);

    // Ensure mcpServers key exists
    if (!config.mcpServers || typeof config.mcpServers !== "object") {
      config.mcpServers = {};
    }

    const servers = config.mcpServers as Record<string, unknown>;

    // Check if already configured
    if (servers["shell-mcp"]) {
      return { success: true, alreadyExists: true };
    }

    // Add shell-mcp
    servers["shell-mcp"] = SHELL_MCP_ENTRY;

    // Write back
    fs.writeFileSync(
      client.configPath,
      JSON.stringify(config, null, 2) + "\n",
      "utf-8"
    );

    return { success: true, alreadyExists: false };
  } catch (e) {
    return {
      success: false,
      alreadyExists: false,
      error: (e as Error).message,
    };
  }
}

export function runInit(): void {
  console.log("");
  console.log("  shell-mcp — init");
  console.log("  ─────────────────");
  console.log("");

  const clients = detectClients();
  const detected = clients.filter((c) => c.exists);

  if (detected.length === 0) {
    console.log(
      "  No MCP clients detected (Claude Desktop, Cursor, Windsurf)."
    );
    console.log("");
    console.log("  Manual setup — add this to your MCP client config:");
    console.log("");
    console.log('    "shell-mcp": {');
    console.log('      "command": "npx",');
    console.log('      "args": ["-y", "@shell-mcp/mcp-lite"]');
    console.log("    }");
    console.log("");
    process.exit(0);
  }

  let configured = 0;

  for (const client of detected) {
    const result = addToConfig(client);

    if (result.alreadyExists) {
      console.log(`  ${client.name}`);
      console.log(`    ~ Already configured`);
      console.log(`    ${client.configPath}`);
    } else if (result.success) {
      console.log(`  ${client.name}`);
      console.log(`    + Added shell-mcp`);
      console.log(`    ${client.configPath}`);
      configured++;
    } else {
      console.log(`  ${client.name}`);
      console.log(`    x Failed: ${result.error}`);
      console.log(`    ${client.configPath}`);
    }
    console.log("");
  }

  // Show clients not detected
  const notDetected = clients.filter((c) => !c.exists);
  if (notDetected.length > 0) {
    console.log(
      `  Not detected: ${notDetected.map((c) => c.name).join(", ")}`
    );
    console.log("");
  }

  if (configured > 0) {
    console.log(
      `  Restart ${detected.map((c) => c.name).join(" and ")} to activate.`
    );
  } else {
    console.log("  All detected clients already have shell-mcp configured.");
  }
  console.log("");
}
