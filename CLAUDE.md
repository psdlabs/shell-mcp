# shell-mcp

MCP server giving any MCP client persistent shell access via named sessions.

**GitHub**: https://github.com/psdlabs/shell-mcp
**npm**: https://www.npmjs.com/package/@shell-mcp/mcp-lite
**License**: MIT

## Install (for users)

```json
{
  "mcpServers": {
    "shell-mcp": {
      "command": "npx",
      "args": ["-y", "@shell-mcp/mcp-lite"]
    }
  }
}
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Clients                            │
│  Claude Desktop  ·  Cursor  ·  Windsurf  ·  Zed  ·  Cline  │
└────────────┬──────────────────────────┬─────────────────────┘
             │ stdio                    │ stdio
             ▼                          ▼
┌────────────────────┐     ┌────────────────────────┐
│   mcp-lite (Lite)  │     │  mcp-full (Full mode)  │
│                    │     │                        │
│  MCP Server        │     │  MCP Server            │
│  + SafetyGuard     │     │  + DaemonClient ──HTTP──┼──┐
│  + AuditLogger     │     │  (stateless proxy)     │  │
│  + SessionManager  │     └────────────────────────┘  │
│  + Shell Sessions  │                                  │
│    (in-process)    │                                  │
└────────────────────┘                                  │
                                                        ▼
                                              ┌──────────────────┐
                                              │  daemon (7777)   │
                                              │                  │
                                              │  Express REST    │
                                              │  + SessionManager│
                                              │  + Shell Sessions│
                                              │  (long-lived)    │
                                              └──────────────────┘
```

## Two Modes

**Lite** (v0.1.0 — current release) — MCP server + sessions in one process. Sessions reset on client restart. Zero setup.

**Full** (planned) — Daemon owns sessions over HTTP. MCP adapter is a stateless proxy. Sessions survive restarts.

## Safety Guardrails

```
LLM calls run_command("rm -rf /")
        │
        ▼
  SafetyGuard.check()
        │
   ┌────┴──────────┐
   BLOCKED          ALLOWED (or WARNING)
   │                │
   ▼                ▼
  return error     execute command
  + audit log      + audit log
  (never runs)     (result logged)
```

**Blocked** (never execute): `rm -rf /`, `DROP DATABASE`, `curl | bash`, `format C:`, fork bombs, `dd of=/dev/`

**Warned** (execute with flag): `sudo`, `rm -rf`, `git push --force`, `kill -9`, `shutdown`

**Customizable** via env vars:
- `SHELL_MCP_BLOCKLIST` — extra blocked patterns (comma-separated regex)
- `SHELL_MCP_ALLOWLIST` — only allow matching commands
- `SHELL_MCP_DEFAULT_DENY` — block everything not in allowlist

## Smart Timeout

```
Traditional:    |─── 30s fixed ───────────────────| KILL
                     (npm install dies mid-download)

Smart timeout:  |─ idle 15s ─| reset |─ idle 15s ─| reset |─ idle 15s ─| TIMEOUT
                     ▲ output    ▲ output    ▲ output
                     chunk       chunk       chunk

Absolute cap:   |──────────── 5 min max ──────────────────────────────| KILL
```

Commands auto-extend while producing output. Only times out after 15s of silence or 5 min absolute cap.

## Audit Logging

Every command logged to `~/.shell-mcp/logs/audit.jsonl`:

```
{ timestamp, sessionId, sessionName, command, exitCode, durationMs, cwd, outputPreview, blocked?, warning? }
```

Auto-rotates at 10MB, keeps 5 rotated files. Disable with `SHELL_MCP_AUDIT=false`.

## Session Backend: Pipes vs PTY

```
┌──────────────┐       stdin (pipe)       ┌────────────┐
│              │ ──────────────────────▶   │            │
│ ShellSession │                           │ bash -l    │
│  (default)   │   ◀──────────────────── │ /zsh/pwsh  │
│              │       stdout (pipe)       │            │
└──────────────┘                           └────────────┘

         vs.

┌──────────────┐       PTY (node-pty)     ┌────────────┐
│              │ ◀════════════════════▶   │            │
│  PtySession  │   bidirectional tty      │ bash -l    │
│  (opt-in)    │   echo + ANSI + prompts  │ /zsh/pwsh  │
└──────────────┘                           └────────────┘
```

**Pipes (default)** — Zero native deps. Clean stdout, no ANSI stripping, no echo removal. Sentinel parsing is trivial.

**PTY (opt-in, `usePty: true`)** — Requires `node-pty` (native C++ addon). Needed only if a tool checks `isatty()`. Adds ANSI stripping, echo filtering, ConPTY handling.

## Sentinel Pattern (Command Completion Detection)

```
                        Pipe Mode (clean)
                        ─────────────────
User cmd:   "ls -la"
We write:   ls -la
            __ec=$?; echo "__SMCP_<uuid>__EC:${__ec}:CWD:$(pwd):END"

Stdout:     total 48                          ◄─ command output
            drwxr-xr-x  5 user ...
            -rw-r--r--  1 user ...
            __SMCP_abc123__EC:0:CWD:/home:END ◄─ sentinel (parse this)

Parse:      output = everything before sentinel line
            exitCode = 0
            cwd = /home
```

No echo stripping needed. No ANSI filtering. One regex match.

## Command Flow (run_command with auto-session)

```
LLM calls run_command({ command: "npm test" })
        │
        ▼
  session_id provided?
        │
   ┌────┴────┐
   No        Yes
   │          │
   ▼          ▼
 auto-create   use existing
 "default"     session
 session        │
   │            │
   └─────┬──────┘
         ▼
  SafetyGuard.check("npm test")
         │
    ┌────┴────┐
    BLOCKED   OK
    │         │
    ▼         ▼
  return    SessionManager.exec(sid, "npm test")
  error              │
                     ▼
               ShellSession.exec()
                ├─ generate sentinel UUID
                ├─ write command + sentinel echo to stdin
                ├─ buffer stdout (smart timeout resets on each chunk)
                ├─ stream chunks via onOutput callback
                ├─ parse exit code + cwd from sentinel
                └─ return { output, exitCode, cwd, durationMs, timedOut? }
                     │
                     ▼
               AuditLogger.log(entry)
                     │
                     ▼
               MCP response back to LLM
```

## MCP Tools (14 total)

```
┌─────────────────────────────────────────────────────────────┐
│ Shell (core value)         │ Filesystem                     │
│  · run_command ★           │  · read_file                   │
│  · new_session             │  · write_file ★★               │
│  · list_sessions           │  · list_dir                    │
│  · kill_session            │                                │
├────────────────────────────┼────────────────────────────────│
│ Git                        │ Process                        │
│  · git_status              │  · list_processes              │
│  · git_log                 │  · kill_process                │
│  · git_diff                │                                │
├────────────────────────────┼────────────────────────────────│
│ Safety & Audit             │                                │
│  · get_audit_log           │                                │
│  · get_safety_config       │                                │
└────────────────────────────┴────────────────────────────────┘

★  run_command auto-creates a default session if session_id omitted
★★ write_file is the correct tool for creating files (not run_command)
```

Shell tools use persistent sessions. Git tools use `child_process.execFile` (stateless). FS tools use Node.js `fs` module directly. Audit tools are read-only (LLM cannot modify safety rules).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SHELL_MCP_CWD` | `process.cwd()` | Default working directory |
| `SHELL_MCP_SHELL` | auto-detected | Force a specific shell |
| `SHELL_MCP_MAX_SESSIONS` | `10` | Max concurrent sessions |
| `SHELL_MCP_TIMEOUT` | `1800000` | Session idle timeout (ms) |
| `SHELL_MCP_BLOCKLIST` | built-in | Extra blocked patterns (regex, comma-separated) |
| `SHELL_MCP_ALLOWLIST` | none | Only allow matching commands |
| `SHELL_MCP_WARN_PATTERNS` | built-in | Extra warning patterns |
| `SHELL_MCP_DEFAULT_DENY` | `false` | Block all commands not in allowlist |
| `SHELL_MCP_AUDIT` | `true` | Enable/disable audit logging |
| `SHELL_MCP_AUDIT_DIR` | `~/.shell-mcp/logs/` | Audit log directory |

## Daemon HTTP API (Full mode — planned)

```
POST   /sessions           → create session
GET    /sessions           → list all
GET    /sessions/:id       → get one
DELETE /sessions/:id       → kill session
POST   /sessions/:id/exec  → run command
GET    /sessions/:id/cwd   → current directory
GET    /health             → { status, uptime, sessions }

Binds to 127.0.0.1 ONLY. Never 0.0.0.0.
```

## Package Dependency Graph

```
                    @shell-mcp/core
                   (ShellSession, PtySession,
                    SessionManager, SafetyGuard,
                    AuditLogger, sentinel)
                    /              \
                   ▼                ▼
          @shell-mcp/mcp-lite    @shell-mcp/daemon
          (MCP stdio server,     (Express on :7777,
           sessions in-process,   sessions in daemon)
           safety + audit)
                                @shell-mcp/mcp-full
                                (MCP stdio server,
                                 HTTP proxy to daemon,
                                 NO dep on core/node-pty)

          shell-mcp (CLI)
          (init wizard, start/stop/status,
           service installer, NO dep on core)
```

## Monorepo Layout

```
shell-mcp/
├── .github/workflows/
│   ├── ci.yml              ← build on 3 OS x 2 Node versions
│   ├── publish.yml         ← auto-publish to npm on GitHub release
│   └── release.yml         ← auto-create release on version tag
├── packages/
│   ├── core/src/
│   │   ├── shell-session.ts    ← pipe-based session (default, smart timeout)
│   │   ├── pty-session.ts      ← PTY session (opt-in)
│   │   ├── session-manager.ts  ← manages sessions + wires safety/audit
│   │   ├── safety.ts           ← command blocklist/allowlist/warnings
│   │   ├── audit.ts            ← JSONL audit logger with rotation
│   │   ├── sentinel.ts         ← sentinel builder/parser (PTY mode)
│   │   ├── platform.ts         ← shell type detection
│   │   ├── shell-detect.ts     ← default shell detection
│   │   ├── ansi.ts             ← ANSI stripping (PTY mode only)
│   │   └── types.ts
│   ├── mcp-lite/src/
│   │   ├── server.ts           ← McpServer wiring
│   │   ├── index.ts            ← entry: SessionManager + stdio
│   │   └── tools/              ← session, fs, git, process, audit tools
│   ├── daemon/src/             ← (planned) Express HTTP daemon
│   └── mcp-full/src/           ← (planned) HTTP proxy MCP adapter
├── cli/src/                    ← (planned) CLI wizard
├── install/                    ← service templates (.plist, .service, .xml)
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
└── LICENSE
```

## CI/CD Pipeline

```
Push to main  ──►  CI workflow (build + verify on 6 matrix combos)
Push v* tag   ──►  Release workflow (create GitHub Release)
              ──►  Publish workflow (npm publish @shell-mcp/core + @shell-mcp/mcp-lite)
```

**Release process**:
```bash
# 1. Update version in package.json files
# 2. Commit
git tag v0.2.0
git push origin v0.2.0
# CI auto-creates GitHub Release + publishes to npm
```

## Build & Run (development)

```bash
git clone https://github.com/psdlabs/shell-mcp.git
cd shell-mcp
pnpm install
pnpm build           # builds all packages

# Run locally
node packages/mcp-lite/dist/index.js
```

## Cross-Platform Shell Handling

| Platform | Default Shell | Login Args | Sentinel Exit Code |
|----------|--------------|------------|-------------------|
| macOS    | zsh          | `-l`       | `$?`              |
| Linux    | bash         | `-l`       | `$?`              |
| Windows  | PowerShell   | (none)     | `$? + $LASTEXITCODE` combined |
| Windows  | cmd.exe      | (none)     | `%ERRORLEVEL%`    |

Windows shell detection: tries `pwsh` → `powershell.exe` (known path) → `cmd.exe`. Override with `SHELL_MCP_SHELL` env var.

## Key Design Decisions

- **Pipes over PTY by default**: LLMs don't need colors or TUI. Pipes give clean output with zero native deps.
- **Auto-session**: `run_command` works without calling `new_session` first. Eliminates the most common friction.
- **Safety guardrails built-in**: Blocks destructive commands before they execute. Customizable but secure by default.
- **Audit logging by default**: Every command logged. Users and the LLM can review what ran.
- **Smart timeout over fixed timeout**: Long-running commands survive while producing output.
- **write_file over run_command for files**: Tool descriptions guide the LLM to use the right tool.
- **node-pty is optional**: Only loaded when `usePty: true`. Install fails gracefully.
- **Daemon binds 127.0.0.1**: Security — never expose shell execution to the network.
- **mcp-full has no native deps**: Pure HTTP proxy. Doesn't import core or node-pty.
- **FS/git tools use Node APIs directly**: Not routed through shell. Avoids quoting issues, ANSI noise, binary corruption.
- **LLM cannot modify safety rules**: `get_safety_config` is read-only. Config comes from env vars only.
