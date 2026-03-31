export { SessionManager } from "./session-manager.js";
export { ShellSession } from "./shell-session.js";
export { PtySession } from "./pty-session.js";
export { SafetyGuard } from "./safety.js";
export type { SafetyCheckResult } from "./safety.js";
export { AuditLogger } from "./audit.js";
export type { AuditEntry } from "./audit.js";
export { detectDefaultShell } from "./shell-detect.js";
export { getPlatform, isWindows, isMac, getShellType } from "./platform.js";
export { cleanOutput } from "./ansi.js";
export {
  generateSentinel,
  buildSentinelCommand,
  parseSentinelOutput,
} from "./sentinel.js";
export type {
  SessionInfo,
  ExecResult,
  ExecOptions,
  SessionManagerOptions,
  CreateSessionOptions,
  SafetyConfig,
  AuditConfig,
  Platform,
} from "./types.js";
