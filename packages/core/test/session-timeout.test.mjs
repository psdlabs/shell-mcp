import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PtySession,
  SessionManager,
  ShellSession,
} from "../dist/index.js";

const isWindows = process.platform === "win32";
const shell = isWindows ? process.env.ComSpec ?? "cmd.exe" : "/bin/sh";
const cwd = process.cwd();
const fixture = fileURLToPath(
  new URL("./fixtures/timeout-child.sh", import.meta.url)
);
const nodeFixture = fileURLToPath(
  new URL("./fixtures/timeout-child.mjs", import.meta.url)
);

function shellQuote(value) {
  if (isWindows) return `"${value.replaceAll('"', '""')}"`;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function fixtureCommand(mode) {
  if (!isWindows) return `${shellQuote("/bin/sh")} ${shellQuote(fixture)} ${mode}`;
  return `${shellQuote(process.execPath)} ${shellQuote(nodeFixture)} ${mode}`;
}

function parsePids(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line))
    .map(Number);
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function forceKill(pid) {
  if (!isAlive(pid)) return;
  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Process exited during cleanup.
  }
}

async function waitForDead(pids) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    if (pids.every((pid) => !isAlive(pid))) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Processes still alive: ${pids.filter(isAlive).join(", ")}`);
}

async function cleanup(session, observedOutput, result) {
  const pids = parsePids(`${observedOutput}\n${result?.output ?? ""}`);
  session.kill();
  for (const pid of pids) forceKill(pid);
  await waitForDead(pids);
}

function newShellSession(name) {
  return new ShellSession({ name, shell, cwd });
}

test("idle timeout terminates foreground command and marks session dead", async () => {
  const session = newShellSession("idle-timeout");
  let observedOutput = "";
  let result;
  try {
    result = await session.exec(fixtureCommand("idle"), {
      smartTimeout: true,
      idleTimeoutMs: 200,
      maxTimeoutMs: 700,
      onOutput: (chunk) => {
        observedOutput += chunk;
      },
    });

    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, -1);
    assert.equal(session.isAlive(), false);
    assert.ok(result.durationMs < 600);
  } finally {
    await cleanup(session, observedOutput, result);
  }
});

test("idle timeout kills descendants in foreground process group", async () => {
  const session = newShellSession("descendant-timeout");
  let observedOutput = "";
  let result;
  try {
    result = await session.exec(fixtureCommand("descendant"), {
      smartTimeout: true,
      idleTimeoutMs: 200,
      maxTimeoutMs: 700,
      onOutput: (chunk) => {
        observedOutput += chunk;
      },
    });

    const pids = parsePids(`${observedOutput}\n${result.output}`);
    assert.ok(pids.length >= 2, `Expected parent and child PIDs: ${pids}`);
    assert.ok(result.durationMs < 600, `Timed out too late: ${result.durationMs}ms`);
    await waitForDead(pids);
    assert.equal(session.isAlive(), false);
  } finally {
    await cleanup(session, observedOutput, result);
  }
});

test("absolute max timeout terminates continuously-outputting command", async () => {
  const session = newShellSession("max-timeout");
  let observedOutput = "";
  let outputChunks = 0;
  let result;
  try {
    result = await session.exec(fixtureCommand("stdout"), {
      smartTimeout: true,
      idleTimeoutMs: 180,
      maxTimeoutMs: 500,
      onOutput: (chunk) => {
        observedOutput += chunk;
        outputChunks += 1;
      },
    });

    assert.equal(result.timedOut, true);
    assert.match(result.output, /MAX TIMEOUT/);
    assert.ok(result.durationMs >= 400, `Timed out too early: ${result.durationMs}ms`);
    const chunksAtResolve = outputChunks;
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(outputChunks, chunksAtResolve);
    assert.equal(session.isAlive(), false);
  } finally {
    await cleanup(session, observedOutput, result);
  }
});

test("stderr activity resets idle timeout without changing stdout callback semantics", async () => {
  const session = newShellSession("stderr-timeout");
  let observedOutput = "";
  let stdoutOutput = "";
  let stdoutChunks = 0;
  let result;
  try {
    result = await session.exec(fixtureCommand("stderr"), {
      smartTimeout: true,
      idleTimeoutMs: 150,
      maxTimeoutMs: 500,
      onOutput: (chunk) => {
        observedOutput += chunk;
        stdoutOutput += chunk;
        stdoutChunks += 1;
      },
    });

    assert.equal(result.timedOut, true);
    assert.match(result.output, /MAX TIMEOUT/);
    assert.match(result.output, /\[stderr\]/);
    assert.ok(result.durationMs >= 400, `stderr caused idle timeout: ${result.durationMs}ms`);
    assert.ok(stdoutChunks > 0);
    assert.equal(stdoutOutput.includes("stderr"), false);
    assert.equal(session.isAlive(), false);
  } finally {
    await cleanup(session, observedOutput, result);
  }
});

test("timed-out manager session rejects reuse and fresh session executes", async () => {
  const manager = new SessionManager({
    defaultShell: shell,
    defaultCwd: cwd,
    audit: { enabled: false },
  });
  let result;
  const pids = [];
  try {
    const first = await manager.createSession({ name: "default" });
    result = await manager.exec(first.id, fixtureCommand("idle"), {
      smartTimeout: true,
      idleTimeoutMs: 200,
      maxTimeoutMs: 700,
    });
    pids.push(...parsePids(result.output));

    assert.equal(result.timedOut, true);
    assert.equal(manager.getSession(first.id)?.alive, false);
    await assert.rejects(
      manager.exec(first.id, "echo stale", { smartTimeout: false, timeoutMs: 200 }),
      /has exited/
    );

    const fresh = await manager.createSession({ name: "default" });
    const success = await manager.exec(fresh.id, "echo fresh", {
      smartTimeout: false,
      timeoutMs: 200,
    });
    assert.notEqual(fresh.id, first.id);
    assert.equal(success.exitCode, 0);
    assert.match(success.output, /fresh/);
  } finally {
    manager.dispose();
    for (const pid of pids) forceKill(pid);
    await waitForDead(pids);
  }
});

test("successful commands preserve persistent shell state", async () => {
  const session = newShellSession("persistent-state");
  try {
    const first = await session.exec("echo success", {
      smartTimeout: false,
      timeoutMs: 200,
    });
    assert.equal(first.exitCode, 0);
    assert.match(first.output, /success/);

    const setState = isWindows
      ? "set SHELL_MCP_TEST_STATE=kept"
      : "export SHELL_MCP_TEST_STATE=kept";
    const readState = isWindows
      ? "echo %SHELL_MCP_TEST_STATE%"
      : "printf '%s' \"$SHELL_MCP_TEST_STATE\"";
    await session.exec(setState, { smartTimeout: false, timeoutMs: 200 });
    const second = await session.exec(readState, {
      smartTimeout: false,
      timeoutMs: 200,
    });
    assert.equal(second.exitCode, 0);
    assert.match(second.output, /kept/);
    assert.equal(session.isAlive(), true);
  } finally {
    await cleanup(session, "", undefined);
  }
});

test("PTY numeric timeout stays fixed and invalidates PTY session", async (t) => {
  const session = new PtySession({ name: "pty-timeout", shell, cwd });
  let result;
  let guardTimer;
  try {
    try {
      await session.init();
    } catch (error) {
      if (error instanceof Error && /Failed to load node-pty/.test(error.message)) {
        t.skip("node-pty unavailable");
        return;
      }
      throw error;
    }

    const timeoutGuard = new Promise((_, reject) => {
      guardTimer = setTimeout(
        () => reject(new Error("Numeric PTY timeout did not fire near requested duration")),
        1000
      );
    });
    result = await Promise.race([
      session.exec(fixtureCommand("idle"), 80),
      timeoutGuard,
    ]);
    clearTimeout(guardTimer);
    guardTimer = undefined;

    assert.equal(result.timedOut, true);
    assert.ok(result.durationMs >= 50, `Timed out too early: ${result.durationMs}ms`);
    assert.ok(result.durationMs < 500, `Numeric timeout ignored: ${result.durationMs}ms`);
    assert.equal(session.isAlive(), false);
  } finally {
    if (guardTimer) clearTimeout(guardTimer);
    await cleanup(session, "", result);
  }
});
