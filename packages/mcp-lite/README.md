# @shell-mcp/mcp-lite

Give your AI a real terminal. One command. Zero config.

**Works with Claude Desktop · Cursor · Windsurf · Zed · any MCP client**

## Install

```bash
npx -y @shell-mcp/mcp-lite --init
```

Auto-detects your installed MCP clients and configures them. Restart your client. Done.

### Manual setup

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

## What you get

**5 tools** — lean by design:

- **`run_command`** — The workhorse. Run any command with persistent state. Git, npm, ls, curl — anything.
- **`write_file`** — Create/write files reliably (shell can't handle multiline content well)
- **`read_file`** — Read files without encoding issues
- **`get_audit_log`** — View command history
- **`get_safety_config`** — View safety rules (read-only)

## Safety built in

Destructive commands are blocked before they reach the shell. Risky commands run with warnings. Every command is logged to an audit trail. Customize with `SHELL_MCP_BLOCKLIST`, `SHELL_MCP_ALLOWLIST`, and `SHELL_MCP_DEFAULT_DENY`.

## Smart timeout

Commands auto-extend while producing output. Only times out after 15s of silence or 5 minutes total.

## Config

All optional — works with zero configuration.

| Variable | Default | Description |
|----------|---------|-------------|
| `SHELL_MCP_CWD` | cwd | Working directory |
| `SHELL_MCP_SHELL` | auto | Force shell (e.g. `powershell.exe`) |
| `SHELL_MCP_MAX_SESSIONS` | `10` | Max sessions |
| `SHELL_MCP_TIMEOUT` | `1800000` | Session idle timeout (ms) |
| `SHELL_MCP_BLOCKLIST` | built-in | Extra blocked patterns |
| `SHELL_MCP_ALLOWLIST` | — | Only allow these patterns |
| `SHELL_MCP_DEFAULT_DENY` | `false` | Block everything not in allowlist |
| `SHELL_MCP_AUDIT` | `true` | Enable audit logging |

## Cross-platform

macOS (zsh) · Linux (bash) · Windows (PowerShell). Zero native dependencies.

## License

MIT — [github.com/psdlabs/shell-mcp](https://github.com/psdlabs/shell-mcp)
