import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
const fixture = fileURLToPath(import.meta.url);

console.log(process.pid);

switch (mode) {
  case "idle":
    setInterval(() => {}, 1000);
    break;
  case "descendant": {
    const child = spawn(process.execPath, [fixture, "child"], {
      stdio: "ignore",
    });
    console.log(child.pid);
    setInterval(() => {}, 1000);
    break;
  }
  case "child":
    setInterval(() => {}, 1000);
    break;
  case "stdout":
    setInterval(() => process.stdout.write("stdout\n"), 15);
    break;
  case "stderr":
    setInterval(() => process.stderr.write("stderr\n"), 15);
    break;
  default:
    throw new Error(`Unknown fixture mode: ${mode}`);
}
