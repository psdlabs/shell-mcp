# Changelog

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
