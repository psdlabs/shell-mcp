# shell-mcp

MCP server giving any MCP client persistent shell access via named sessions.

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
│  + SessionManager  │     │  + DaemonClient ──HTTP──┼──┐
│  + Shell Sessions  │     │  (stateless proxy)     │  │
│    (in-process)    │     └────────────────────────┘  │
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

**Lite** — MCP server + sessions in one process. Sessions reset on client restart. Zero setup.

**Full** — Daemon owns sessions over HTTP. MCP adapter is a stateless proxy. Sessions survive restarts.

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

How we know a command finished and what its exit code was:

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
  SessionManager.exec(sid, "npm test")
         │
         ▼
  ShellSession.exec()
   ├─ generate sentinel UUID
   ├─ write command + sentinel echo to stdin
   ├─ buffer stdout until sentinel line appears
   ├─ parse exit code + cwd from sentinel
   └─ return { output, exitCode, cwd, durationMs }
         │
         ▼
  MCP response back to LLM
```

Auto-session means the LLM needs only 1 tool call, not 2.

## MCP Tools (12 total)

```
┌─────────────────────────────────────────────────────────┐
│ Shell (core value)         │ Filesystem                 │
│  · run_command ★           │  · read_file               │
│  · new_session             │  · write_file              │
│  · list_sessions           │  · list_dir                │
│  · kill_session            │                            │
├────────────────────────────┼────────────────────────────│
│ Git                        │ Process                    │
│  · git_status              │  · list_processes          │
│  · git_log                 │  · kill_process            │
│  · git_diff                │                            │
└────────────────────────────┴────────────────────────────┘

★ run_command auto-creates a default session if session_id omitted
```

Shell tools use persistent sessions. Git tools use `child_process.execFile` (stateless). FS tools use Node.js `fs` module directly.

## Daemon HTTP API (Full mode)

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
                    SessionManager, sentinel)
                    /              \
                   ▼                ▼
          @shell-mcp/mcp-lite    @shell-mcp/daemon
          (MCP stdio server,     (Express on :7777,
           sessions in-process)   sessions in daemon)

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
├── packages/
│   ├── core/src/
│   │   ├── shell-session.ts    ← pipe-based session (default)
│   │   ├── pty-session.ts      ← PTY session (opt-in)
│   │   ├── session-manager.ts  ← manages multiple sessions
│   │   ├── sentinel.ts         ← sentinel builder/parser (PTY mode)
│   │   ├── platform.ts         ← shell type detection
│   │   ├── shell-detect.ts     ← default shell detection
│   │   ├── ansi.ts             ← ANSI stripping (PTY mode only)
│   │   └── types.ts
│   ├── mcp-lite/src/
│   │   ├── server.ts           ← McpServer wiring
│   │   ├── index.ts            ← entry: SessionManager + stdio
│   │   └── tools/              ← session, fs, git, process tools
│   ├── daemon/src/
│   │   ├── app.ts              ← Express app factory
│   │   ├── index.ts            ← entry: listen on 127.0.0.1:7777
│   │   └── routes/             ← sessions.ts, health.ts
│   └── mcp-full/src/
│       ├── daemon-client.ts    ← HTTP client (fetch)
│       ├── server.ts           ← McpServer wiring
│       ├── index.ts            ← entry: health check + stdio
│       └── tools/              ← same tools, session ops via HTTP
├── cli/src/
│   ├── index.ts                ← commander CLI
│   ├── config.ts               ← ~/.shell-mcp/config.json
│   ├── service-installer.ts    ← launchd/systemd/Task Scheduler
│   └── commands/               ← init, start, status, logs, upgrade, uninstall
└── install/                    ← service templates (.plist, .service, .xml)
```

## Build & Run

```bash
pnpm install
pnpm build           # builds all packages

# Lite mode (direct)
node packages/mcp-lite/dist/index.js

# Full mode
node packages/daemon/dist/index.js    # start daemon
node packages/mcp-full/dist/index.js  # start MCP adapter

# CLI
node cli/dist/index.js init
```

## Cross-Platform Shell Handling

| Platform | Default Shell | Login Args | Sentinel Exit Code |
|----------|--------------|------------|-------------------|
| macOS    | zsh          | `-l`       | `$?`              |
| Linux    | bash         | `-l`       | `$?`              |
| Windows  | PowerShell   | (none)     | `$? + $LASTEXITCODE` combined |
| Windows  | cmd.exe      | (none)     | `%ERRORLEVEL%`    |

## Key Design Decisions

- **Pipes over PTY by default**: LLMs don't need colors or TUI. Pipes give clean output with zero native deps.
- **Auto-session**: `run_command` works without calling `new_session` first. Eliminates the most common friction.
- **node-pty is optional**: Only loaded when `usePty: true`. Install fails gracefully.
- **Daemon binds 127.0.0.1**: Security — never expose shell execution to the network.
- **mcp-full has no native deps**: Pure HTTP proxy. Doesn't import core or node-pty.
- **FS/git tools use Node APIs directly**: Not routed through shell. Avoids quoting issues, ANSI noise, binary corruption.
