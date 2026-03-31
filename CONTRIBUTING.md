# Contributing to shell-mcp

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/psdlabs/shell-mcp.git
cd shell-mcp
pnpm install
pnpm build
```

Requires Node.js >= 20 and pnpm.

## Project Structure

```
packages/
├── core/        — Session management, safety guardrails, audit logging
├── mcp-lite/    — MCP server (all-in-one, this is the main package)
├── daemon/      — HTTP daemon (Full mode, not yet released)
├── mcp-full/    — MCP adapter for daemon (not yet released)
cli/             — CLI tool (not yet released)
```

## Making Changes

1. Fork and clone the repo
2. Create a branch: `git checkout -b my-feature`
3. Make your changes in the relevant `packages/*/src/` directory
4. Build: `pnpm build`
5. Test locally: `node packages/mcp-lite/dist/index.js`
6. Commit with a clear message
7. Open a pull request

## Testing Locally with Claude Desktop

Point your Claude Desktop config to the local build:

```json
{
  "mcpServers": {
    "shell-mcp": {
      "command": "node",
      "args": ["/path/to/shell-mcp/packages/mcp-lite/dist/index.js"]
    }
  }
}
```

## Guidelines

- Keep changes focused — one feature or fix per PR
- Follow existing code style
- Don't add dependencies unless absolutely necessary
- Core package must remain zero-native-dep by default (node-pty stays optional)

## Reporting Issues

Open an issue on GitHub with:
- What you expected
- What happened
- Your OS, Node.js version, and MCP client

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
