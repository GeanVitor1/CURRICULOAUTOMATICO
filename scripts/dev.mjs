import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
const require = createRequire(import.meta.url);
const tsx = require.resolve("tsx/cli");
const vite = resolve(
  dirname(require.resolve("vite/package.json")),
  "bin/vite.js",
);
const children = [
  spawn(process.execPath, [tsx, "watch", "server/index.ts"], {
    stdio: "inherit",
    windowsHide: true,
  }),
  spawn(process.execPath, [vite, "--host", "127.0.0.1"], {
    stdio: "inherit",
    windowsHide: true,
  }),
];
function stop() {
  children.forEach((child) => child.kill());
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) =>
  child.on("exit", (code) => {
    stop();
    process.exitCode = code || 0;
  }),
);
