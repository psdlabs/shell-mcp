import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SessionManager } from "../../core/dist/index.js";
import { registerSessionTools } from "../dist/tools/session-tools.js";

const isWindows = process.platform === "win32";
const shell = isWindows ? process.env.ComSpec ?? "cmd.exe" : "/bin/sh";
const cwd = process.cwd();
const shellFixture = fileURLToPath(
  new URL("../../core/test/fixtures/timeout-child.sh", import.meta.url)
);
const nodeFixture = fileURLToPath(
  new URL("../../core/test/fixtures/timeout-child.mjs", import.meta.url)
);

function shellQuote(value) {
  if (isWindows) return `"${value.replaceAll('"', '""')}"`;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function idleCommand() {
  if (isWindows) {
    return `${shellQuote(process.execPath)} ${shellQuote(nodeFixture)} idle`;
  }
  return `${shellQuote("/bin/sh")} ${shellQuote(shellFixture)} idle`;
}

test("default tool session is recreated after timeout", async () => {
  const manager = new SessionManager({
    defaultShell: shell,
    defaultCwd: cwd,
    audit: { enabled: false },
  });
  const handlers = new Map();
  const server = {
    tool(...args) {
      handlers.set(args[0], args.at(-1));
    },
  };

  try {
    registerSessionTools(server, manager);
    const runCommand = handlers.get("run_command");
    assert.equal(typeof runCommand, "function");

    const timedOut = await runCommand({
      command: idleCommand(),
      timeout_ms: 200,
    });
    const firstText = timedOut.content[0].text;
    const firstSession = firstText.match(/^Session: (.+)$/m)?.[1];
    assert.match(firstText, /Status: TIMED OUT/);
    assert.ok(firstSession);

    const fresh = await runCommand({ command: "echo fresh", timeout_ms: 200 });
    const freshText = fresh.content[0].text;
    const freshSession = freshText.match(/^Session: (.+)$/m)?.[1];
    assert.equal(freshSession && freshSession !== firstSession, true);
    assert.match(freshText, /Exit code: 0/);
    assert.match(freshText, /fresh/);
  } finally {
    manager.dispose();
  }
});
