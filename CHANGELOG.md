# Changelog

## 0.3.0 (2026-04-01)

### Breaking Changes

- **14 tools → 5 tools** — Stripped to the essentials. Removed `git_status`, `git_log`, `git_diff`, `list_processes`, `kill_process`, `list_dir`, `new_session`, `list_sessions`, `kill_session`. Your AI can do all of these through `run_command`.

### What remains

- `run_command` — The primary tool. Persistent shell, smart timeout, safety guardrails. Now auto-creates named sessions on demand (pass any `session_id`).
- `write_file` — Reliable file creation (shell can't do this well)
- `read_file` — Clean file reading
- `get_audit_log` — Command history
- `get_safety_config` — Safety rules (read-only)

### Why

Less tools = faster tool selection, fewer round trips, simpler codebase. The LLM already knows `git status`, `ls`, `ps`. Wrapper tools added complexity without value.

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
