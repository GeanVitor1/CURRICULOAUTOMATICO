import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";
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
await run(
  resolve(dirname(require.resolve("vite/package.json")), "bin/vite.js"),
  ["build"],
);
await build({
  entryPoints: ["server/index.ts", "server/worker.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outdir: "dist-server",
  logLevel: "info",
});
