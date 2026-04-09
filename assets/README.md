# Assets

Place these files here for the README:

- **logo.png** — Project logo (120x120 recommended)
- **demo.gif** — Screen recording showing shell-mcp in action

## How to record demo.gif

1. Open Claude Desktop (or any MCP client)
2. Start a screen recorder (e.g., [LICEcap](https://www.cockos.com/licecap/), [Kap](https://getkap.co/), or [peek](https://github.com/phw/peek))
3. Ask the AI: "Check git status, then run npm test"
4. Show the AI running commands and getting results
5. Save as `demo.gif` (keep under 5MB for GitHub)

## Suggested demo flow

```
You: "Run npm install and then run the tests"
AI: [calls run_command("npm install")]
    [output streams...]
    [calls run_command("npm test")]  
    [output streams...]
    "All tests passed!"
```
