# @shell-mcp/mcp-lite

**Give your AI a real terminal. One command. Zero config.**

Works with **Claude Desktop** · **Cursor** · **Windsurf** · **Zed** · any MCP client

## TL;DR

Your AI can write code but can't run it. This gives it a terminal.

```bash
npx -y @shell-mcp/mcp-lite --init
```

Restart your AI app. Done.

## Manual setup

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

## 5 tools

| Tool | Why |
|------|-----|
| `run_command` | Run any shell command. State persists. Git, npm, docker, anything. |
| `write_file` | Create/write files reliably (shell can't handle multiline well) |
| `read_file` | Read files without encoding issues |
| `get_audit_log` | View command history |
| `get_safety_config` | View safety rules (read-only) |

## Safety

Destructive commands blocked automatically. Risky commands warned. Every command logged. Customize with `SHELL_MCP_BLOCKLIST`, `SHELL_MCP_ALLOWLIST`, `SHELL_MCP_DEFAULT_DENY`.

## Config (all optional)

| Variable | Default | What it does |
|----------|---------|-------------|
| `SHELL_MCP_CWD` | cwd | Working directory |
| `SHELL_MCP_SHELL` | auto | Force a shell |
| `SHELL_MCP_BLOCKLIST` | built-in | Extra blocked patterns |
| `SHELL_MCP_ALLOWLIST` | none | Only allow these commands |
| `SHELL_MCP_DEFAULT_DENY` | `false` | Block everything not allowlisted |
| `SHELL_MCP_AUDIT` | `true` | Enable audit logging |

## Cross-platform

macOS (zsh) · Linux (bash) · Windows (PowerShell). Zero native dependencies.

## License

MIT · [GitHub](https://github.com/psdlabs/shell-mcp) · Built by [psdlabs](https://github.com/psdlabs)
