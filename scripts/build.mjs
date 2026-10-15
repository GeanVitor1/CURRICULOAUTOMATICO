import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
const require = createRequire(import.meta.url);
const productionEnv = { ...process.env, NODE_ENV: "production" };
async function run(file, args) {
  await new Promise((success, failure) => {
    const child = spawn(process.execPath, [file, ...args], {
      stdio: "inherit",
      windowsHide: true,
      env: productionEnv,
    });
    child.on("error", failure);
    child.on("exit", (code) =>
      code === 0
        ? success()
        : failure(new Error(`Build interrompido (código ${code}).`)),
    );
  });
}
await run(require.resolve("typescript/bin/tsc"), ["--noEmit"]);
await run(resolve("scripts/build-connector.mjs"), []);
await run(
  resolve(dirname(require.resolve("vite/package.json")), "bin/vite.js"),
  ["build"],
);
await run(resolve("scripts/precompress.mjs"), []);
await run(resolve("scripts/verify-secrets.mjs"), []);
await run(resolve("scripts/build-api.mjs"), []);
