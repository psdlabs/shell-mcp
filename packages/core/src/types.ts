export interface SessionInfo {
  id: string;
  name: string;
  shell: string;
  pid: number;
  cwd: string;
  createdAt: string;
  lastActivity: string;
  alive: boolean;
}

export interface ExecResult {
  output: string;
  exitCode: number;
  cwd: string;
  durationMs: number;
  timedOut?: boolean;
  warning?: string;
}

export interface ExecOptions {
  timeoutMs?: number;
  /** Called with each stdout chunk as it arrives. */
  onOutput?: (chunk: string) => void;
  /**
   * Smart timeout: auto-extend while output is still flowing.
   * Instead of a fixed wall-clock timeout, the command times out only
   * after `idleTimeoutMs` of silence. Default: true.
   */
  smartTimeout?: boolean;
  /** Max silence before timeout when smartTimeout is enabled. Default: 15000ms. */
  idleTimeoutMs?: number;
  /** Absolute max timeout regardless of activity. Default: 300000ms (5 min). */
  maxTimeoutMs?: number;
}

export interface SafetyConfig {
  /** Regex patterns for commands that are always blocked. Merged with built-in defaults. */
  blocklist?: string[];
  /** If set, ONLY commands matching these patterns are allowed. Blocklist still applies on top. */
  allowlist?: string[];
  /** Regex patterns that trigger a warning but still execute. Merged with built-in defaults. */
  warnPatterns?: string[];
  /** Block all commands by default (requires allowlist to permit anything). Default: false. */
  defaultDeny?: boolean;
}

export interface AuditConfig {
  /** Enable audit logging. Default: true. */
  enabled?: boolean;
  /** Directory for audit logs. Default: ~/.shell-mcp/logs/ */
  logDir?: string;
  /** Max chars of output to store per entry. Default: 500. */
  outputPreviewLength?: number;
  /** Max log file size before rotation. Default: 10MB. */
  maxFileSize?: number;
  /** Number of rotated log files to keep. Default: 5. */
  maxFiles?: number;
}

export interface SessionManagerOptions {
  defaultShell?: string;
  defaultCwd?: string;
  sessionTimeoutMs?: number;
  maxSessions?: number;
  /** Use node-pty (native addon) instead of pipes. Default: false (pipes). */
  usePty?: boolean;
  cols?: number;
  rows?: number;
  /** Safety guardrail configuration. */
  safety?: SafetyConfig;
  /** Audit logging configuration. */
  audit?: AuditConfig;
}

export interface CreateSessionOptions {
  name?: string;
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
}

export type Platform = "darwin" | "linux" | "win32";
