<p align="center">
  <img src="https://raw.githubusercontent.com/psdlabs/shell-mcp/main/assets/logo.png" alt="shell-mcp" width="120">
  <h1 align="center">shell-mcp</h1>
  <p align="center"><b>Give your AI a real terminal. One command. Zero config.</b></p>
</p>

<p align="center">
  <a href="https://github.com/psdlabs/shell-mcp/actions/workflows/ci.yml"><img src="https://github.com/psdlabs/shell-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@shell-mcp/mcp-lite"><img src="https://img.shields.io/npm/v/@shell-mcp/mcp-lite.svg?color=blue" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@shell-mcp/mcp-lite"><img src="https://img.shields.io/npm/dm/@shell-mcp/mcp-lite.svg?color=green" alt="downloads"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-Compatible-purple.svg" alt="MCP"></a>
</p>

<p align="center">
  Works with <b>Claude Desktop</b> · <b>Cursor</b> · <b>Windsurf</b> · <b>Zed</b> · <b>Cline</b> · any MCP client
</p>

---

## TL;DR

> Your AI can write code but can't run it. **shell-mcp** gives it a terminal.
>
> ```bash
> npx -y @shell-mcp/mcp-lite --init
> ```
> Restart your AI app. Done. Your AI can now run commands, install packages, use git, start servers, run tests — everything you do in a terminal.

---

## Demo

<!-- Replace with your recorded GIF -->
<p align="center">
  <img src="https://raw.githubusercontent.com/psdlabs/shell-mcp/main/assets/demo.gif" alt="shell-mcp demo" width="700">
</p>

<p align="center"><i>Ask your AI to run commands, install packages, commit code — it just works.</i></p>

---

## The Problem

You're using Claude Desktop and ask your AI to:

- "Run my tests"
- "Install that package"
- "Check the git status"
- "Start the dev server"

**It can't.** It has no terminal. You end up copy-pasting commands back and forth like it's 2005.

## The Fix

```bash
npx -y @shell-mcp/mcp-lite --init
```

That's literally it. This one command:

1. Auto-detects which AI apps you have installed
2. Configures them automatically
3. No JSON to edit, no config files to find

Just restart your AI app. It now has a terminal.

```
  shell-mcp -- init
  -----------------

  Claude Desktop    + Added
  Cursor            + Added
  Windsurf          + Added

  Restart your clients to activate.
```

---

## What can your AI do now?

Anything you can do in a terminal:

```
"Run npm install"                    ✓
"Start the dev server"               ✓
"Run the test suite"                 ✓
"Check git status and commit"        ✓
"List all running processes"         ✓
"Create a new React project"         ✓
"Build and deploy"                   ✓
"SSH into the server" (if you want)  ✓
```

State persists between commands — `cd`, environment variables, `nvm use`, `conda activate` all carry over. Just like a real terminal.

---

## 5 tools. That's all it needs.

Most MCP servers give AI 20+ tools. We give it 5. Here's why that's better.

| Tool | Why it exists |
|------|--------------|
| **`run_command`** | The workhorse. Runs any shell command — git, npm, curl, docker, make, anything. Your AI already knows how to use a terminal. |
| **`write_file`** | Shell is terrible at writing files (quoting, escaping, multiline). This does it reliably. |
| **`read_file`** | Reads files without encoding headaches. Cleaner than `cat`. |
| **`get_audit_log`** | Every command is logged. Your AI can review what happened. |
| **`get_safety_config`** | Shows active safety rules. Read-only — AI can't change them. |

**Why not more?** Your AI already knows `git status`, `ls -la`, `ps aux`, `kill`. Wrapping them in custom tools adds complexity without value. Give it a terminal and get out of the way.

---

## Safety first

Your AI has a terminal, but it's not unsupervised. Commands are checked **before** they execute.

### Blocked (never runs)
```
rm -rf /       ·  DROP DATABASE     ·  curl ... | bash
format C:      ·  dd of=/dev/sda    ·  :(){ :|:& };:
```

### Warned (runs with a flag)
```
sudo ...       ·  rm -rf            ·  git push --force
kill -9        ·  shutdown          ·  chmod 777
```

Every command — blocked or executed — is logged to `~/.shell-mcp/logs/audit.jsonl`.

### Lock it down

Want to restrict what your AI can run? Use allowlists:

```json
{
  "mcpServers": {
    "shell-mcp": {
      "command": "npx",
      "args": ["-y", "@shell-mcp/mcp-lite"],
      "env": {
        "SHELL_MCP_ALLOWLIST": "npm.*,git.*,node.*",
        "SHELL_MCP_DEFAULT_DENY": "true"
      }
    }
  }
}
```

Now only `npm`, `git`, and `node` commands are allowed. Everything else is blocked.

---

## Smart timeout

Other tools kill `npm install` after 30 seconds because of a fixed timeout. We don't.

```
Others:       |---- 30s fixed ---------| KILL (npm install dies mid-download)

shell-mcp:    |-- 15s --| reset |-- 15s --| reset |-- 15s --| done
                  ^ output    ^ output       ^ output
```

The timeout **resets every time output is produced**. Your command only dies after 15 seconds of complete silence or a 5-minute absolute cap.

---

## Works everywhere

| Platform | Default Shell | Status |
|----------|--------------|--------|
| macOS | zsh | Supported |
| Linux | bash | Supported |
| Windows | PowerShell | Supported |

Zero native dependencies. No build tools required. Just Node.js 20+.

---

## Configuration (all optional)

shell-mcp works out of the box. Customize only if you want to.

| Variable | Default | What it does |
|----------|---------|-------------|
| `SHELL_MCP_CWD` | current dir | Starting directory for sessions |
| `SHELL_MCP_SHELL` | auto-detect | Force a shell (`bash`, `zsh`, `powershell.exe`) |
| `SHELL_MCP_MAX_SESSIONS` | `10` | Max parallel sessions |
| `SHELL_MCP_BLOCKLIST` | built-in | Extra blocked patterns (comma-separated regex) |
| `SHELL_MCP_ALLOWLIST` | none | Only allow these commands (comma-separated regex) |
| `SHELL_MCP_DEFAULT_DENY` | `false` | Block everything not in allowlist |
| `SHELL_MCP_AUDIT` | `true` | Enable/disable audit logging |

Pass them as environment variables in your MCP config:

```json
{
  "mcpServers": {
    "shell-mcp": {
      "command": "npx",
      "args": ["-y", "@shell-mcp/mcp-lite"],
      "env": {
        "SHELL_MCP_CWD": "/path/to/project",
        "SHELL_MCP_SHELL": "bash"
      }
    }
  }
}
```

---

## Manual setup

If `--init` doesn't detect your client, or you prefer to configure manually:

<details>
<summary><b>Claude Desktop</b></summary>

Config file location:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Add this to the file:
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
</details>

<details>
<summary><b>Cursor</b></summary>

Config file: `~/.cursor/mcp.json`

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
</details>

<details>
<summary><b>Windsurf</b></summary>

Config file: `~/.windsurf/mcp.json`

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
</details>

---

## How it works (for the curious)

```
You ask: "Run my tests"
        |
        v
  AI calls run_command("npm test")
        |
        v
  Safety check (blocked? warned? ok?)
        |
        v
  Execute in persistent shell session
  (state carries over between commands)
        |
        v
  Smart timeout (auto-extends while output flows)
        |
        v
  Log to audit trail --> return result to AI
        |
        v
  AI reads output, decides what to do next
```

No PTY. No native dependencies. Just clean stdin/stdout pipes.

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/psdlabs/shell-mcp.git
cd shell-mcp
pnpm install
pnpm build
```

```
packages/
  core/        -- Session engine, safety, audit
  mcp-lite/    -- MCP server (what users install)
```

---

## FAQ

<details>
<summary><b>Is this safe?</b></summary>

Yes. Destructive commands are blocked before they execute. Every command is logged to an audit trail. You can lock it down further with allowlists and `DEFAULT_DENY` mode. The AI cannot modify safety rules — they're read-only.
</details>

<details>
<summary><b>Does it work with [my AI client]?</b></summary>

If your client supports MCP (Model Context Protocol), yes. The `--init` command auto-detects Claude Desktop, Cursor, and Windsurf. For others, add the JSON config manually.
</details>

<details>
<summary><b>What if a command hangs?</b></summary>

Smart timeout handles it. If a command produces no output for 15 seconds, it times out. There's also a 5-minute absolute cap. The AI gets a clear "TIMED OUT" status and can decide what to do.
</details>

<details>
<summary><b>Can I use it for CI/CD?</b></summary>

It's designed for interactive AI use, but there's nothing stopping you from using it in automation. Just configure the safety rules for your use case.
</details>

<details>
<summary><b>Do I need to install anything besides Node.js?</b></summary>

No. `npx` downloads and runs it automatically. You just need Node.js 20 or later.
</details>

---

## Star History

If this project helps you, consider giving it a star. It helps others find it.

[![Star History Chart](https://api.star-history.com/svg?repos=psdlabs/shell-mcp&type=Date)](https://star-history.com/#psdlabs/shell-mcp&Date)

---

## License

MIT -- do whatever you want with it.

---

<p align="center">
  Built by <a href="https://github.com/psdlabs"><b>psdlabs</b></a> · <a href="https://www.linkedin.com/in/prasanthsd">LinkedIn</a>
  <br>
  <a href="https://github.com/psdlabs/shell-mcp/issues">Report a bug</a> · <a href="https://github.com/psdlabs/shell-mcp/issues">Request a feature</a>
</p>
