import stripAnsi from "strip-ansi";

/**
 * Clean raw PTY output: strip ANSI escapes, normalize line endings,
 * remove ConPTY artifacts and extra whitespace.
 */
export function cleanOutput(raw: string): string {
  // Strip ANSI escape sequences
  let cleaned = stripAnsi(raw);

  // Normalize Windows line endings
  cleaned = cleaned.replace(/\r\n/g, "\n");
  cleaned = cleaned.replace(/\r/g, "");

  // Remove ConPTY artifacts: NUL characters, BEL, etc.
  cleaned = cleaned.replace(/[\x00\x07]/g, "");

  // Collapse more than 2 consecutive blank lines into 1
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned;
}
