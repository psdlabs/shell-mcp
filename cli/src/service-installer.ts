import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getLogDir } from "./config.js";

const execFileAsync = promisify(execFile);

const LABEL = "com.shell-mcp.daemon";

export async function installService(
  nodePath: string,
  daemonEntry: string,
  port: number
): Promise<void> {
  const platform = os.platform();

  if (platform === "darwin") {
    await installLaunchd(nodePath, daemonEntry, port);
  } else if (platform === "linux") {
    await installSystemd(nodePath, daemonEntry, port);
  } else if (platform === "win32") {
    await installTaskScheduler(nodePath, daemonEntry, port);
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

export async function uninstallService(): Promise<void> {
  const platform = os.platform();

  if (platform === "darwin") {
    await uninstallLaunchd();
  } else if (platform === "linux") {
    await uninstallSystemd();
  } else if (platform === "win32") {
    await uninstallTaskScheduler();
  }
}

// --- macOS: launchd ---

async function installLaunchd(
  nodePath: string,
  daemonEntry: string,
  port: number
): Promise<void> {
  const logDir = getLogDir();
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${daemonEntry}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SHELL_MCP_PORT</key><string>${port}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${logDir}/daemon.stdout.log</string>
  <key>StandardErrorPath</key><string>${logDir}/daemon.stderr.log</string>
</dict>
</plist>`;

  const plistPath = path.join(
    os.homedir(),
    "Library",
    "LaunchAgents",
    `${LABEL}.plist`
  );
  await fs.mkdir(path.dirname(plistPath), { recursive: true });
  await fs.writeFile(plistPath, plistContent, "utf-8");
  await execFileAsync("launchctl", ["load", plistPath]);
}

async function uninstallLaunchd(): Promise<void> {
  const plistPath = path.join(
    os.homedir(),
    "Library",
    "LaunchAgents",
    `${LABEL}.plist`
  );
  try {
    await execFileAsync("launchctl", ["unload", plistPath]);
  } catch {
    // ignore
  }
  try {
    await fs.unlink(plistPath);
  } catch {
    // ignore
  }
}

// --- Linux: systemd ---

async function installSystemd(
  nodePath: string,
  daemonEntry: string,
  port: number
): Promise<void> {
  const serviceContent = `[Unit]
Description=shell-mcp daemon
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${daemonEntry}
Environment=SHELL_MCP_PORT=${port}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;

  const servicePath = path.join(
    os.homedir(),
    ".config",
    "systemd",
    "user",
    "shell-mcp-daemon.service"
  );
  await fs.mkdir(path.dirname(servicePath), { recursive: true });
  await fs.writeFile(servicePath, serviceContent, "utf-8");
  await execFileAsync("systemctl", ["--user", "daemon-reload"]);
  await execFileAsync("systemctl", ["--user", "enable", "--now", "shell-mcp-daemon"]);
}

async function uninstallSystemd(): Promise<void> {
  try {
    await execFileAsync("systemctl", [
      "--user",
      "disable",
      "--now",
      "shell-mcp-daemon",
    ]);
  } catch {
    // ignore
  }
  const servicePath = path.join(
    os.homedir(),
    ".config",
    "systemd",
    "user",
    "shell-mcp-daemon.service"
  );
  try {
    await fs.unlink(servicePath);
  } catch {
    // ignore
  }
}

// --- Windows: Task Scheduler ---

async function installTaskScheduler(
  nodePath: string,
  daemonEntry: string,
  port: number
): Promise<void> {
  const taskXml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>shell-mcp daemon for persistent PTY sessions</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions>
    <Exec>
      <Command>${nodePath}</Command>
      <Arguments>${daemonEntry}</Arguments>
    </Exec>
  </Actions>
</Task>`;

  const xmlPath = path.join(os.tmpdir(), "shell-mcp-task.xml");
  await fs.writeFile(xmlPath, taskXml, "utf-16le");
  await execFileAsync("schtasks", [
    "/Create",
    "/XML",
    xmlPath,
    "/TN",
    "ShellMCPDaemon",
    "/F",
  ]);
  await fs.unlink(xmlPath);
}

async function uninstallTaskScheduler(): Promise<void> {
  try {
    await execFileAsync("schtasks", ["/Delete", "/TN", "ShellMCPDaemon", "/F"]);
  } catch {
    // ignore
  }
}
