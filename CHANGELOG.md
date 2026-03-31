# Changelog

## 0.2.0 (2026-03-31)

### Features

- **One-liner install**: `npx -y @shell-mcp/mcp-lite --init` auto-detects Claude Desktop, Cursor, and Windsurf, writes config for you
- Auto-detects installed MCP clients by checking known config paths
- Skips clients that already have shell-mcp configured

## 0.1.0 (2026-03-31)

Initial release.

### Features

- **Persistent shell sessions** — State carries over between commands (cd, env vars, nvm use, conda activate)
- **Auto-session** — `run_command` creates a default session automatically, no setup needed
- **14 MCP tools** — Shell, filesystem, git, process management, audit, and safety
- **Safety guardrails** — Built-in blocklist for destructive commands, customizable allowlist/blocklist
- **Audit logging** — Every command logged to `~/.shell-mcp/logs/audit.jsonl` with auto-rotation
- **Smart timeout** — Auto-extends while output is flowing, times out on silence
- **Cross-platform** — macOS (zsh), Linux (bash), Windows (PowerShell)
- **Zero native dependencies** — Pipe-based sessions, no node-pty required
- **Streaming output** — `onOutput` callback for real-time output chunks
