import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getDefaultShellArgs, getShellType } from "./platform.js";
import type { ExecOptions, ExecResult, SessionInfo } from "./types.js";

/**
 * Persistent shell session using stdin/stdout pipes instead of PTY.
 *
 * Why pipes over PTY:
 * - Zero native dependencies (no node-pty, no node-gyp, no build tools)
 * - No ANSI escape codes to strip
 * - No input echo to filter out
 * - No prompt artifacts
 * - No ConPTY issues on Windows
 * - Sentinel pattern becomes trivial — just look for a clean line
 * - Works identically on macOS, Linux, Windows
 *
 * What you lose:
 * - Programs that require a TTY (vim, less, htop) won't work
 *   But those don't make sense in an MCP context anyway — the LLM
 *   can't interact with a full-screen TUI.
 */
export class ShellSession {
  readonly id: string;
  readonly name: string;
  readonly shell: string;
  readonly createdAt: Date;

  private process: ChildProcess;
  private alive = true;
  private lastActivity: Date;
  private cwd: string;
  private busy = false;

  // Accumulate stdout/stderr between commands
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private onStdout: ((data: string) => void) | null = null;

  constructor(options: {
    name: string;
    shell: string;
    cwd: string;
    env?: Record<string, string>;
  }) {
    this.id = randomUUID();
    this.name = options.name;
    this.shell = options.shell;
    this.cwd = options.cwd;
    this.createdAt = new Date();
    this.lastActivity = new Date();

    const args = getDefaultShellArgs(this.shell);

    this.process = spawn(this.shell, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
        // Disable prompts and colors for clean pipe output
        TERM: "dumb",
        NO_COLOR: "1",
        PS1: "",
        PS2: "",
        PROMPT_COMMAND: "",
      } as Record<string, string>,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });

    this.process.stdout!.setEncoding("utf-8");
    this.process.stderr!.setEncoding("utf-8");

    this.process.stdout!.on("data", (data: string) => {
      this.stdoutBuffer += data;
      if (this.onStdout) this.onStdout(data);
    });

    this.process.stderr!.on("data", (data: string) => {
      this.stderrBuffer += data;
    });

    this.process.on("exit", () => {
      this.alive = false;
    });

    this.process.on("error", () => {
      this.alive = false;
    });
  }

  get pid(): number {
    return this.process.pid ?? -1;
  }

  /**
   * Execute a command with smart timeout and streaming support.
   *
   * Smart timeout (default on): instead of a fixed wall-clock timeout,
   * the command times out only after `idleTimeoutMs` of silence.
   * This means `npm install` keeps running while producing output,
   * but a hung command that produces nothing times out quickly.
   *
   * Accepts either a number (legacy: fixed timeoutMs) or ExecOptions.
   */
  async exec(
    command: string,
    options?: number | ExecOptions
  ): Promise<ExecResult> {
    if (!this.alive) {
      throw new Error("Session has exited.");
    }
    if (this.busy) {
      throw new Error(
        "Session is busy. Wait for the current command to complete or use a different session."
      );
    }

    // Normalize options: number → legacy fixed timeout, object → full options
    const opts: ExecOptions =
      typeof options === "number" ? { timeoutMs: options } : (options ?? {});

    const timeoutMs = opts.timeoutMs ?? 30000;
    const smartTimeout = opts.smartTimeout !== false; // default: true
    const idleTimeoutMs = opts.idleTimeoutMs ?? 15000;
    const maxTimeoutMs = opts.maxTimeoutMs ?? 300000; // 5 min absolute cap
    const onOutput = opts.onOutput;

    this.busy = true;
    const startTime = Date.now();
    const sentinel = `__SMCP_${randomUUID().replace(/-/g, "")}__`;

    // Clear buffers
    this.stdoutBuffer = "";
    this.stderrBuffer = "";

    const shellType = getShellType(this.shell);

    // Build compound command with sentinel
    let fullCommand: string;
    if (shellType === "powershell") {
      fullCommand = [
        command,
        `$__ec = if ($?) { if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 } } else { if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 1 } }`,
        `Write-Host "${sentinel}EC:$($__ec):CWD:$(Get-Location):END"`,
      ].join("; ");
    } else if (shellType === "cmd") {
      fullCommand = `${command} & echo ${sentinel}EC:%ERRORLEVEL%:CWD:%CD%:END`;
    } else {
      fullCommand = `${command}\n__ec=$?; echo "${sentinel}EC:\${__ec}:CWD:$(pwd):END"`;
    }

    return new Promise<ExecResult>((resolve) => {
      let resolved = false;
      let idleTimer: ReturnType<typeof setTimeout>;
      let maxTimer: ReturnType<typeof setTimeout>;

      const finish = (
        output: string,
        exitCode: number,
        cwd: string,
        timedOut = false
      ) => {
        if (resolved) return;
        resolved = true;
        this.busy = false;
        this.onStdout = null;
        clearTimeout(idleTimer);
        clearTimeout(maxTimer);
        this.lastActivity = new Date();
        this.cwd = cwd;
        resolve({
          output: output.trim(),
          exitCode,
          cwd,
          durationMs: Date.now() - startTime,
          timedOut,
        });
      };

      const finishTimeout = (reason: string) => {
        let output = this.stdoutBuffer.trim();
        const stderr = this.stderrBuffer.trim();
        if (stderr) {
          output = output
            ? `${output}\n\n[stderr]\n${stderr}`
            : `[stderr]\n${stderr}`;
        }
        finish(output + `\n\n[${reason}]`, -1, this.cwd, true);
      };

      const resetIdleTimer = () => {
        clearTimeout(idleTimer);
        const ms = smartTimeout ? idleTimeoutMs : timeoutMs;
        idleTimer = setTimeout(() => {
          const reason = smartTimeout
            ? `IDLE TIMEOUT: No output for ${idleTimeoutMs}ms`
            : `TIMEOUT: Command did not complete within ${timeoutMs}ms`;
          finishTimeout(reason);
        }, ms);
      };

      // Absolute max timer (only meaningful in smart timeout mode)
      if (smartTimeout) {
        maxTimer = setTimeout(() => {
          finishTimeout(
            `MAX TIMEOUT: Command exceeded absolute limit of ${maxTimeoutMs}ms`
          );
        }, maxTimeoutMs);
      }

      // Watch stdout for sentinel + stream chunks
      this.onStdout = (chunk: string) => {
        // Stream chunk to caller
        if (onOutput) onOutput(chunk);

        // Reset idle timer on any output activity
        resetIdleTimer();

        // Check for sentinel completion
        const result = this.parseSentinel(this.stdoutBuffer, sentinel);
        if (result) {
          let output = result.output;
          const stderr = this.stderrBuffer.trim();
          if (stderr) {
            output = output
              ? `${output}\n\n[stderr]\n${stderr}`
              : `[stderr]\n${stderr}`;
          }
          finish(output, result.exitCode, result.cwd);
        }
      };

      // Start idle timer
      resetIdleTimer();

      // Write the command
      const lineEnding = shellType === "powershell" ? "\r\n" : "\n";
      this.process.stdin!.write(fullCommand + lineEnding);
    });
  }

  /**
   * Parse sentinel from clean pipe output.
   * No echo stripping, no ANSI stripping — just find the line.
   */
  private parseSentinel(
    buffer: string,
    sentinel: string
  ): { output: string; exitCode: number; cwd: string } | null {
    const pattern = new RegExp(
      `${sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}EC:(\\d+):CWD:(.+?):END`
    );
    const match = buffer.match(pattern);
    if (!match) return null;

    const exitCode = parseInt(match[1], 10);
    const cwd = match[2].trim();
    const sentinelIndex = buffer.indexOf(match[0]);
    const output = buffer.substring(0, sentinelIndex).trim();

    return { output, exitCode, cwd };
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
    if (this.alive) {
      try {
        this.process.kill();
      } catch {
        // already dead
      }
      this.alive = false;
    }
  }

  dispose(): void {
    this.kill();
  }
}
