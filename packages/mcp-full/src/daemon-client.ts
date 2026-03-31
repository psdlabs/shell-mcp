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
}

export class DaemonClient {
  constructor(private readonly baseUrl: string = "http://127.0.0.1:7777") {}

  async createSession(opts?: {
    name?: string;
    shell?: string;
    cwd?: string;
  }): Promise<SessionInfo> {
    const resp = await fetch(`${this.baseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts ?? {}),
    });
    if (!resp.ok) {
      const err = (await resp.json()) as { error?: string };
      throw new Error(err.error ?? `HTTP ${resp.status}`);
    }
    return resp.json() as Promise<SessionInfo>;
  }

  async exec(
    sessionId: string,
    command: string,
    timeoutMs?: number
  ): Promise<ExecResult> {
    const resp = await fetch(`${this.baseUrl}/sessions/${sessionId}/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, timeout_ms: timeoutMs }),
    });
    if (!resp.ok) {
      const err = (await resp.json()) as { error?: string };
      throw new Error(err.error ?? `HTTP ${resp.status}`);
    }
    return resp.json() as Promise<ExecResult>;
  }

  async listSessions(): Promise<SessionInfo[]> {
    const resp = await fetch(`${this.baseUrl}/sessions`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json() as Promise<SessionInfo[]>;
  }

  async killSession(sessionId: string): Promise<boolean> {
    const resp = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      method: "DELETE",
    });
    return resp.ok;
  }

  async getCwd(sessionId: string): Promise<string> {
    const resp = await fetch(`${this.baseUrl}/sessions/${sessionId}/cwd`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as { cwd: string };
    return data.cwd;
  }

  async health(): Promise<{ status: string }> {
    const resp = await fetch(`${this.baseUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json() as Promise<{ status: string }>;
  }
}
