<p align="center">
  <h1 align="center">shell-mcp</h1>
  <p align="center">Give your AI a real terminal. One command. Zero config.</p>
</p>

<p align="center">
  <a href="https://github.com/psdlabs/shell-mcp/actions/workflows/ci.yml"><img src="https://github.com/psdlabs/shell-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@shell-mcp/mcp-lite"><img src="https://img.shields.io/npm/v/@shell-mcp/mcp-lite.svg?color=blue" alt="npm"></a>
  <a href="https://www.npmjs.com/package/@shell-mcp/mcp-lite"><img src="https://img.shields.io/npm/dm/@shell-mcp/mcp-lite.svg?color=green" alt="downloads"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D20-green.svg" alt="Node.js"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-Compatible-purple.svg" alt="MCP"></a>
</p>

<p align="center">
  <b>Claude Desktop</b> · <b>Cursor</b> · <b>Windsurf</b> · <b>Zed</b> · <b>Cline</b> · any MCP client
</p>

---

## Why?

Your AI assistant can write code — but it can't **run** it. No terminal access means no `npm install`, no `git commit`, no test runs, no builds. You end up copy-pasting commands back and forth.

**shell-mcp fixes that.** It gives any MCP-compatible AI client a persistent terminal with safety guardrails. Your AI can run commands, read output, and keep going — just like a developer would.

---

## Install in 10 seconds

```bash
npx -y @shell-mcp/mcp-lite --init
```

That's it. No config files to edit. No JSON to copy-paste. It auto-detects your installed clients and configures them:

```
  shell-mcp — init
  ─────────────────

  Claude Desktop
    + Added shell-mcp
    ~/Library/Application Support/Claude/claude_desktop_config.json

  Cursor
    + Added shell-mcp
    ~/.cursor/mcp.json

  Windsurf
    + Added shell-mcp
    ~/.windsurf/mcp.json

  Restart your clients to activate.
```

Restart your AI client. Your AI now has a terminal.

> **Already know what you're doing?** Add this to your MCP config manually:
> ```json
> {
>   "mcpServers": {
>     "shell-mcp": {
>       "command": "npx",
>       "args": ["-y", "@shell-mcp/mcp-lite"]
>     }
>   }
> }
> ```

---

## What your AI gets

### 14 tools, zero setup

| Category | Tools | What they do |
|----------|-------|-------------|
| **Shell** | `run_command` | Run any command. State persists — `cd`, env vars, `nvm use` all carry over |
| | `new_session` · `list_sessions` · `kill_session` | Multiple parallel shell sessions |
| **Files** | `write_file` · `read_file` · `list_dir` | Create, read, and browse files without shell quoting headaches |
| **Git** | `git_status` · `git_log` · `git_diff` | Git operations with clean, structured output |
| **Process** | `list_processes` · `kill_process` | See what's running, stop what shouldn't be |
| **Safety** | `get_audit_log` · `get_safety_config` | Full transparency — every command is logged |

Your AI doesn't need to set anything up. `run_command` auto-creates a session on first use.

---

## Built-in safety

Commands are checked **before** they execute. Dangerous patterns never reach the shell.

```
✗ BLOCKED — never runs
  rm -rf /          ·  DROP DATABASE    ·  curl ... | bash
  format C:         ·  dd of=/dev/sda   ·  :(){ :|:& };:

⚠ WARNING — runs with a flag
  sudo ...          ·  rm -rf           ·  git push --force
  kill -9           ·  shutdown         ·  chmod 777
```

Every command — blocked or executed — is logged to an audit trail your AI can inspect.

### Customize rules

```json
{
  "mcpServers": {
    "shell-mcp": {
      "command": "npx",
      "args": ["-y", "@shell-mcp/mcp-lite"],
      "env": {
        "SHELL_MCP_BLOCKLIST": "docker rm,docker rmi",
        "SHELL_MCP_ALLOWLIST": "npm.*,git.*,node.*",
        "SHELL_MCP_DEFAULT_DENY": "true"
      }
    }
  }
}
```

Set `DEFAULT_DENY` to `true` and only allowlisted commands will run. Everything else is blocked.

---

## Smart timeout

Long-running commands don't get killed mid-download.

```
Traditional:  |── 30s fixed ──────────────────────| KILL
              (npm install dies mid-download)

shell-mcp:    |─ 15s ─| reset |─ 15s ─| reset |─ 15s ─| done ✓
                  ▲ output    ▲ output    ▲ output
```

The timeout resets every time output is produced. Commands only time out after **15 seconds of silence** or hitting the **5-minute absolute cap**.

---

## Audit log

Every command is logged to `~/.shell-mcp/logs/audit.jsonl`:

```json
{
  "timestamp": "2026-03-31T10:00:00Z",
  "sessionName": "default",
  "command": "npm install",
  "exitCode": 0,
  "durationMs": 12340,
  "cwd": "/home/user/project"
}
```

Your AI can call `get_audit_log` to review what happened. Logs auto-rotate at 10MB.

Disable with `SHELL_MCP_AUDIT=false`.

---

## Configuration

All optional. Works out of the box with zero config.

| Variable | Default | What it does |
|----------|---------|-------------|
| `SHELL_MCP_CWD` | current directory | Starting working directory |
| `SHELL_MCP_SHELL` | auto-detected | Force a specific shell (`bash`, `zsh`, `powershell.exe`) |
| `SHELL_MCP_MAX_SESSIONS` | `10` | Max concurrent sessions |
| `SHELL_MCP_TIMEOUT` | `1800000` | Session idle timeout in ms (30 min) |
| `SHELL_MCP_BLOCKLIST` | built-in | Extra blocked patterns (comma-separated regex) |
| `SHELL_MCP_ALLOWLIST` | — | Only allow matching commands (comma-separated regex) |
| `SHELL_MCP_WARN_PATTERNS` | built-in | Extra warning patterns (comma-separated regex) |
| `SHELL_MCP_DEFAULT_DENY` | `false` | Block everything not in allowlist |
| `SHELL_MCP_AUDIT` | `true` | Enable/disable audit logging |
| `SHELL_MCP_AUDIT_DIR` | `~/.shell-mcp/logs/` | Where audit logs are written |

---

## How it works

```
AI calls run_command("npm test")
        │
        ▼
  Auto-create session (if needed)
        │
        ▼
  Safety check ── BLOCKED? → return error, log it
        │ OK
        ▼
  Execute in persistent shell
  (state carries over between commands)
        │
        ▼
  Stream output with smart timeout
        │
        ▼
  Log to audit trail → return result to AI
```

Sessions use stdin/stdout pipes — **not** PTY. That means:
- Zero native dependencies
- No ANSI escape codes to strip
- No build tools required
- Works on **macOS**, **Linux**, and **Windows**

---

## Cross-platform

| Platform | Default Shell | Works? |
|----------|--------------|--------|
| macOS | zsh | ✓ |
| Linux | bash | ✓ |
| Windows | PowerShell | ✓ |

Override with `SHELL_MCP_SHELL` if needed.

---

## MCP client config locations

| Client | Config path |
|--------|------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Desktop (Linux) | `~/.config/Claude/claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.windsurf/mcp.json` |

Or just run `npx -y @shell-mcp/mcp-lite --init` and let it handle this for you.

---

## Development

```bash
git clone https://github.com/psdlabs/shell-mcp.git
cd shell-mcp
pnpm install
pnpm build
```

Run locally:
```bash
node packages/mcp-lite/dist/index.js
```

Architecture:
```
packages/
├── core/        — Session management, safety, audit (the engine)
└── mcp-lite/    — MCP server (this is what users install)
```

---

## License

MIT — do whatever you want with it.
