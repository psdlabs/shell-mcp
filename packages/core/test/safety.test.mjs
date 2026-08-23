import assert from "node:assert/strict";
import { test } from "node:test";
import { SafetyGuard } from "../dist/index.js";

function result(command, config, shell = "/bin/bash") {
  return new SafetyGuard(config).check(command, shell);
}

function assertBlocked(
  command,
  config,
  reason = /Command blocked/,
  shell = "/bin/bash"
) {
  const check = result(command, config, shell);
  assert.equal(check.allowed, false, `${command}: ${JSON.stringify(check)}`);
  if (reason) assert.match(check.reason ?? "", reason);
}

test("ordinary safe command is allowed", () => {
  assert.equal(result("echo safe").allowed, true);
});

test("built-in destructive pattern is blocked", () => {
  assertBlocked("rm -rf /", undefined, /destructive pattern/);
  assertBlocked("rm -rf /home", undefined, /destructive pattern/);
});

test("warning patterns still warn without blocking", () => {
  const check = result("sudo echo safe");
  assert.equal(check.allowed, true);
  assert.match(check.warning ?? "", /Potentially dangerous/);
});

test("custom blocklist and warning patterns apply to command units", () => {
  assertBlocked("echo safe; forbidden", { blocklist: ["forbidden"] });

  const check = result("echo safe; warnme", { warnPatterns: ["warnme"] });
  assert.equal(check.allowed, true);
  assert.match(check.warning ?? "", /warnme/);
});

test("custom allowlist matches whole command unit", () => {
  const guard = new SafetyGuard({ allowlist: ["echo.*"] });
  assert.equal(guard.check("echo safe").allowed, true);
  assert.equal(guard.check("printf echo safe").allowed, false);
  assert.equal(guard.check("prefix echo safe suffix").allowed, false);
  assert.equal(guard.check("echo safe; printf other").allowed, false);
});

test("compound operators do not become part of adjacent units", () => {
  const guard = new SafetyGuard({ allowlist: ["echo safe"] });
  assert.equal(guard.check("echo safe && echo safe").allowed, true);
  assert.equal(guard.check("echo safe || echo safe").allowed, true);
  assert.equal(guard.check("echo safe |& echo safe").allowed, true);
});

test("redirection operators stay within one command unit", () => {
  const cases = [
    ["echo safe 2>&1", "echo safe 2>&1"],
    ["echo safe 1>&2", "echo safe 1>&2"],
    ["echo safe 3<&0", "echo safe 3<&0"],
    ["echo safe >/tmp/out 2>&1", "echo safe >/tmp/out 2>&1"],
    ["echo safe &>/tmp/out", "echo safe &>/tmp/out"],
    ["echo safe &>>/tmp/out", "echo safe &>>/tmp/out"],
    ["&>/tmp/out echo safe", "&>/tmp/out echo safe"],
  ];

  for (const [command, allowPattern] of cases) {
    assert.equal(
      new SafetyGuard({ allowlist: [allowPattern] }).check(command).allowed,
      true,
      command
    );
  }
});

test("blocklist wins over allowlist", () => {
  assertBlocked("echo safe", {
    blocklist: ["echo"],
    allowlist: ["echo.*"],
  }, /destructive pattern/);
});

test("defaultDeny behavior is preserved", () => {
  assertBlocked("echo safe", { defaultDeny: true }, /Default-deny/);
  assert.equal(
    result("echo safe", { defaultDeny: true, allowlist: ["echo.*"] }).allowed,
    true
  );
});

test("compound command units are checked independently", () => {
  const cases = [
    "echo safe; rm -rf /home",
    "rm -rf /home; echo safe",
    "echo safe\nrm -rf /home",
    "echo safe && rm -rf /home",
    "echo safe || rm -rf /home",
    "echo safe | rm -rf /home",
    "echo safe & rm -rf /home",
  ];

  for (const command of cases) {
    assertBlocked(command, undefined, /destructive pattern/);
  }

  assert.equal(result("echo one; echo two").allowed, true);
  assert.equal(result("echo one && echo two").allowed, true);
  assert.equal(result("echo one || echo two").allowed, true);
  assert.equal(result("echo one | echo two").allowed, true);
});

test("quotes and escaped separators do not create command units", () => {
  assert.equal(result('echo "safe; still"').allowed, true);
  assert.equal(result("echo 'safe; still'").allowed, true);
  assert.equal(result(String.raw`echo safe\; still`).allowed, true);
  assertBlocked(String.raw`r"m" -rf /home`, undefined, /destructive pattern/);
});

test("fail-closed blocks dynamic shell constructs", () => {
  const commands = [
    'eval "echo safe"',
    "source ./safe.sh",
    ". ./safe.sh",
    'sh -c "echo safe"',
    'bash -c "echo safe"',
    'zsh -c "echo safe"',
    "command command eval 'echo safe'",
    "command command sh -c 'echo safe'",
    "exec command bash -c 'echo safe'",
    "env sh -c 'echo safe'",
    "env FOO=bar bash -c 'echo safe'",
    "nice sh -c 'echo safe'",
    "nohup sh -c 'echo safe'",
    "sudo sh -c 'echo safe'",
    "command env sh -c 'echo safe'",
    "time sh -c 'echo safe'",
    "$CMD safe",
    "$(printf echo) safe",
    "`printf echo` safe",
  ];

  for (const command of commands) {
    assertBlocked(command, undefined, /dynamic shell constructs/);
  }
});

test("fail-closed blocks shell state indirection mutations", () => {
  for (const command of ["alias foo=eval", "hash -p /bin/echo foo"]) {
    assertBlocked(command, undefined, /dynamic shell constructs/);
  }
});

test("fail-closed rejects parameter expansion in arguments", () => {
  assertBlocked('echo "$HOME"', undefined, /dynamic shell constructs/);
  assertBlocked('printf "%s" "$VALUE"', undefined, /dynamic shell constructs/);
});

test("unsupported shell syntax fails closed without POSIX tokenization", () => {
  assert.equal(result("echo safe", undefined, "powershell.exe").allowed, true);
  assert.equal(result("echo safe", undefined, "cmd.exe").allowed, true);
  assertBlocked(
    "echo safe; echo later",
    undefined,
    /dynamic shell constructs/,
    "powershell.exe"
  );
  assertBlocked(
    "echo safe & echo later",
    undefined,
    /dynamic shell constructs/,
    "cmd.exe"
  );
});

test("failClosed false preserves permissive dynamic fallback", () => {
  const guard = new SafetyGuard({ failClosed: false });
  const commands = [
    'eval "echo safe"',
    "source ./safe.sh",
    ". ./safe.sh",
    'bash -c "echo safe"',
    "command command eval 'echo safe'",
    "command command sh -c 'echo safe'",
    "exec command bash -c 'echo safe'",
    "env sh -c 'echo safe'",
    "env FOO=bar bash -c 'echo safe'",
    "nice sh -c 'echo safe'",
    "nohup sh -c 'echo safe'",
    "sudo sh -c 'echo safe'",
    "command env sh -c 'echo safe'",
    "time sh -c 'echo safe'",
    "alias foo=eval",
    "hash -p /bin/echo foo",
    "$CMD safe",
    "$(printf echo) safe",
    "`printf echo` safe",
  ];

  for (const command of commands) {
    assert.equal(guard.check(command).allowed, true, command);
  }
  assert.equal(
    guard.check("echo safe; echo later", "powershell.exe").allowed,
    true
  );

  assertBlocked("rm -rf /home", { failClosed: false }, /destructive pattern/);
});

test("failClosed defaults true and is inspectable", () => {
  assert.equal(new SafetyGuard().getConfig().failClosed, true);
  assert.equal(new SafetyGuard({ failClosed: false }).getConfig().failClosed, false);
});
