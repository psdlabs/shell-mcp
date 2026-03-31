# @shell-mcp/mcp-lite

MCP server that gives AI clients persistent shell access with safety guardrails.

**Works with Claude Desktop, Cursor, Windsurf, Zed, and any MCP client.**

## Install

Add to your MCP client config:

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

That's it. Restart your client.

## What You Get

**14 tools** your AI can use:

- **`run_command`** — Run shell commands. State persists (cd, env vars carry over). Auto-creates a session.
- **`write_file`** / **`read_file`** / **`list_dir`** — File operations (no shell quoting issues)
- **`git_status`** / **`git_log`** / **`git_diff`** — Git operations
- **`list_processes`** / **`kill_process`** — Process management
- **`new_session`** / **`list_sessions`** / **`kill_session`** — Multiple parallel sessions
- **`get_audit_log`** / **`get_safety_config`** — Audit trail and safety inspection

## Safety

Destructive commands are blocked automatically (`rm -rf /`, `DROP DATABASE`, `curl | bash`, etc.). Risky commands trigger warnings. Customize via environment variables.

## Smart Timeout

Commands auto-extend their timeout while producing output. `npm install` won't get killed — it only times out after 15s of silence or 5 minutes total.

## Audit Trail

Every command logged to `~/.shell-mcp/logs/audit.jsonl`. Auto-rotates at 10MB.

## Config

| Variable | Default | Description |
|----------|---------|-------------|
| `SHELL_MCP_CWD` | cwd | Working directory |
| `SHELL_MCP_SHELL` | auto | Force shell (e.g. `powershell.exe`) |
| `SHELL_MCP_MAX_SESSIONS` | 10 | Max sessions |
| `SHELL_MCP_BLOCKLIST` | built-in | Extra blocked patterns |
| `SHELL_MCP_ALLOWLIST` | none | Only allow these patterns |
| `SHELL_MCP_DEFAULT_DENY` | false | Block everything not in allowlist |
| `SHELL_MCP_AUDIT` | true | Enable audit logging |

Full docs: [github.com/psdlabs/shell-mcp](https://github.com/psdlabs/shell-mcp)

## License

MIT
