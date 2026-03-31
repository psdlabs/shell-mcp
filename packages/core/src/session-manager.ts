import { ShellSession } from "./shell-session.js";
import { PtySession } from "./pty-session.js";
import { detectDefaultShell } from "./shell-detect.js";
import { SafetyGuard } from "./safety.js";
import { AuditLogger, type AuditEntry } from "./audit.js";
import type {
  CreateSessionOptions,
  ExecOptions,
  ExecResult,
  SessionInfo,
  SessionManagerOptions,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MAX_SESSIONS = 10;
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

type AnySession = ShellSession | PtySession;

export class SessionManager {
  private sessions = new Map<string, AnySession>();
  private cleanupInterval: ReturnType<typeof setInterval>;
  private defaultShell: string | undefined;
  private readonly defaultCwd: string;
  private readonly sessionTimeoutMs: number;
  private readonly maxSessions: number;
  private readonly usePty: boolean;
  private readonly cols: number;
  private readonly rows: number;

  readonly safety: SafetyGuard;
  readonly audit: AuditLogger;

  constructor(options?: SessionManagerOptions) {
    this.defaultShell = options?.defaultShell;
    this.defaultCwd = options?.defaultCwd ?? process.cwd();
    this.sessionTimeoutMs = options?.sessionTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxSessions = options?.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.usePty = options?.usePty ?? false; // Default: pipes (zero native deps)
    this.cols = options?.cols ?? 120;
    this.rows = options?.rows ?? 40;

    this.safety = new SafetyGuard(options?.safety);
    this.audit = new AuditLogger(options?.audit);

    this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  async createSession(options?: CreateSessionOptions): Promise<SessionInfo> {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(
        `Maximum number of sessions (${this.maxSessions}) reached. Kill an existing session first.`
      );
    }

    const shell =
      options?.shell ?? this.defaultShell ?? (await detectDefaultShell());

    if (!this.defaultShell) {
      this.defaultShell = shell;
    }

    const name = options?.name ?? `session-${this.sessions.size + 1}`;
    const cwd = options?.cwd ?? this.defaultCwd;

    let session: AnySession;

    if (this.usePty) {
      const ptySession = new PtySession({
        name,
        shell,
        cwd,
        env: options?.env,
        cols: this.cols,
        rows: this.rows,
      });
      await ptySession.init();
      session = ptySession;
    } else {
      session = new ShellSession({
        name,
        shell,
        cwd,
        env: options?.env,
      });
    }

    this.sessions.set(session.id, session);
    return session.getInfo();
  }

  /**
   * Execute a command with safety checks and audit logging.
   *
   * Returns `{ allowed: false, reason }` result if the command is blocked.
   * Otherwise executes and logs the result.
   */
  async exec(
    sessionId: string,
    command: string,
    options?: number | ExecOptions
  ): Promise<ExecResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }
    if (!session.isAlive()) {
      this.sessions.delete(sessionId);
      throw new Error(`Session '${sessionId}' has exited.`);
    }

    const info = session.getInfo();

    // Safety check
    const check = this.safety.check(command);
    if (!check.allowed) {
      this.audit.logBlocked(sessionId, info.name, command, check.reason!);
      return {
        output: `BLOCKED: ${check.reason}`,
        exitCode: -1,
        cwd: info.cwd,
        durationMs: 0,
        warning: check.reason,
      };
    }

    // Execute
    const result = await session.exec(command, options);

    // Attach safety warning if present
    if (check.warning) {
      result.warning = check.warning;
    }

    // Audit log
    this.audit.log({
      timestamp: new Date().toISOString(),
      sessionId,
      sessionName: info.name,
      command,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      cwd: result.cwd,
      outputPreview: result.output,
      warning: check.warning,
      timedOut: result.timedOut,
    });

    return result;
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.getInfo());
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId)?.getInfo();
  }

  killSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.dispose();
    this.sessions.delete(sessionId);
    return true;
  }

  getCwd(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }
    return session.getCwd();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (!session.isAlive()) {
        session.dispose();
        this.sessions.delete(id);
        continue;
      }

      const info = session.getInfo();
      const idleMs = now - new Date(info.lastActivity).getTime();
      if (idleMs > this.sessionTimeoutMs) {
        session.dispose();
        this.sessions.delete(id);
      }
    }
  }

  dispose(): void {
    clearInterval(this.cleanupInterval);
    this.audit.dispose();
    for (const [id, session] of this.sessions) {
      session.dispose();
      this.sessions.delete(id);
    }
  }
}
