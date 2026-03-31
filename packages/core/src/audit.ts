import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AuditConfig } from "./types.js";

export interface AuditEntry {
  timestamp: string;
  sessionId: string;
  sessionName: string;
  command: string;
  exitCode: number;
  durationMs: number;
  cwd: string;
  outputPreview: string;
  blocked?: boolean;
  blockReason?: string;
  warning?: string;
  timedOut?: boolean;
}

export class AuditLogger {
  private readonly logDir: string;
  private readonly outputPreviewLength: number;
  private readonly maxFileSize: number;
  private readonly maxFiles: number;
  private readonly enabled: boolean;
  private writeStream: fs.WriteStream | null = null;
  private currentFileSize = 0;

  constructor(config?: AuditConfig) {
    this.enabled = config?.enabled ?? true;
    this.logDir =
      config?.logDir ?? path.join(os.homedir(), ".shell-mcp", "logs");
    this.outputPreviewLength = config?.outputPreviewLength ?? 500;
    this.maxFileSize = config?.maxFileSize ?? 10 * 1024 * 1024; // 10MB
    this.maxFiles = config?.maxFiles ?? 5;

    if (this.enabled) {
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
      } catch {
        // Can't create dir — logging will silently fail
      }
    }
  }

  private getLogFilePath(): string {
    return path.join(this.logDir, "audit.jsonl");
  }

  private getStream(): fs.WriteStream | null {
    if (!this.enabled) return null;

    if (!this.writeStream) {
      const logPath = this.getLogFilePath();
      try {
        try {
          const stat = fs.statSync(logPath);
          this.currentFileSize = stat.size;
          if (this.currentFileSize >= this.maxFileSize) {
            this.rotate();
          }
        } catch {
          this.currentFileSize = 0;
        }
        this.writeStream = fs.createWriteStream(logPath, { flags: "a" });
      } catch {
        return null;
      }
    }

    return this.writeStream;
  }

  private rotate(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }

    const basePath = this.getLogFilePath();

    // Shift: audit.4 -> delete, audit.3 -> audit.4, ..., audit -> audit.1
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const from = i === 1 ? basePath : `${basePath}.${i}`;
      const to = `${basePath}.${i + 1 > this.maxFiles ? "" : i + 1}`;
      try {
        if (i === this.maxFiles - 1) {
          fs.unlinkSync(`${basePath}.${i}`);
        } else {
          fs.renameSync(`${basePath}.${i}`, `${basePath}.${i + 1}`);
        }
      } catch {
        // File doesn't exist — skip
      }
    }

    try {
      fs.renameSync(basePath, `${basePath}.1`);
    } catch {
      // ignore
    }

    this.currentFileSize = 0;
  }

  log(entry: AuditEntry): void {
    const stream = this.getStream();
    if (!stream) return;

    // Truncate output preview
    const truncated = { ...entry };
    if (truncated.outputPreview.length > this.outputPreviewLength) {
      truncated.outputPreview =
        truncated.outputPreview.substring(0, this.outputPreviewLength) + "...";
    }

    const line = JSON.stringify(truncated) + "\n";
    stream.write(line);
    this.currentFileSize += Buffer.byteLength(line);

    if (this.currentFileSize >= this.maxFileSize) {
      this.rotate();
    }
  }

  logBlocked(
    sessionId: string,
    sessionName: string,
    command: string,
    reason: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      sessionId,
      sessionName,
      command,
      exitCode: -1,
      durationMs: 0,
      cwd: "",
      outputPreview: "",
      blocked: true,
      blockReason: reason,
    });
  }

  /** Read recent audit entries (most recent first). */
  readRecent(count = 50): AuditEntry[] {
    if (!this.enabled) return [];

    const logPath = this.getLogFilePath();
    try {
      const content = fs.readFileSync(logPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      return lines
        .slice(-count)
        .reverse()
        .map((line) => JSON.parse(line) as AuditEntry);
    } catch {
      return [];
    }
  }

  dispose(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}
