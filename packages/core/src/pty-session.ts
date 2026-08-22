import { randomUUID } from "node:crypto";
import { cleanOutput } from "./ansi.js";
import { getDefaultShellArgs, getShellType } from "./platform.js";
import {
  buildSentinelCommand,
  generateSentinel,
  parseSentinelOutput,
} from "./sentinel.js";
import { terminateProcessTree } from "./process-tree.js";
import type { ExecOptions, ExecResult, SessionInfo } from "./types.js";

// Lazy-load node-pty with a helpful error message
let ptyModule: typeof import("node-pty") | undefined;

async function loadPty(): Promise<typeof import("node-pty")> {
  if (ptyModule) return ptyModule;
  try {
    ptyModule = await import("node-pty");
    return ptyModule;
  } catch (e) {
    throw new Error(
      "Failed to load node-pty. This is a native addon that requires compilation tools.\n" +
        "On Windows: npm install --global windows-build-tools\n" +
        "On macOS: xcode-select --install\n" +
        "On Linux: apt-get install build-essential\n" +
        `Original error: ${e}`
    );
  }
}

interface PendingExec {
  sentinel: string;
  command: string;
  buffer: string;
  resolve: (result: ExecResult) => void;
  reject: (err: Error) => void;
  startTime: number;
  idleTimeoutId: ReturnType<typeof setTimeout> | undefined;
  maxTimeoutId: ReturnType<typeof setTimeout> | undefined;
  dataDispose: { dispose(): void };
}

export interface PtySessionOptions {
  name: string;
  shell: string;
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export class PtySession {
  readonly id: string;
  readonly name: string;
  readonly shell: string;
  readonly createdAt: Date;

  private pty!: import("node-pty").IPty;
  private alive = true;
  private terminationRequested = false;
  private lastActivity: Date;
  private cwd: string;
  private pendingExec: PendingExec | null = null;
  private initialized = false;

  constructor(
    private readonly options: PtySessionOptions
  ) {
    this.id = randomUUID();
    this.name = options.name;
    this.shell = options.shell;
    this.cwd = options.cwd;
    this.createdAt = new Date();
    this.lastActivity = new Date();
  }

  /**
   * Initialize the PTY process. Must be called before exec().
   */
  async init(): Promise<void> {
    const pty = await loadPty();
    const args = getDefaultShellArgs(this.shell);

    this.pty = pty.spawn(this.shell, args, {
      name: "xterm-256color",
      cols: this.options.cols ?? 120,
      rows: this.options.rows ?? 40,
      cwd: this.options.cwd,
      env: {
        ...process.env,
        ...this.options.env,
        TERM: "xterm-256color",
      } as Record<string, string>,
    });

    this.pty.onExit(() => {
      this.alive = false;
    });

    this.initialized = true;

    // Wait briefly for shell to start and print its prompt
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }

  get pid(): number {
    return this.pty?.pid ?? -1;
  }

  /**
   * Execute a command in this PTY session.
   * Rejects if another command is already running.
   */
  async exec(
    command: string,
    options?: number | ExecOptions
  ): Promise<ExecResult> {
    if (!this.initialized) {
      throw new Error("Session not initialized. Call init() first.");
    }
    if (!this.alive) {
      throw new Error("Session has exited.");
    }
    if (this.pendingExec) {
      throw new Error(
        "Session is busy executing another command. Wait for it to complete or use a different session."
      );
    }

    const opts: ExecOptions =
      typeof options === "number" ? { timeoutMs: options } : (options ?? {});
    const timeoutMs = opts.timeoutMs ?? 30000;
    const smartTimeout =
      typeof options !== "number" && opts.smartTimeout !== false;
    const idleTimeoutMs = opts.idleTimeoutMs ?? 15000;
    const maxTimeoutMs = opts.maxTimeoutMs ?? 300000;
    const onOutput = opts.onOutput;

    const sentinel = generateSentinel();
    const sentinelCommand = buildSentinelCommand(command, sentinel, this.shell);

    return new Promise<ExecResult>((resolve, reject) => {
      const startTime = Date.now();
      let buffer = "";
      let resolved = false;
      let idleTimeoutId: ReturnType<typeof setTimeout> | undefined;
      let maxTimeoutId: ReturnType<typeof setTimeout> | undefined;

      const finish = (result: ExecResult, terminate = false) => {
        if (resolved) return;
        resolved = true;
        if (terminate) {
          this.kill();
        } else {
          this.completePending();
        }
        this.lastActivity = new Date();
        if (!result.timedOut) this.cwd = result.cwd;
        resolve(result);
      };

      const finishTimeout = (reason: string) => {
        const partialOutput = cleanOutput(buffer);
        finish(
          {
            output:
              partialOutput +
              `\n\n[${reason}]`,
            exitCode: -1,
            cwd: this.cwd,
            durationMs: Date.now() - startTime,
            timedOut: true,
          },
          true
        );
      };

      const resetIdleTimer = () => {
        clearTimeout(idleTimeoutId);
        const ms = smartTimeout ? idleTimeoutMs : timeoutMs;
        idleTimeoutId = setTimeout(() => {
          const reason = smartTimeout
            ? `IDLE TIMEOUT: No output for ${idleTimeoutMs}ms`
            : `TIMEOUT: Command did not complete within ${timeoutMs}ms`;
          finishTimeout(reason);
        }, ms);
        if (this.pendingExec) {
          this.pendingExec.idleTimeoutId = idleTimeoutId;
        }
      };

      if (smartTimeout) {
        maxTimeoutId = setTimeout(() => {
          finishTimeout(
            `MAX TIMEOUT: Command exceeded absolute limit of ${maxTimeoutMs}ms`
          );
        }, maxTimeoutMs);
      }

      const dataDispose = this.pty.onData((data: string) => {
        if (resolved) return;
        buffer += data;
        if (onOutput) onOutput(data);

        if (smartTimeout) resetIdleTimer();

        const result = parseSentinelOutput(
          cleanOutput(buffer),
          sentinel,
          command
        );
        if (result) {
          finish({
            output: result.output,
            exitCode: result.exitCode,
            cwd: result.cwd,
            durationMs: Date.now() - startTime,
          });
        }
      });

      this.pendingExec = {
        sentinel,
        command,
        buffer: "",
        resolve,
        reject,
        startTime,
        idleTimeoutId,
        maxTimeoutId,
        dataDispose,
      };

      resetIdleTimer();

      // Write the sentinel command to the PTY
      const lineEnding = getShellType(this.shell) === "powershell" ? "\r\n" : "\n";
      this.pty.write(sentinelCommand + lineEnding);
    });
  }

  private completePending(): void {
    if (this.pendingExec) {
      clearTimeout(this.pendingExec.idleTimeoutId);
      clearTimeout(this.pendingExec.maxTimeoutId);
      this.pendingExec.dataDispose.dispose();
      this.pendingExec = null;
    }
  }

  getCwd(): string {
    return this.cwd;
  }

  getInfo(): SessionInfo {
    return {
      id: this.id,
      name: this.name,
      shell: this.shell,
      pid: this.pid,
      cwd: this.cwd,
      createdAt: this.createdAt.toISOString(),
      lastActivity: this.lastActivity.toISOString(),
      alive: this.alive,
    };
  }

  isAlive(): boolean {
    return this.alive;
  }

  kill(): void {
    if (this.terminationRequested) return;
    this.terminationRequested = true;
    this.completePending();
    this.alive = false;
    terminateProcessTree(this.pty?.pid ?? -1);
    try {
      this.pty?.kill();
    } catch {
      // already dead
    }
  }

  dispose(): void {
    this.kill();
  }
}
