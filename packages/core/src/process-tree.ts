import { spawnSync } from "node:child_process";
import { isWindows } from "./platform.js";

function killProcess(pid: number): void {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The process may have exited between the group and PID attempts.
  }
}

/**
 * Terminate a process and its descendants using the platform's process-tree
 * primitive. Callers invalidate their session before invoking this helper.
 */
export function terminateProcessTree(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 1) return;

  if (isWindows()) {
    try {
      const result = spawnSync(
        "taskkill",
        ["/pid", String(pid), "/t", "/f"],
        { stdio: "ignore", windowsHide: true }
      );
      if (!result.error && result.status === 0) return;
    } catch {
      // Fall back to the PID if taskkill is unavailable or the process exited.
    }
    killProcess(pid);
    return;
  }

  try {
    // Unix sessions are spawned as detached process-group leaders.
    process.kill(-pid, "SIGKILL");
  } catch {
    // The group may already be gone, or a PTY implementation may not expose
    // its child as a process-group leader.
    killProcess(pid);
  }
}
