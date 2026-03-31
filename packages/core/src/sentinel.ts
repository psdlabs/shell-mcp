import { randomUUID } from "node:crypto";
import { getShellType } from "./platform.js";

/**
 * Generate a unique sentinel ID for command completion detection.
 */
export function generateSentinel(): string {
  return `__SHELLMCP_${randomUUID().replace(/-/g, "")}__`;
}

/**
 * Escape a string for use in a regular expression.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the sentinel command to write to the PTY after the user's command.
 * The sentinel command captures the exit code and current working directory.
 */
export function buildSentinelCommand(
  command: string,
  sentinel: string,
  shell: string
): string {
  const type = getShellType(shell);

  switch (type) {
    case "bash":
    case "zsh":
    case "unknown":
      // POSIX shell sentinel:
      // Run command, capture $?, emit sentinel with exit code and cwd
      return [
        command,
        `__smcp_ec=$?; echo "${sentinel}EC_${`\${__smcp_ec}`}_EC_${sentinel}CWD_$(pwd)_CWD_${sentinel}END"`,
      ].join("\n");

    case "powershell":
      // PowerShell sentinel:
      // $? is boolean, $LASTEXITCODE is nullable int for native commands
      return [
        command,
        `$__smcp_ec = if ($?) { if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 } } else { if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 1 } }; Write-Host "${sentinel}EC_$($__smcp_ec)_EC_${sentinel}CWD_$(Get-Location)_CWD_${sentinel}END"`,
      ].join("\r\n");

    case "cmd":
      // cmd.exe sentinel:
      return `${command} & echo ${sentinel}EC_%ERRORLEVEL%_EC_${sentinel}CWD_%CD%_CWD_${sentinel}END`;
  }
}

export interface SentinelParseResult {
  output: string;
  exitCode: number;
  cwd: string;
}

/**
 * Parse accumulated PTY output buffer for the sentinel.
 * Returns null if sentinel not yet found (keep buffering).
 */
export function parseSentinelOutput(
  buffer: string,
  sentinel: string,
  originalCommand: string
): SentinelParseResult | null {
  const escapedSentinel = escapeRegex(sentinel);

  // Match: <sentinel>EC_<number>_EC_<sentinel>CWD_<path>_CWD_<sentinel>END
  const pattern = new RegExp(
    `${escapedSentinel}EC_(\\d+)_EC_${escapedSentinel}CWD_(.+?)_CWD_${escapedSentinel}END`
  );

  const match = buffer.match(pattern);
  if (!match) return null;

  const exitCode = parseInt(match[1], 10);
  const cwd = match[2].trim();

  // Find where the sentinel output starts in the buffer
  const sentinelIndex = buffer.indexOf(match[0]);

  // Get everything before the sentinel line
  let output = buffer.substring(0, sentinelIndex);

  // Split into lines for cleanup
  const lines = output.split("\n");

  // Remove lines that contain the sentinel marker (the echoed command)
  const cleanedLines = lines.filter(
    (line) => !line.includes(sentinel) && !line.includes("__smcp_ec=") && !line.includes("$__smcp_ec")
  );

  // Remove the first line if it's the echoed original command
  // PTY echoes back what was typed
  if (cleanedLines.length > 0) {
    const firstLine = cleanedLines[0].trim();
    const cmdPrefix = originalCommand.trim().substring(0, 60);
    if (firstLine.includes(cmdPrefix) || firstLine === originalCommand.trim()) {
      cleanedLines.shift();
    }
  }

  output = cleanedLines.join("\n").trim();

  return { output, exitCode, cwd };
}
