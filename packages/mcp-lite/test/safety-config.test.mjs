import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSafetyConfig } from "../dist/config.js";

test("SHELL_MCP_SAFETY_FAIL_CLOSED accepts documented values", () => {
  for (const value of ["true", "1"]) {
    assert.equal(
      parseSafetyConfig({ SHELL_MCP_SAFETY_FAIL_CLOSED: value }).failClosed,
      true
    );
  }
  for (const value of ["false", "0"]) {
    assert.equal(
      parseSafetyConfig({ SHELL_MCP_SAFETY_FAIL_CLOSED: value }).failClosed,
      false
    );
  }
});

test("invalid SHELL_MCP_SAFETY_FAIL_CLOSED fails config parsing", () => {
  assert.throws(
    () => parseSafetyConfig({ SHELL_MCP_SAFETY_FAIL_CLOSED: "yes" }),
    /SHELL_MCP_SAFETY_FAIL_CLOSED.*true.*1.*false.*0/
  );
});
