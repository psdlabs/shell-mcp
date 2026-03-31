# shell-mcp

[![CI](https://github.com/psdlabs/shell-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/psdlabs/shell-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-blue.svg)]()
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io)

MCP server that gives AI clients (Claude Desktop, Cursor, Windsurf, Zed, Cline) persistent shell access with safety guardrails.

**One line to install. Zero config. Sessions persist across commands.**

## Quick Start

### Claude Desktop

Add to your `claude_desktop_config.json`:

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

Config file location:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Restart Claude Desktop. Done.

### Cursor / Windsurf

Add to `.cursor/mcp.json` or `.windsurf/mcp.json` in your project:

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

## What It Does

After installing, your AI client gets **14 tools**:

| Tool | What it does |
|------|-------------|
| `run_command` | Run any shell command. State persists (cd, env vars, nvm use carry over) |
| `write_file` | Create/write files (HTML, CSS, JS, configs — any content) |
| `read_file` | Read file contents |
| `list_dir` | List directory contents with metadata |
| `git_status` | Git status (porcelain v2) |
| `git_log` | Recent commit history |
| `git_diff` | Show diffs (staged, unstaged, between refs) |
| `list_processes` | List running processes |
| `kill_process` | Send signals to processes |
| `new_session` | Create additional named shell sessions |
| `list_sessions` | List active sessions |
| `kill_session` | Terminate a session |
| `get_audit_log` | View command execution history |
| `get_safety_config` | View active safety rules |

The AI doesn't need to call `new_session` first — `run_command` auto-creates a default session.

## Safety Guardrails

Commands are checked before execution. Destructive patterns are **blocked automatically**:

```
rm -rf /          → BLOCKED
DROP DATABASE     → BLOCKED
curl ... | bash   → BLOCKED
format C:         → BLOCKED
dd of=/dev/sda    → BLOCKED
```

Risky commands trigger **warnings** but still run:

```
sudo ...          → WARNING
rm -rf            → WARNING
git push --force  → WARNING
kill -9           → WARNING
```

### Customize

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

## Smart Timeout

Long-running commands (`npm install`, `docker build`) don't get killed at 30 seconds. The timeout resets every time the command produces output. It only times out after **15 seconds of silence** or hitting the **5 minute absolute cap**.

## Audit Logging

Every command is logged to `~/.shell-mcp/logs/audit.jsonl`:

```json
{"timestamp":"2026-03-31T10:00:00Z","sessionName":"default","command":"npm install","exitCode":0,"durationMs":12340,"cwd":"/home/user/project"}
```

The AI can call `get_audit_log` to review what ran. Logs auto-rotate at 10MB.

Disable with `SHELL_MCP_AUDIT=false`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SHELL_MCP_CWD` | `process.cwd()` | Default working directory |
| `SHELL_MCP_SHELL` | auto-detected | Force a specific shell (e.g. `powershell.exe`) |
| `SHELL_MCP_MAX_SESSIONS` | `10` | Max concurrent sessions |
| `SHELL_MCP_TIMEOUT` | `1800000` | Session idle timeout (ms) |
| `SHELL_MCP_BLOCKLIST` | built-in | Extra blocked command patterns (comma-separated regex) |
| `SHELL_MCP_ALLOWLIST` | none | Only allow matching commands (comma-separated regex) |
| `SHELL_MCP_WARN_PATTERNS` | built-in | Extra warning patterns (comma-separated regex) |
| `SHELL_MCP_DEFAULT_DENY` | `false` | Block all commands not in allowlist |
| `SHELL_MCP_AUDIT` | `true` | Enable/disable audit logging |
| `SHELL_MCP_AUDIT_DIR` | `~/.shell-mcp/logs/` | Audit log directory |

## How It Works

```
LLM calls run_command("npm test")
        │
        ▼
  Auto-create default session (if needed)
        │
        ▼
  Safety check ── BLOCKED? → return error
        │ OK
        ▼
  Write command + sentinel to shell stdin
        │
        ▼
  Buffer stdout until sentinel appears
  (smart timeout: reset on each output chunk)
        │
        ▼
  Parse exit code + CWD from sentinel
        │
        ▼
  Log to audit trail
        │
        ▼
  Return result to LLM
```

Sessions use stdin/stdout pipes (not PTY), so:
- Zero native dependencies
- No ANSI escape codes to strip
- No build tools required
- Works on macOS, Linux, and Windows

## Architecture

```
packages/
├── core/        — Session management, safety, audit (the engine)
├── mcp-lite/    — MCP server, all-in-one (this is what you install)
├── daemon/      — HTTP daemon for Full mode (coming soon)
└── mcp-full/    — MCP adapter for daemon (coming soon)
```

**Lite mode** (current release): MCP server + sessions in one process. Zero config.

**Full mode** (planned): Daemon owns sessions. MCP adapter proxies over HTTP. Sessions survive client restarts.

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

## License

MIT
